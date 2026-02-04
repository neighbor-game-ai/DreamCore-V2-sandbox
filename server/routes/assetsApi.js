/**
 * Asset API Routes
 *
 * Handles /api/assets/* endpoints:
 * - POST /api/assets/upload - Upload asset
 * - POST /api/assets/remove-background - Remove background (Replicate API)
 * - GET /api/assets/search - Search assets
 * - GET /api/assets/:id - Get asset file
 * - GET /api/assets/:id/meta - Get asset metadata
 * - GET /api/assets - List user's assets
 * - PUT /api/assets/:id/publish - Update publish status
 * - PUT /api/assets/:id - Update asset metadata
 * - DELETE /api/assets/:id - Delete asset (soft delete)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// JSDOM + DOMPurify for SVG sanitization (module-scope initialization)
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const SVG_WINDOW = new JSDOM('').window;
const SVG_PURIFY = createDOMPurify(SVG_WINDOW);
SVG_PURIFY.setConfig({
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['use'],  // SVG の use タグは許可
  FORBID_TAGS: ['script', 'foreignObject'],
  FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'xlink:href'],
});

function sanitizeSVG(svgContent) {
  return SVG_PURIFY.sanitize(svgContent);
}

const db = require('../database-supabase');
const { supabaseAdmin } = require('../supabaseClient');
const { isValidUUID, getUserAssetsPath } = require('../config');
const upload = require('../middleware/uploads');
const { authenticate, optionalAuth } = require('../authMiddleware');
const { checkAssetOwnership, checkAssetAccess } = require('../middleware/assetChecks');
const r2Client = require('../r2Client');
const assetPublisher = require('../assetPublisher');

// ==================== Background Removal API ====================

// Remove background using Replicate API (BRIA RMBG 2.0)
router.post('/remove-background', authenticate, async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'image is required' });
    }

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
    if (!REPLICATE_API_TOKEN) {
      return res.status(503).json({ error: 'Background removal service not configured' });
    }

    console.log('Background removal request received (BRIA RMBG 2.0)');

    // BRIA RMBG 2.0 - High accuracy background removal, trained on licensed data
    // Outperforms BiRefNet (90% vs 85%) and Adobe Photoshop (90% vs 46%)
    const MODEL_VERSION = '4ed060b3587b7c3912353dd7d59000c883a6e1c5c9181ed7415c2624c2e8e392';

    // Create prediction with BRIA RMBG 2.0 parameters
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        version: MODEL_VERSION,
        input: {
          image: image,
          preserve_alpha: true
        }
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Replicate API error:', createResponse.status, errorText);

      // Parse error for better message
      let errorMessage = 'Background removal service error';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) errorMessage = errorJson.detail;
        else if (errorJson.error) errorMessage = errorJson.error;
      } catch (e) {
        // Use generic message
      }
      throw new Error(errorMessage);
    }

    let prediction = await createResponse.json();
    console.log('Prediction created:', prediction.id, 'status:', prediction.status);

    // Poll for completion if not using "wait" mode or still processing
    let pollCount = 0;
    const maxPolls = 60; // 60 seconds timeout
    while (prediction.status === 'starting' || prediction.status === 'processing') {
      if (pollCount++ > maxPolls) {
        throw new Error('Background removal timed out');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pollResponse = await fetch(prediction.urls.get, {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
        }
      });
      prediction = await pollResponse.json();
      console.log('Poll', pollCount, '- status:', prediction.status);
    }

    if (prediction.status === 'failed') {
      console.error('Prediction failed:', prediction.error);
      throw new Error(prediction.error || 'Background removal failed');
    }

    if (prediction.status === 'canceled') {
      throw new Error('Background removal was canceled');
    }

    // Get the output image URL and fetch it as base64
    const outputUrl = prediction.output;
    if (!outputUrl) {
      console.error('No output URL in prediction:', prediction);
      throw new Error('No output from background removal');
    }

    console.log('Fetching result image from:', outputUrl);

    // Fetch the result image and convert to base64
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch result image');
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`;

    console.log('Background removal completed successfully');
    res.json({ success: true, image: base64Image });

  } catch (error) {
    console.error('Background removal error:', error);
    res.status(500).json({
      error: error.message || 'Background removal failed',
      success: false
    });
  }
});

// ==================== Asset API Endpoints ====================

// Upload asset (V2: alias + hash)
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { projectId, originalName } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project ownership if projectId provided
    if (projectId) {
      if (!isValidUUID(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      const project = await db.getProjectById(req.supabase, projectId);
      if (!project || project.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied to project' });
      }
    }

    // Use originalName from body if provided (preserves UTF-8 encoding)
    const displayName = originalName || req.file.originalname;

    // V2: Calculate hash
    let fileBuffer = fs.readFileSync(req.file.path);

    // SVG ファイルのサニタイズ（XSS 攻撃防止）
    const uploadExt = path.extname(req.file.originalname).toLowerCase();
    if (uploadExt === '.svg') {
      console.log('[assets] Sanitizing SVG file:', req.file.originalname);
      const svgContent = fileBuffer.toString('utf-8');
      const sanitized = sanitizeSVG(svgContent);
      fileBuffer = Buffer.from(sanitized, 'utf-8');
      // サニタイズ後のファイルを一時ファイルに書き戻す
      fs.writeFileSync(req.file.path, fileBuffer);
    }

    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const hashShort = hash.slice(0, 8);

    // V2: Generate unique alias (collision avoidance)
    const ext = path.extname(displayName).toLowerCase();
    const baseName = path.basename(displayName, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 32);

    let alias = `${baseName}${ext}`;
    let counter = 2;
    let hadCollision = false;
    while (await db.aliasExists(userId, alias)) {
      if (!hadCollision) {
        console.log(`[assets] alias collision: user=${userId.slice(0, 8)}... base=${baseName} tried=${alias}`);
        hadCollision = true;
      }
      alias = `${baseName}_${counter}${ext}`;
      counter++;
    }
    if (hadCollision) {
      console.log(`[assets] alias resolved: user=${userId.slice(0, 8)}... final=${alias}`);
    }

    // V2: Generate physical filename with hash
    const aliasBase = path.basename(alias, ext);
    const filename = `${aliasBase}_${hashShort}${ext}`;

    // Move to user assets directory
    const userAssetsDir = getUserAssetsPath(userId);
    if (!fs.existsSync(userAssetsDir)) {
      fs.mkdirSync(userAssetsDir, { recursive: true });
    }
    const storagePath = path.join(userAssetsDir, filename);

    // Move file (or skip if same hash exists)
    if (!fs.existsSync(storagePath)) {
      fs.renameSync(req.file.path, storagePath);
    } else {
      fs.unlinkSync(req.file.path);  // Remove temp file
    }

    // V2: Create asset with new fields
    // Note: is_public=true by default for simplicity (can be restricted later)
    const asset = await db.createAssetV2(req.supabase, {
      owner_id: userId,
      alias,
      filename,
      original_name: displayName,
      storage_path: storagePath,
      mime_type: req.file.mimetype,
      size: req.file.size,
      hash,
      created_in_project_id: projectId || null,
      is_public: true,  // V2: Public by default (game assets are meant to be published)
      tags: req.body.tags || null,
      description: req.body.description || null
    });

    // Link asset to current project if projectId provided
    if (projectId) {
      await db.linkAssetToProject(req.supabase, projectId, asset.id, 'image');
    }

    // Fire-and-forget: upload to R2 for CDN (don't block response)
    if (r2Client.isR2Enabled()) {
      setImmediate(async () => {
        try {
          await assetPublisher.uploadUserAssetToR2(userId, asset.alias, storagePath);
          console.log(`[assets] Uploaded to R2: ${userId}/${asset.alias}`);
        } catch (err) {
          console.error(`[assets] R2 upload failed: ${err.message}`);
          // Not critical - on-demand upload will handle it later
        }
      });
    }

    res.json({
      success: true,
      asset: {
        id: asset.id,
        alias: asset.alias,
        filename: asset.original_name,
        mimeType: asset.mime_type,
        size: asset.size,
        url: `/user-assets/${userId}/${asset.alias}`
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search assets (must be before /:id to avoid route collision)
router.get('/search', authenticate, async (req, res) => {
  const { q } = req.query;

  let assets;
  if (q) {
    assets = await db.searchAssets(req.supabase, req.user.id, q);
  } else {
    assets = await db.getAccessibleAssets(req.supabase, req.user.id);
  }

  // Phase 1: Only show owner's assets
  res.json({
    assets: assets
      .filter(a => a.owner_id === req.user.id)
      .map(a => ({
        id: a.id,
        filename: a.original_name,
        alias: a.alias,
        mimeType: a.mime_type,
        size: a.size,
        isPublic: !!a.is_public,
        isOwner: true,
        tags: a.tags,
        description: a.description,
        url: `/user-assets/${a.owner_id}/${a.alias}`  // V2: alias-based URL
      }))
  });
});

// Get asset file (public or owner access)
router.get('/:id', optionalAuth, checkAssetAccess, (req, res) => {
  // req.asset is already verified by checkAssetAccess (including is_deleted check)

  // Check if file exists
  if (!fs.existsSync(req.asset.storage_path)) {
    return res.status(404).json({ error: 'Asset file not found' });
  }

  res.type(req.asset.mime_type || 'application/octet-stream');
  res.sendFile(req.asset.storage_path);
});

// Get asset metadata (Phase 1: owner-only)
router.get('/:id/meta', authenticate, checkAssetOwnership, (req, res) => {
  res.json({
    id: req.asset.id,
    filename: req.asset.original_name,
    alias: req.asset.alias,
    mimeType: req.asset.mime_type,
    size: req.asset.size,
    isPublic: !!req.asset.is_public,
    tags: req.asset.tags,
    description: req.asset.description,
    createdAt: req.asset.created_at,
    url: `/user-assets/${req.asset.owner_id}/${req.asset.alias}`  // V2: alias-based URL
  });
});

// List user's assets
router.get('/', authenticate, async (req, res) => {
  const { currentProjectId } = req.query;

  const assets = await db.getAssetsWithProjectsByOwnerId(req.supabase, req.user.id);

  // Parse project info and group assets
  const assetsWithProjects = assets.map(a => {
    const projectIds = a.project_ids ? a.project_ids.split(',') : [];
    const projectNames = a.project_names ? a.project_names.split(',') : [];
    const projects = projectIds.map((id, index) => ({
      id,
      name: projectNames[index] || 'Unknown'
    }));

    return {
      id: a.id,
      filename: a.original_name,
      alias: a.alias,
      mimeType: a.mime_type,
      size: a.size,
      isPublic: !!a.is_public,
      tags: a.tags,
      description: a.description,
      url: `/user-assets/${a.owner_id}/${a.alias}`,  // V2: alias-based URL
      projects,
      createdAt: a.created_at
    };
  });

  res.json({
    assets: assetsWithProjects,
    currentProjectId
  });
});

// Update asset publish status
router.put('/:id/publish', authenticate, checkAssetOwnership, async (req, res) => {
  const { isPublic } = req.body;

  const updated = await db.setAssetPublic(req.supabase, req.params.id, isPublic);
  res.json({
    success: true,
    asset: {
      id: updated.id,
      isPublic: !!updated.is_public
    }
  });
});

// Update asset metadata
router.put('/:id', authenticate, checkAssetOwnership, async (req, res) => {
  const { tags, description } = req.body;

  const updated = await db.updateAssetMeta(req.supabase, req.params.id, tags, description);
  res.json({
    success: true,
    asset: {
      id: updated.id,
      tags: updated.tags,
      description: updated.description
    }
  });
});

// Delete asset (soft delete - file remains but asset becomes inaccessible)
router.delete('/:id', authenticate, checkAssetOwnership, async (req, res) => {
  // Soft delete (logical deletion - asset becomes inaccessible but data remains)
  // This ensures that all projects referencing this asset will see it as "deleted"
  // NOTE: Use service_role client because RLS WITH CHECK blocks user from setting is_deleted=true
  const deleted = await db.deleteAsset(supabaseAdmin, req.params.id);

  if (deleted === false) {
    return res.status(500).json({ error: 'Failed to delete asset' });
  }

  if (deleted === null) {
    // No rows affected - asset was already deleted (race condition)
    return res.status(404).json({ error: 'Asset not found or already deleted' });
  }

  // Return usage count so owner knows impact (use admin client since asset is now hidden by RLS)
  const usageCount = await db.getAssetUsageCount(supabaseAdmin, req.params.id);
  res.json({
    success: true,
    message: usageCount > 0
      ? `Asset deleted. It was used in ${usageCount} project(s) - they will now see a placeholder.`
      : 'Asset deleted.'
  });
});

module.exports = router;
