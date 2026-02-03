/**
 * CLI Deploy API ルート
 *
 * エンドポイント:
 * - POST /device/code - デバイスコード発行
 * - POST /device/authorize - ユーザーコード認可
 * - POST /device/deny - ユーザーコード拒否
 * - POST /device/token - トークン取得（ポーリング）
 * - POST /deploy - デプロイ
 * - GET /projects - プロジェクト一覧
 * - DELETE /projects/:id - プロジェクト削除
 */

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const { verifySupabaseToken, getSupabaseCli } = require('./supabase');
const { authenticateToken } = require('./tokenManager');
const { createDeviceCode, authorizeUserCode, denyUserCode, pollForToken } = require('./deviceAuth');
const {
  validateZip,
  parseDreamcoreJson,
  uploadToStorage,
  deleteFromStorage,
  generatePublicId,
  isValidPublicId
} = require('./upload');

const router = express.Router();

// ファイルアップロード設定（メモリストレージ）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// Rate Limit 設定
const deviceCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'rate_limit', message: 'Too many requests' },
  keyGenerator: (req) => req.ip
});

const deviceTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'slow_down', message: 'Polling too fast' },
  keyGenerator: (req) => req.ip
});

const deployLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'rate_limit', message: 'Deploy limit exceeded' },
  keyGenerator: (req) => req.userId || req.ip
});

// /device/authorize 用（user_id ベース）
const authorizeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'rate_limit', message: 'Too many authorize requests' },
  keyGenerator: (req) => req.userId || req.ip
});

// /projects GET 用
const projectsGetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'rate_limit', message: 'Too many requests' },
  keyGenerator: (req) => req.userId || req.ip
});

// /projects DELETE 用
const projectsDeleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'rate_limit', message: 'Too many delete requests' },
  keyGenerator: (req) => req.userId || req.ip
});

/**
 * CLI トークン認証ミドルウェア
 */
async function authenticateCliToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  const auth = await authenticateToken(token);

  if (!auth) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }

  req.userId = auth.userId;
  req.tokenId = auth.tokenId;
  next();
}

/**
 * Supabase A トークン認証ミドルウェア（/device/authorize 用）
 */
async function authenticateSupabaseToken(req, res, next) {
  // Origin チェック
  const origin = req.headers.origin;
  const allowedOrigin = process.env.CLI_AUTH_ALLOWED_ORIGIN || 'https://v2.dreamcore.gg';

  if (origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: 'forbidden', message: 'Invalid origin' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);
  const userId = await verifySupabaseToken(token);

  if (!userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid Supabase token' });
  }

  req.userId = userId;
  next();
}

// =====================================
// Device Flow エンドポイント
// =====================================

/**
 * POST /device/code - デバイスコード発行
 */
router.post('/device/code', deviceCodeLimiter, async (req, res) => {
  try {
    const result = await createDeviceCode();
    res.json(result);
  } catch (error) {
    console.error('Device code error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to create device code' });
  }
});

/**
 * POST /device/authorize - ユーザーコード認可
 */
router.post('/device/authorize', authenticateSupabaseToken, authorizeLimiter, async (req, res) => {
  try {
    const { user_code } = req.body;
    console.log('[CLI Auth] Authorize request:', { user_code, userId: req.userId });

    if (!user_code) {
      return res.status(400).json({ error: 'invalid_request', message: 'user_code is required' });
    }

    const result = await authorizeUserCode(user_code, req.userId);
    console.log('[CLI Auth] Authorize result:', result);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: 'Authorization successful' });
  } catch (error) {
    console.error('[CLI Auth] Authorize error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to authorize' });
  }
});

/**
 * POST /device/deny - ユーザーコード拒否
 */
router.post('/device/deny', authenticateSupabaseToken, authorizeLimiter, async (req, res) => {
  try {
    const { user_code } = req.body;

    if (!user_code) {
      return res.status(400).json({ error: 'invalid_request', message: 'user_code is required' });
    }

    const result = await denyUserCode(user_code, req.userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: 'Authorization denied' });
  } catch (error) {
    console.error('Deny error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to deny' });
  }
});

/**
 * POST /device/token - トークン取得（ポーリング）
 */
router.post('/device/token', deviceTokenLimiter, async (req, res) => {
  try {
    const { device_code, grant_type } = req.body;

    if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
      return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Use device_code grant type' });
    }

    if (!device_code) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'device_code is required' });
    }

    const result = await pollForToken(device_code);

    // エラーの場合は 400 で返す（OAuth 仕様）
    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Token polling error:', error);
    res.status(500).json({ error: 'server_error', error_description: 'Failed to retrieve token' });
  }
});

// =====================================
// Deploy エンドポイント
// =====================================

/**
 * POST /deploy - ゲームをデプロイ
 */
router.post('/deploy', authenticateCliToken, deployLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'invalid_request', message: 'ZIP file is required' });
    }

    // ZIP を検証
    const validation = validateZip(req.file.buffer);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid ZIP file',
        details: validation.errors
      });
    }

    // dreamcore.json を解析
    const metadata = parseDreamcoreJson(validation.files);
    if (metadata && metadata.error) {
      return res.status(400).json({ error: 'validation_error', message: metadata.error });
    }

    const supabase = getSupabaseCli();
    let publicId = metadata?.id;
    let isUpdate = false;
    let existingProject = null;

    // 既存プロジェクトか確認
    if (publicId) {
      const { data: project } = await supabase
        .from('cli_projects')
        .select('id, user_id, public_id, name')
        .eq('public_id', publicId)
        .single();

      if (project) {
        // 所有権チェック
        if (project.user_id !== req.userId) {
          return res.status(403).json({ error: 'forbidden', message: 'You do not own this project' });
        }
        isUpdate = true;
        existingProject = project;
      }
    }

    // 新規プロジェクトの場合は public_id を生成
    if (!publicId) {
      publicId = generatePublicId();
    }

    // 既存ファイルを削除（上書きデプロイ）
    if (isUpdate) {
      const deleteSuccess = await deleteFromStorage(req.userId, publicId);
      if (!deleteSuccess) {
        return res.status(500).json({
          error: 'storage_error',
          message: 'Failed to delete existing files. Please try again.'
        });
      }
    }

    // ファイルをアップロード（Play と同じ構造: users/{user_id}/projects/{public_id}/）
    const uploadResults = await uploadToStorage(req.userId, publicId, validation.files);
    const failedUploads = uploadResults.filter(r => !r.success);

    if (failedUploads.length > 0) {
      return res.status(500).json({
        error: 'upload_error',
        message: 'Some files failed to upload',
        details: failedUploads
      });
    }

    // 公開 URL は v2.dreamcore.gg/game/ （ユーザー向け）
    // cli.dreamcore.gg は内部 CDN ドメイン（iframe src 用）
    const gameUrl = `https://v2.dreamcore.gg/game/${publicId}`;

    // DB を更新
    if (isUpdate) {
      // 既存プロジェクトを更新
      await supabase
        .from('cli_projects')
        .update({
          name: metadata?.title || existingProject.name,
          description: metadata?.description,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProject.id);

      // cli_published_games を upsert
      await supabase
        .from('cli_published_games')
        .upsert({
          project_id: existingProject.id,
          user_id: req.userId,
          public_id: publicId,
          url: gameUrl,
          title: metadata?.title || existingProject.name,
          description: metadata?.description,
          published_at: new Date().toISOString()
        }, { onConflict: 'project_id' });

    } else {
      // 新規プロジェクトを作成
      const { data: newProject, error: projectError } = await supabase
        .from('cli_projects')
        .insert({
          user_id: req.userId,
          public_id: publicId,
          name: metadata?.title || 'New Game',
          description: metadata?.description
        })
        .select('id')
        .single();

      if (projectError) {
        return res.status(500).json({ error: 'database_error', message: 'Failed to create project' });
      }

      // cli_published_games を作成
      await supabase
        .from('cli_published_games')
        .insert({
          project_id: newProject.id,
          user_id: req.userId,
          public_id: publicId,
          url: gameUrl,
          title: metadata?.title || 'New Game',
          description: metadata?.description
        });
    }

    res.json({
      success: true,
      public_id: publicId,
      url: gameUrl,
      files_uploaded: validation.files.length,
      is_update: isUpdate
    });

  } catch (error) {
    console.error('Deploy error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to deploy' });
  }
});

// =====================================
// Projects エンドポイント
// =====================================

/**
 * GET /projects - プロジェクト一覧
 */
router.get('/projects', authenticateCliToken, projectsGetLimiter, async (req, res) => {
  try {
    const supabase = getSupabaseCli();

    const { data: projects, error } = await supabase
      .from('cli_projects')
      .select(`
        id,
        public_id,
        name,
        description,
        game_type,
        created_at,
        updated_at,
        cli_published_games (
          url,
          title,
          thumbnail_url,
          visibility,
          play_count,
          published_at
        )
      `)
      .eq('user_id', req.userId)
      .order('updated_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'database_error', message: 'Failed to fetch projects' });
    }

    const result = projects.map(p => ({
      id: p.public_id,
      name: p.name,
      title: p.cli_published_games?.[0]?.title || p.name,
      description: p.description,
      game_type: p.game_type,
      url: `https://v2.dreamcore.gg/game/${p.public_id}`,
      thumbnail_url: p.cli_published_games?.[0]?.thumbnail_url,
      visibility: p.cli_published_games?.[0]?.visibility || 'public',
      play_count: p.cli_published_games?.[0]?.play_count || 0,
      created_at: p.created_at,
      updated_at: p.updated_at,
      published_at: p.cli_published_games?.[0]?.published_at
    }));

    res.json({ projects: result });

  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to list projects' });
  }
});

/**
 * DELETE /projects/:id - プロジェクト削除
 */
router.delete('/projects/:id', authenticateCliToken, projectsDeleteLimiter, async (req, res) => {
  try {
    const publicId = req.params.id;

    // public_id 形式を検証
    if (!isValidPublicId(publicId)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Invalid project ID format' });
    }

    const supabase = getSupabaseCli();

    // プロジェクトを取得
    const { data: project, error: fetchError } = await supabase
      .from('cli_projects')
      .select('id, user_id')
      .eq('public_id', publicId)
      .single();

    if (fetchError || !project) {
      return res.status(404).json({ error: 'not_found', message: 'Project not found' });
    }

    // 所有権チェック
    if (project.user_id !== req.userId) {
      return res.status(403).json({ error: 'forbidden', message: 'You do not own this project' });
    }

    // Storage からファイルを削除
    const deleteSuccess = await deleteFromStorage(publicId);
    if (!deleteSuccess) {
      return res.status(500).json({
        error: 'storage_error',
        message: 'Failed to delete files from storage. Please try again.'
      });
    }

    // DB から削除（cli_published_games は CASCADE で削除される）
    const { error: deleteError } = await supabase
      .from('cli_projects')
      .delete()
      .eq('id', project.id);

    if (deleteError) {
      return res.status(500).json({ error: 'database_error', message: 'Failed to delete project' });
    }

    res.json({ success: true, message: 'Project deleted' });

  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to delete project' });
  }
});

module.exports = router;
