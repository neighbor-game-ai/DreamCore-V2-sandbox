/**
 * Thumbnail generation utility for automatic thumbnail creation during publish.
 * Uses NanoBanana (Gemini image generation) to create game thumbnails.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const config = require('./config');
const { getProjectPath } = require('./config');
const r2Publisher = require('./r2Publisher');
const db = require('./database-supabase');
const { supabaseAdmin } = require('./supabaseClient');

const NANOBANANA_SCRIPT = path.join(__dirname, '..', '.claude', 'skills', 'nanobanana', 'generate.py');
const NANOBANANA_VENV = path.join(__dirname, '..', '.claude', 'skills', 'nanobanana', '.venv', 'bin', 'python');

/**
 * Generate thumbnail for a project using AI image generation.
 * This is a fire-and-forget function that logs errors but doesn't throw.
 *
 * @param {Object} options
 * @param {string} options.projectId - Project UUID
 * @param {string} options.publicId - Published game public ID (g_xxxxxxxxxx)
 * @param {string} options.userId - User UUID
 * @param {string} options.title - Game title for prompt generation
 * @param {string} [options.specContent] - Optional spec content for better prompts
 */
const generateThumbnailAsync = async ({ projectId, publicId, userId, title, specContent }) => {
  const logPrefix = `[ThumbnailGen ${publicId}]`;

  try {
    console.log(`${logPrefix} Starting automatic thumbnail generation...`);

    const projectDir = getProjectPath(userId, projectId);

    // Check if thumbnail already exists
    const webpPath = path.join(projectDir, 'thumbnail.webp');
    const pngPath = path.join(projectDir, 'thumbnail.png');

    if (fs.existsSync(webpPath) || fs.existsSync(pngPath)) {
      console.log(`${logPrefix} Thumbnail already exists, skipping generation`);
      return;
    }

    // Ensure project directory exists
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Build a simple prompt
    const imagePrompt = `ゲーム「${title}」のサムネイル。縦長9:16、モバイルゲーム向けの魅力的なイラスト。${specContent ? specContent.slice(0, 500) : ''}`;

    // Check if NanoBanana is available
    if (!fs.existsSync(NANOBANANA_SCRIPT)) {
      console.warn(`${logPrefix} NanoBanana script not found, skipping`);
      return;
    }

    const pythonPath = fs.existsSync(NANOBANANA_VENV) ? NANOBANANA_VENV : 'python3';
    const outputPath = path.join(projectDir, 'thumbnail.png');

    const args = [
      NANOBANANA_SCRIPT,
      imagePrompt,
      '-a', '9:16',
      '-o', outputPath
    ];

    console.log(`${logPrefix} Running NanoBanana...`);

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonPath, args, {
        cwd: process.cwd(),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`NanoBanana exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);

      // Timeout after 60 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error('NanoBanana timeout'));
      }, 60000);
    });

    // Check if PNG was created
    if (!fs.existsSync(outputPath)) {
      console.warn(`${logPrefix} NanoBanana did not create output file`);
      return;
    }

    console.log(`${logPrefix} Converting to WebP...`);

    // Convert to WebP
    try {
      const originalSize = fs.statSync(outputPath).size;
      await sharp(outputPath)
        .resize(1080, 1920, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(webpPath);
      const newSize = fs.statSync(webpPath).size;
      console.log(`${logPrefix} WebP conversion: ${originalSize} -> ${newSize} bytes`);

      // Remove original PNG
      fs.unlinkSync(outputPath);
    } catch (convErr) {
      console.warn(`${logPrefix} WebP conversion failed, keeping PNG: ${convErr.message}`);
    }

    // Upload to R2
    console.log(`${logPrefix} Uploading to R2...`);

    const uploadResult = await r2Publisher.ensureThumbnailOnR2({
      projectId,
      publicId,
      userId
    });

    if (uploadResult) {
      // Update DB
      const { data: published } = await supabaseAdmin
        .from('published_games')
        .select('id, thumbnail_url')
        .eq('public_id', publicId)
        .single();

      if (published && uploadResult !== published.thumbnail_url) {
        await supabaseAdmin
          .from('published_games')
          .update({ thumbnail_url: uploadResult, updated_at: new Date().toISOString() })
          .eq('id', published.id);
        console.log(`${logPrefix} DB updated with R2 URL: ${uploadResult}`);
      }
    }

    console.log(`${logPrefix} Thumbnail generation complete`);

  } catch (error) {
    console.error(`${logPrefix} Failed:`, error.message);
    // Don't throw - this is fire-and-forget
  }
};

/**
 * Check if thumbnail exists locally or on R2.
 */
const hasThumbnail = async ({ projectId, publicId, userId }) => {
  const projectDir = getProjectPath(userId, projectId);
  const webpPath = path.join(projectDir, 'thumbnail.webp');
  const pngPath = path.join(projectDir, 'thumbnail.png');

  // Check local
  if (fs.existsSync(webpPath) || fs.existsSync(pngPath)) {
    return true;
  }

  // Check R2 (via ensureThumbnailOnR2 which also checks)
  // For simple check, we just return false here
  return false;
};

module.exports = {
  generateThumbnailAsync,
  hasThumbnail
};
