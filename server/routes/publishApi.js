/**
 * Publish API Routes
 * /api/projects/:projectId/publish-draft, generate-publish-info, generate-thumbnail, upload-thumbnail, thumbnail
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { spawn } = require('child_process');

const db = require('../database-supabase');
const config = require('../config');
const { isValidUUID, getProjectPath } = config;
const { authenticate } = require('../authMiddleware');
const { checkProjectOwnership } = require('../middleware/projectChecks');
const { gitCommitAsync } = require('../utils/git');
const { aiRateLimiter } = require('../rateLimiter');
const { supabaseAdmin } = require('../supabaseClient');
const r2Client = require('../r2Client');
const r2Publisher = require('../r2Publisher');
const upload = require('../middleware/uploads');

// Lazy-load Modal client (only when USE_MODAL=true)
let modalClient = null;
function getModalClient() {
  if (!modalClient) {
    modalClient = require('../modalClient');
  }
  return modalClient;
}

// ==================== Publish Draft ====================

// Get publish draft
router.get('/:projectId/publish-draft', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;
  const draft = await db.getPublishDraft(req.supabase, projectId);
  res.json(draft || null);
});

// Save publish draft
router.put('/:projectId/publish-draft', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;
  const draftData = req.body;

  try {
    // Save to database
    await db.savePublishDraft(req.supabase, projectId, draftData);

    // Also save to project directory as PUBLISH.json and commit to Git
    const projectDir = getProjectPath(req.user.id, projectId);
    const publishPath = path.join(projectDir, 'PUBLISH.json');

    // Save publish data as JSON
    const publishData = {
      title: draftData.title || '',
      description: draftData.description || '',
      howToPlay: draftData.howToPlay || '',
      tags: draftData.tags || [],
      visibility: draftData.visibility || 'public',
      remix: draftData.remix || 'allowed',
      thumbnailUrl: draftData.thumbnailUrl || null,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(publishPath, JSON.stringify(publishData, null, 2), 'utf-8');

    // Commit to Git (non-blocking, safe)
    gitCommitAsync(projectDir, 'Update publish info', ['PUBLISH.json']);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving publish draft:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Generate Publish Info (AI) ====================

// Generate title, description, tags using Claude CLI (Haiku)
router.post('/:projectId/generate-publish-info', authenticate, checkProjectOwnership, aiRateLimiter, async (req, res) => {
  const { projectId } = req.params;

  try {
    // Read project files from GCE first
    const projectDir = getProjectPath(req.user.id, projectId);
    let gameCode = '';
    let specContent = '';

    // Read index.html
    const indexPath = path.join(projectDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      gameCode = fs.readFileSync(indexPath, 'utf-8');
    }

    // Read spec content (try specs/game.md first, then spec.md)
    const specPaths = [
      path.join(projectDir, 'specs', 'game.md'),
      path.join(projectDir, 'spec.md')
    ];
    for (const specPath of specPaths) {
      if (fs.existsSync(specPath)) {
        specContent = fs.readFileSync(specPath, 'utf-8');
        break;
      }
    }

    // Use Modal when enabled
    if (config.USE_MODAL) {
      const modal = getModalClient();
      if (!modal) {
        console.error('[generate-publish-info] Modal client not available');
        return res.status(503).json({ error: 'AI service temporarily unavailable' });
      }
      const result = await modal.generatePublishInfo({
        user_id: req.user.id,
        project_id: projectId,
        project_name: req.project.name,
        game_code: gameCode,
        spec_content: specContent,
      });

      // Check for error in response
      if (result.error) {
        console.error('Error generating publish info:', result.error);
        return res.status(500).json({ error: result.error, raw: result.raw || '' });
      }

      return res.json(result);
    }

    // 本番環境ではローカル実行禁止
    if (config.IS_PRODUCTION) {
      console.error('[generate-publish-info] Local execution not allowed in production');
      return res.status(503).json({ error: 'AI service temporarily unavailable' });
    }

    // 開発環境のみローカルフォールバック
    console.warn('[DEV] Using local CLI for generate-publish-info');

    const prompt = `以下のゲームプロジェクトの情報から、公開用のタイトル、概要、ルールと操作方法、タグを生成してください。

プロジェクト名: ${req.project.name}

${specContent ? `仕様書:\n${specContent}\n` : ''}
${gameCode ? `ゲームコード（抜粋）:\n${gameCode.slice(0, 3000)}\n` : ''}

以下のJSON形式で回答してください（JSONのみ、他のテキストは不要）:
{
  "title": "魅力的なゲームタイトル（50文字以内）",
  "description": "ゲームの概要説明（200文字程度、特徴や魅力を含む）",
  "howToPlay": "ルールと操作方法（300文字程度、具体的な操作方法とゲームのルールを説明）",
  "tags": ["タグ1", "タグ2", "タグ3"]
}

タグは3〜5個、それぞれ10文字以内で。`;

    const claude = spawn('claude', [
      '--print',
      '--model', 'haiku',
      '--dangerously-skip-permissions'
    ], {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    claude.stdin.write(prompt);
    claude.stdin.end();

    let output = '';
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.on('close', (code) => {
      try {
        // Extract JSON from response
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          res.json(result);
        } else {
          res.status(500).json({ error: 'Failed to parse AI response', raw: output });
        }
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse JSON', raw: output });
      }
    });

    claude.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });

  } catch (error) {
    console.error('Error generating publish info:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Generate Thumbnail (Nano Banana) ====================

// Generate thumbnail using Nano Banana
router.post('/:projectId/generate-thumbnail', authenticate, checkProjectOwnership, aiRateLimiter, async (req, res) => {
  const { projectId } = req.params;
  const { title } = req.body;

  try {
    // Get spec.md if exists
    const projectDir = getProjectPath(req.user.id, projectId);
    // Try specs/game.md first, then spec.md for backwards compatibility
    let specContent = '';
    const specPaths = [
      path.join(projectDir, 'specs', 'game.md'),
      path.join(projectDir, 'spec.md')
    ];
    for (const specPath of specPaths) {
      if (fs.existsSync(specPath)) {
        specContent = fs.readFileSync(specPath, 'utf-8');
        break;
      }
    }

    // Get project assets for reference images
    const projectAssets = await db.getProjectAssets(req.supabase, projectId);
    const assetPaths = [];

    for (const asset of projectAssets) {
      if (asset.is_deleted) continue;
      if (!asset.mime_type || !asset.mime_type.startsWith('image/')) continue;

      // Add asset path for reference
      if (asset.storage_path && fs.existsSync(asset.storage_path)) {
        assetPaths.push(asset.storage_path);
      }
    }

    // Limit to 3 reference images for speed
    const limitedAssetPaths = assetPaths.slice(0, 3);

    // First, use Claude to generate a good image prompt
    const refImageInstruction = limitedAssetPaths.length > 0
      ? `
重要: このゲームには${limitedAssetPaths.length}枚の参照画像が提供されます。
仕様書の「ビジュアルアセット」セクションに各画像の役割が記載されています。
プロンプトには「参照画像1のXXを中央に配置」「参照画像2のYYを背景に」のように、
各参照画像をどのように使ってサムネイルを構成するか具体的に指示してください。`
      : '';

    const promptGeneratorPrompt = `あなたは画像生成AIへのプロンプトを作成するアシスタントです。
以下のゲーム情報を元に、サムネイル画像生成用のプロンプトを作成してください。

タイトル: ${title || req.project.name}
${specContent ? `仕様書:\n${specContent.slice(0, 3000)}\n` : ''}${refImageInstruction}

要件:
- 縦長（9:16）のサムネイル向けレイアウト
- アプリストア用サムネイルとして使える品質
${limitedAssetPaths.length > 0 ? `- 参照画像が${limitedAssetPaths.length}枚提供されるので、それぞれをどう使うか指示する
- 「参照画像1の○○を～に配置」のように具体的に指示` : ''}

出力: プロンプトのみ（説明不要）`;

    // Step 1: Generate image prompt with Modal Haiku
    console.log('[Thumbnail] Generating prompt with Modal Haiku...');
    let imagePrompt = '';
    const modal = getModalClient();
    if (!modal) {
      console.error('[Thumbnail] Modal client not available');
      return res.status(503).json({ error: 'AI service temporarily unavailable' });
    }
    try {
      const haikuResult = await modal.chatHaiku({
        message: promptGeneratorPrompt,
        system_prompt: 'あなたは画像生成AIへのプロンプトを作成する専門家です。ゲームのサムネイル画像用の高品質なプロンプトを生成してください。プロンプトのみを出力し、説明は不要です。',
        raw_output: true,
      });
      imagePrompt = (haikuResult.result || '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^\*+|\*+$/g, '')
        .trim();
      console.log('[Thumbnail] Haiku generated prompt:', imagePrompt.slice(0, 200) + '...');
    } catch (haikuErr) {
      console.error('[Thumbnail] Haiku error, using fallback prompt:', haikuErr.message);
      // Fallback: use a simple prompt based on title/spec
      imagePrompt = `ゲーム「${title || req.project.name}」のサムネイル。縦長9:16、アプリストア向け高品質イラスト。`;
    }

    if (imagePrompt.length < 20) {
      imagePrompt = `ゲーム「${title || req.project.name}」のサムネイル。縦長9:16、アプリストア向け高品質イラスト。`;
    }

    console.log('[Thumbnail] Image prompt:', imagePrompt);
    console.log('[Thumbnail] Reference images:', limitedAssetPaths.length);

    // Step 2: Generate image with Nano Banana
    const outputPath = path.join(projectDir, 'thumbnail.png');
    const nanoBananaScript = path.join(__dirname, '..', '..', '.claude', 'skills', 'nanobanana', 'generate.py');
    const nanoBananaVenvPython = path.join(__dirname, '..', '..', '.claude', 'skills', 'nanobanana', '.venv', 'bin', 'python');
    const nanoBananaPython = fs.existsSync(nanoBananaVenvPython) ? nanoBananaVenvPython : 'python3';

    const nanoBananaArgs = [
      nanoBananaScript,
      imagePrompt,
      '-a', '9:16',
      '-o', outputPath
    ];

    if (limitedAssetPaths.length > 0) {
      nanoBananaArgs.push('--refs', ...limitedAssetPaths);
    }

    const nanoBanana = spawn(nanoBananaPython, nanoBananaArgs, {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    let nbOutput = '';
    nanoBanana.stdout.on('data', (data) => {
      nbOutput += data.toString();
      console.log('[NanoBanana]', data.toString());
    });
    nanoBanana.stderr.on('data', (data) => {
      console.error('[NanoBanana Error]', data.toString());
    });

    nanoBanana.on('close', async (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        // Convert PNG to WebP for smaller file size
        const webpPath = path.join(projectDir, 'thumbnail.webp');
        try {
          const originalSize = fs.statSync(outputPath).size;
          await sharp(outputPath)
            .resize(1080, 1920, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(webpPath);
          const newSize = fs.statSync(webpPath).size;
          console.log(`[Thumbnail] Converted to WebP: ${originalSize} -> ${newSize} bytes`);

          // Remove original PNG
          fs.unlinkSync(outputPath);
        } catch (convErr) {
          console.error('[Thumbnail] WebP conversion failed, keeping PNG:', convErr.message);
        }

        // Commit thumbnail to Git (non-blocking, safe)
        gitCommitAsync(projectDir, 'Update thumbnail', ['thumbnail.webp', 'thumbnail.png']);

        // Return URL to the generated thumbnail
        let thumbnailUrl = `/api/projects/${projectId}/thumbnail?t=${Date.now()}`;

        try {
          if (r2Client.isR2Enabled()) {
            const published = await db.getPublishedGameByProjectId(req.supabase, projectId);
            if (published) {
              const uploadResult = await r2Publisher.uploadThumbnailToR2({
                projectId,
                publicId: published.public_id,
                userId: req.user.id
              });
              if (uploadResult.thumbnailUrl) {
                await db.updatePublishedGame(req.supabase, published.id, {
                  thumbnailUrl: uploadResult.thumbnailUrl
                });
                thumbnailUrl = uploadResult.thumbnailUrl;
              }
            }
          }
        } catch (thumbErr) {
          console.warn('[Thumbnail] R2 upload failed:', thumbErr.message);
        }

        res.json({ success: true, thumbnailUrl });
      } else {
        res.status(500).json({ error: 'Failed to generate thumbnail', output: nbOutput });
      }
    });

    nanoBanana.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });

  } catch (error) {
    console.error('Error generating thumbnail:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Upload Thumbnail ====================

// Upload thumbnail image
router.post('/:projectId/upload-thumbnail', authenticate, checkProjectOwnership, upload.thumbnail.single('thumbnail'), async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const projectDir = getProjectPath(req.user.id, projectId);
    const thumbnailPath = path.join(projectDir, 'thumbnail.webp');

    // Remove old png thumbnail if exists
    const oldPngPath = path.join(projectDir, 'thumbnail.png');
    if (fs.existsSync(oldPngPath)) {
      fs.unlinkSync(oldPngPath);
    }

    // Convert to WebP and save (sharp handles PNG/JPEG/WebP input)
    await sharp(req.file.path)
      .webp({ quality: 85 })
      .toFile(thumbnailPath);
    fs.unlinkSync(req.file.path); // Remove temp file

    // Commit to git (non-blocking, safe)
    gitCommitAsync(projectDir, 'Upload thumbnail', ['thumbnail.webp', 'thumbnail.png']);

    let thumbnailUrl = `/api/projects/${projectId}/thumbnail?t=${Date.now()}`;

    try {
      if (r2Client.isR2Enabled()) {
        const published = await db.getPublishedGameByProjectId(req.supabase, projectId);
        if (published) {
          const uploadResult = await r2Publisher.uploadThumbnailToR2({
            projectId,
            publicId: published.public_id,
            userId: req.user.id
          });
          if (uploadResult.thumbnailUrl) {
            await db.updatePublishedGame(req.supabase, published.id, {
              thumbnailUrl: uploadResult.thumbnailUrl
            });
            thumbnailUrl = uploadResult.thumbnailUrl;
          }
        }
      }
    } catch (thumbErr) {
      console.warn('[Thumbnail Upload] R2 upload failed:', thumbErr.message);
    }

    res.json({ success: true, thumbnailUrl });

  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Get Thumbnail (Public) ====================

// Get thumbnail image
// V2: Public access (no auth required) - thumbnail is meant to be shown
router.get('/:projectId/thumbnail', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Validate projectId format
    if (!isValidUUID(projectId)) {
      return res.status(404).send('Not found');
    }

    // Get project owner from DB (service_role to bypass RLS)
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).send('Not found');
    }

    // For published games with R2 enabled: on-demand upload to R2
    if (r2Client.isR2Enabled()) {
      const { data: published } = await supabaseAdmin
        .from('published_games')
        .select('id, public_id, thumbnail_url')
        .eq('project_id', projectId)
        .single();

      if (published?.public_id) {
        // Ensure thumbnail is on R2 (upload if not present)
        const r2Url = await r2Publisher.ensureThumbnailOnR2({
          projectId,
          publicId: published.public_id,
          userId: project.user_id
        });

        if (r2Url) {
          // Update DB if URL changed
          if (r2Url !== published.thumbnail_url) {
            await supabaseAdmin
              .from('published_games')
              .update({ thumbnail_url: r2Url, updated_at: new Date().toISOString() })
              .eq('id', published.id);
          }
          return res.redirect(302, r2Url);
        }
      }
    }

    // Fallback: serve from local filesystem
    const projectDir = getProjectPath(project.user_id, projectId);

    // Check for webp first (uploaded), then png (generated)
    const webpPath = path.join(projectDir, 'thumbnail.webp');
    const pngPath = path.join(projectDir, 'thumbnail.png');

    if (fs.existsSync(webpPath)) {
      res.type('image/webp').sendFile(webpPath);
    } else if (fs.existsSync(pngPath)) {
      res.type('image/png').sendFile(pngPath);
    } else {
      res.set('Cache-Control', 'no-store');
      res.status(404).send('Not found');
    }
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.set('Cache-Control', 'no-store');
    res.status(404).send('Not found');  // Hide errors as 404
  }
});

module.exports = router;
