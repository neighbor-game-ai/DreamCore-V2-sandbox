// Load environment variables first
require('dotenv').config();

// Validate required environment variables (fails fast if missing)
const { validateEnvironment } = require('./config');
validateEnvironment();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const userManager = require('./userManager');
const { claudeRunner, jobManager, spawnClaudeAsync } = require('./claudeRunner');
const db = require('./database-supabase');
const geminiClient = require('./geminiClient');
const { getStyleById } = require('./stylePresets');
const { getStyleOptionsWithImages } = require('./styleImageCache');
const { generateVisualGuide, formatGuideForCodeGeneration } = require('./visualGuideGenerator');
const { authenticate, optionalAuth, verifyWebSocketAuth } = require('./authMiddleware');
const { isValidUUID, isPathSafe, isValidGitHash, getProjectPath, getUserAssetsPath, getGlobalAssetsPath, USERS_DIR, GLOBAL_ASSETS_DIR, SUPABASE_URL, SUPABASE_ANON_KEY } = require('./config');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { supabaseAdmin } = require('./supabaseClient');
const { ErrorCodes, createWsError, sendHttpError } = require('./errorResponse');
const config = require('./config');
const waitlist = require('./waitlist');
const quotaService = require('./quotaService');

/**
 * Get next quota reset time (00:00 UTC = 09:00 JST)
 */
function getNextResetTime() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return tomorrow.toISOString();
}

// Lazy-load Modal client (only when USE_MODAL=true)
let modalClient = null;
function getModalClient() {
  if (!modalClient) {
    modalClient = require('./modalClient');
  }
  return modalClient;
}

/**
 * Safe async git commit (no shell interpolation)
 * @param {string} cwd - Working directory
 * @param {string} message - Commit message
 * @param {string[]} files - Files to add (default: ['-A'] for all)
 */
const gitCommitAsync = (cwd, message, files = ['-A']) => {
  // First: git add
  execFile('git', ['add', ...files], { cwd }, (addErr) => {
    if (addErr) {
      console.log(`[Git] Add failed: ${addErr.message}`);
      return;
    }
    // Then: git commit
    execFile('git', ['commit', '-m', message, '--allow-empty'], { cwd }, (commitErr) => {
      if (commitErr) {
        console.log(`[Git] Commit skipped: ${commitErr.message}`);
      } else {
        console.log(`[Git] Committed: ${message}`);
      }
    });
  });
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Temporary upload directory (files are moved to user-specific directories after processing)
const UPLOAD_TEMP_DIR = path.join(__dirname, '..', 'uploads_temp');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg|mp3|wav|ogg|json/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype.split('/')[1]);
    if (ext || mime) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// JSON body parser with increased limit for base64 images
app.use(express.json({ limit: '50mb' }));

// CORS for Phase 2 subdomain architecture (play.dreamcore.gg)
// Assets need to be accessible from the play subdomain where games run
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);  // Remove empty strings

// Host detection middleware for play.dreamcore.gg
app.use((req, res, next) => {
  req.isPlayDomain = req.get('host')?.includes('play.dreamcore.gg');
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/user-assets/') ||
      req.path.startsWith('/global-assets/') ||
      req.path.startsWith('/game/') ||
      req.path.startsWith('/g/') ||
      req.path.startsWith('/api/assets/') ||
      req.path.startsWith('/api/published-games')) {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');  // Prevent cache poisoning
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
  }
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==================== Health Check ====================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==================== Authentication API Endpoints ====================

// NOTE: /api/auth/* routes removed - use Supabase Auth instead

// Public config endpoint (for frontend Supabase client)
// Cache for 1 hour (config rarely changes)
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    playDomain: config.PLAY_DOMAIN || 'https://play.dreamcore.gg'
  });
});

// ==================== Waitlist/Access Control ====================
// V2 初期リリース用。無効化方法: この行をコメントアウト
waitlist.setupRoutes(app);

// ==================== REST API Endpoints ====================

// Get user's quota information
app.get('/api/quota', authenticate, async (req, res) => {
  try {
    const info = await quotaService.getQuotaInfo(req.user.id);
    res.json({
      ...info,
      resetAt: getNextResetTime()
    });
  } catch (err) {
    console.error('[Quota] Failed to get quota:', err);
    res.status(500).json({ error: 'Failed to get quota' });
  }
});

// Get job status
// Helper: check job ownership via user_id
const checkJobOwnership = async (req, res, next) => {
  const { jobId } = req.params;
  if (!isValidUUID(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID' });
  }
  const job = await jobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (job.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  req.job = job;
  next();
};

app.get('/api/jobs/:jobId', authenticate, checkJobOwnership, (req, res) => {
  res.json(req.job);
});

// Get active job for a project
// Helper: check project ownership and attach to req
const checkProjectOwnership = async (req, res, next) => {
  const { projectId } = req.params;
  if (!isValidUUID(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  const project = await db.getProjectById(req.supabase, projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (project.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  req.project = project;
  next();
};

app.get('/api/projects/:projectId/active-job', authenticate, checkProjectOwnership, async (req, res) => {
  const job = await jobManager.getActiveJob(req.params.projectId);
  res.json({ job: job || null });
});

// Get jobs for a project
app.get('/api/projects/:projectId/jobs', authenticate, checkProjectOwnership, async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobs = await jobManager.getProjectJobs(req.params.projectId, limit);
  res.json({ jobs });
});

// Cancel a job
app.post('/api/jobs/:jobId/cancel', authenticate, checkJobOwnership, (req, res) => {
  const job = claudeRunner.cancelJob(req.params.jobId);
  res.json({ success: true, job });
});

// Get project HTML code
app.get('/api/projects/:projectId/code', authenticate, checkProjectOwnership, (req, res) => {
  const projectDir = getProjectPath(req.user.id, req.params.projectId);
  const indexPath = path.join(projectDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const code = fs.readFileSync(indexPath, 'utf-8');
  res.json({ code });
});

// Get latest AI context (Gemini edits, summary, etc.)
app.get('/api/projects/:projectId/ai-context', authenticate, checkProjectOwnership, (req, res) => {
  const context = userManager.getLatestAIContext(req.user.id, req.params.projectId);
  res.json({ context });
});

// Download project as ZIP
app.get('/api/projects/:projectId/download', authenticate, checkProjectOwnership, async (req, res) => {
  const projectDir = getProjectPath(req.user.id, req.params.projectId);

  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const archiver = require('archiver');
  const archive = archiver('zip', { zlib: { level: 9 } });

  res.attachment('game.zip');
  archive.pipe(res);

  // Add index.html
  const indexPath = path.join(projectDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    archive.file(indexPath, { name: 'index.html' });
  }

  // Add assets folder if exists
  const assetsDir = path.join(projectDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    archive.directory(assetsDir, 'assets');
  }

  await archive.finalize();
});

// ==================== Image Generation API ====================

// Generate image using Gemini Imagen (Nano Banana Pro)
app.post('/api/generate-image', authenticate, async (req, res) => {
  try {
    const { prompt, style, size } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    if (!geminiClient.isAvailable()) {
      return res.status(503).json({ error: 'Image generation service not available' });
    }

    console.log(`Image generation request: "${prompt}" (style: ${style || 'default'}, size: ${size || '512x512'})`);

    const result = await geminiClient.generateImage({
      prompt,
      style: style || '',
      size: size || '512x512'
    });

    res.json(result);
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({
      error: error.message || 'Image generation failed',
      success: false
    });
  }
});

// ==================== Background Removal API ====================

// Remove background using Replicate API (BRIA RMBG 2.0)
// Helper: check asset ownership and attach to req (requires authentication)
const checkAssetOwnership = async (req, res, next) => {
  const assetId = req.params.id;
  if (!isValidUUID(assetId)) {
    return res.status(400).json({ error: 'Invalid asset ID' });
  }
  const asset = await db.getAssetById(req.supabase, assetId);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  if (asset.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  req.asset = asset;
  next();
};

// Helper: check asset access for public/owner (optional auth)
const checkAssetAccess = async (req, res, next) => {
  const assetId = req.params.id;
  if (!isValidUUID(assetId)) {
    return res.status(400).json({ error: 'Invalid asset ID' });
  }
  // Use admin client to bypass RLS for public asset check
  const asset = await db.getAssetByIdAdmin(assetId);
  if (!asset || asset.is_deleted) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  // Allow access if: owner OR public
  const isOwner = req.user?.id === asset.owner_id;
  const isPublic = asset.is_public || asset.is_global;
  if (!isOwner && !isPublic) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  req.asset = asset;
  next();
};

app.post('/api/assets/remove-background', authenticate, async (req, res) => {
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
app.post('/api/assets/upload', authenticate, upload.single('file'), async (req, res) => {
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
    const fileBuffer = fs.readFileSync(req.file.path);
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
app.get('/api/assets/search', authenticate, async (req, res) => {
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
app.get('/api/assets/:id', optionalAuth, checkAssetAccess, (req, res) => {
  // req.asset is already verified by checkAssetAccess (including is_deleted check)

  // Check if file exists
  if (!fs.existsSync(req.asset.storage_path)) {
    return res.status(404).json({ error: 'Asset file not found' });
  }

  res.type(req.asset.mime_type || 'application/octet-stream');
  res.sendFile(req.asset.storage_path);
});

// Get asset metadata (Phase 1: owner-only)
app.get('/api/assets/:id/meta', authenticate, checkAssetOwnership, (req, res) => {
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
app.get('/api/assets', authenticate, async (req, res) => {
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
app.put('/api/assets/:id/publish', authenticate, checkAssetOwnership, async (req, res) => {
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
app.put('/api/assets/:id', authenticate, checkAssetOwnership, async (req, res) => {
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
app.delete('/api/assets/:id', authenticate, checkAssetOwnership, async (req, res) => {
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

// ==================== V2 Asset Endpoints ====================

// Serve user assets by alias
// GET /user-assets/:userId/:alias
app.get('/user-assets/:userId/:alias', optionalAuth, async (req, res) => {
  const { userId, alias } = req.params;

  // Validate userId format
  if (!isValidUUID(userId)) {
    return res.status(404).send('Not found');
  }

  // Get asset by alias (service_role, bypasses RLS)
  const asset = await db.getAssetByAliasAdmin(userId, alias);

  // Check: exists and not deleted
  if (!asset || asset.is_deleted) {
    return res.status(404).send('Not found');
  }

  // Check: availability period (for global assets)
  const now = new Date();
  if (asset.available_from && new Date(asset.available_from) > now) {
    return res.status(404).send('Not found');
  }
  if (asset.available_until && new Date(asset.available_until) < now) {
    return res.status(404).send('Not found');
  }

  // Check: authorization
  const isOwner = req.user?.id === userId;
  const isPublic = asset.is_public || asset.is_global;

  if (!isOwner && !isPublic) {
    return res.status(404).send('Not found');
  }

  // Serve file
  const filePath = asset.storage_path;
  if (!fs.existsSync(filePath)) {
    console.error(`[user-assets] File not found: ${filePath}`);
    return res.status(404).send('Not found');
  }

  res.sendFile(filePath);
});

// Serve global assets by category and alias
// GET /global-assets/:category/:alias
app.get('/global-assets/:category/:alias', async (req, res) => {
  const { category, alias } = req.params;

  // Get global asset (service_role)
  const asset = await db.getGlobalAssetAdmin(category, alias);

  // Check: exists and not deleted
  if (!asset || asset.is_deleted) {
    return res.status(404).send('Not found');
  }

  // Check: availability period
  const now = new Date();
  if (asset.available_from && new Date(asset.available_from) > now) {
    return res.status(404).send('Not found');
  }
  if (asset.available_until && new Date(asset.available_until) < now) {
    return res.status(404).send('Not found');
  }

  // Serve file
  const filePath = asset.storage_path;
  if (!fs.existsSync(filePath)) {
    console.error(`[global-assets] File not found: ${filePath}`);
    return res.status(404).send('Not found');
  }

  res.sendFile(filePath);
});

// ==================== Public Games API ====================

// Get public games for discover feed
// NOTE: /api/public-games removed for Phase 1 (owner-only)

// Get single game preview (owner-only)
// Phase 1: Owner-only preview (no public access)
app.get('/api/projects/:projectId/preview', authenticate, checkProjectOwnership, (req, res) => {
  try {
    // Read the index.html file (user is already verified as owner)
    const projectDir = getProjectPath(req.user.id, req.params.projectId);
    const indexPath = path.join(projectDir, 'index.html');

    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Game file not found');
    }

    const html = fs.readFileSync(indexPath, 'utf-8');
    res.type('html').send(html);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).send('Error loading game');
  }
});

// Error detection script to inject into game HTML
const ERROR_DETECTION_SCRIPT = `
<script>
(function() {
  var errors = [];
  var MAX_ERRORS = 10;

  // Capture JS errors
  window.onerror = function(msg, url, line, col, error) {
    if (errors.length < MAX_ERRORS) {
      errors.push({
        type: 'error',
        message: msg,
        file: url ? url.split('/').pop() : 'unknown',
        line: line,
        column: col,
        stack: error ? error.stack : null
      });
      reportErrors();
    }
    return false;
  };

  // Capture unhandled promise rejections
  window.onunhandledrejection = function(event) {
    if (errors.length < MAX_ERRORS) {
      errors.push({
        type: 'unhandledrejection',
        message: event.reason ? (event.reason.message || String(event.reason)) : 'Unknown promise rejection',
        stack: event.reason ? event.reason.stack : null
      });
      reportErrors();
    }
  };

  // Capture console.error
  var originalConsoleError = console.error;
  console.error = function() {
    if (errors.length < MAX_ERRORS) {
      errors.push({
        type: 'console.error',
        message: Array.from(arguments).map(function(a) {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ')
      });
      reportErrors();
    }
    originalConsoleError.apply(console, arguments);
  };

  function reportErrors() {
    try {
      window.parent.postMessage({
        type: 'gameError',
        errors: errors
      }, '*');
    } catch(e) {}
  }

  // Report successful load
  window.addEventListener('load', function() {
    setTimeout(function() {
      try {
        window.parent.postMessage({
          type: 'gameLoaded',
          success: errors.length === 0,
          errorCount: errors.length,
          errors: errors
        }, '*');
      } catch(e) {}
    }, 500);
  });
})();
</script>
`;

// Inject asset base URL and normalize /user-assets/ to absolute URLs (optional)
const getAssetBaseUrl = (req) => {
  if (config.ASSET_BASE_URL) {
    return config.ASSET_BASE_URL.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
};

const buildAssetInjectScript = (baseUrl) => {
  return `\n<script>window.ASSET_BASE_URL=${JSON.stringify(baseUrl)};</script>\n`;
};

const rewriteUserAssets = (html, baseUrl) => {
  if (!baseUrl) return html;
  const prefix = `${baseUrl}/user-assets/`;
  return html.replace(/(^|["'(\s])\/user-assets\//g, `$1${prefix}`);
};

const injectGameHtml = (html, req) => {
  const assetBase = getAssetBaseUrl(req);
  const injectScript = buildAssetInjectScript(assetBase) + ERROR_DETECTION_SCRIPT;
  let content = rewriteUserAssets(html, assetBase);

  if (content.includes('<head>')) {
    content = content.replace('<head>', '<head>' + injectScript);
  } else if (content.includes('<HEAD>')) {
    content = content.replace('<HEAD>', '<HEAD>' + injectScript);
  } else {
    content = injectScript + content;
  }

  return content;
};

// Serve project game files (supports nested paths: js/, css/, assets/)
// Authentication required - owner-only access (Phase 1 policy)
app.get('/game/:userId/:projectId/*', authenticate, async (req, res) => {
  const { userId, projectId } = req.params;
  const filename = req.params[0] || 'index.html';

  // Validate UUID format
  if (!isValidUUID(userId) || !isValidUUID(projectId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // Ownership check: authenticated user must match URL userId
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Path traversal protection (applies to both Modal and local modes)
  // Reject paths containing .. or starting with /
  if (filename.includes('..') || filename.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  };

  // Binary file extensions
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.woff', '.woff2', '.ttf'];
  const isBinary = binaryExtensions.includes(ext);

  // Try local filesystem first (fast path after sync)
  const projectDir = getProjectPath(userId, projectId);
  const localFilePath = path.join(projectDir, filename);

  // Check if file exists locally
  if (fs.existsSync(localFilePath) && isPathSafe(projectDir, localFilePath)) {
    res.type(contentTypes[ext] || 'application/octet-stream');

    if (isBinary) {
      return res.sendFile(localFilePath);
    }

    let content = fs.readFileSync(localFilePath, 'utf-8');

    // Inject asset base + error detection script into HTML files
    if (ext === '.html' && filename === 'index.html') {
      content = injectGameHtml(content, req);
    } else if (['.css', '.js', '.mjs', '.json', '.html'].includes(ext)) {
      // Normalize /user-assets/ to absolute URLs for other text assets
      const assetBase = getAssetBaseUrl(req);
      content = rewriteUserAssets(content, assetBase);
    }

    return res.send(content);
  }

  // Fallback to Modal if file not found locally and USE_MODAL=true
  if (config.USE_MODAL) {
    try {
      const client = getModalClient();
      const content = await client.getFile(userId, projectId, filename);

      if (content === null) {
        return res.status(404).send('File not found');
      }

      res.type(contentTypes[ext] || 'application/octet-stream');

      if (isBinary) {
        res.send(content);
      } else {
        let textContent = content;
        if (Buffer.isBuffer(textContent)) {
          textContent = textContent.toString('utf-8');
        }

        // Inject asset base + error detection script into HTML files
        if (ext === '.html' && filename === 'index.html') {
          textContent = injectGameHtml(textContent, req);
        } else if (['.css', '.js', '.mjs', '.json', '.html'].includes(ext)) {
          // Normalize /user-assets/ to absolute URLs for other text assets
          const assetBase = getAssetBaseUrl(req);
          textContent = rewriteUserAssets(textContent, assetBase);
        }

        res.send(textContent);
      }
      return;
    } catch (err) {
      console.error('[Modal getFile error]', err.message);
      return res.status(500).json({ error: 'Failed to fetch file from Modal' });
    }
  }

  // File not found locally and Modal not enabled
  return res.status(404).send('File not found');
});

// ==================== Published Games API ====================

// GET /api/published-games/:id - Get published game info (public access)
// Note: Does NOT increment play count (use POST /api/published-games/:id/play for that)
app.get('/api/published-games/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid game ID' });
  }

  const game = await db.getPublishedGameById(id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.json(game);
});

// POST /api/published-games/:id/play - Increment play count (call when game actually starts)
app.post('/api/published-games/:id/play', async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid game ID' });
  }

  // Verify game exists and is public/unlisted
  const game = await db.getPublishedGameById(id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // Increment play count
  await db.incrementPlayCount(id);

  res.json({ success: true });
});

// POST /api/projects/:projectId/publish - Publish a game
app.post('/api/projects/:projectId/publish', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  const { title, description, howToPlay, tags, visibility, allowRemix, thumbnailUrl } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Validate visibility
  const validVisibilities = ['public', 'private', 'unlisted'];
  if (visibility && !validVisibilities.includes(visibility)) {
    return res.status(400).json({ error: 'Invalid visibility option' });
  }

  // Validate tags (must be array of strings)
  if (tags && (!Array.isArray(tags) || tags.some(t => typeof t !== 'string'))) {
    return res.status(400).json({ error: 'Tags must be an array of strings' });
  }

  const game = await db.publishGame(projectId, userId, {
    title: title.trim(),
    description: description || null,
    howToPlay: howToPlay || null,
    tags: tags || [],
    visibility: visibility || 'public',
    allowRemix: allowRemix !== false,
    thumbnailUrl: thumbnailUrl || null
  });

  if (!game) {
    return res.status(500).json({ error: 'Failed to publish game' });
  }

  console.log(`[publish] Game published: ${game.id} (project: ${projectId})`);
  res.json({ success: true, gameId: game.id, game });
});

// GET /api/projects/:projectId/published - Get published status for a project
app.get('/api/projects/:projectId/published', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;

  const game = await db.getPublishedGameByProjectId(req.supabase, projectId);
  res.json({ published: !!game, game: game || null });
});

// DELETE /api/projects/:projectId/publish - Unpublish a game
app.delete('/api/projects/:projectId/publish', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;

  const success = await db.unpublishGame(req.supabase, projectId);
  if (!success) {
    return res.status(500).json({ error: 'Failed to unpublish game' });
  }

  console.log(`[unpublish] Game unpublished: project ${projectId}`);
  res.json({ success: true });
});

// GET /api/published-games - List public games (for discover page)
app.get('/api/published-games', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  const games = await db.getPublicGames(limit, offset);
  res.json({ games });
});

// GET /api/my-published-games - Get user's own published games
app.get('/api/my-published-games', authenticate, async (req, res) => {
  const games = await db.getPublishedGamesByUserId(req.supabase, req.user.id);
  res.json({ games });
});

// ==================== Public Game File Serving ====================

// Inject script for public games (uses fixed V2_DOMAIN, no error detection)
const injectPublicGameHtml = (html) => {
  // Use fixed V2_DOMAIN for consistent asset URLs
  const assetBaseUrl = config.V2_DOMAIN || '';
  const injection = `<script>window.ASSET_BASE_URL=${JSON.stringify(assetBaseUrl)};</script>`;

  // Rewrite /user-assets/ to absolute URLs
  let content = html;
  if (assetBaseUrl) {
    const prefix = `${assetBaseUrl}/user-assets/`;
    content = content.replace(/(^|["'(\s])\/user-assets\//g, `$1${prefix}`);
  }

  if (content.includes('<head>')) {
    content = content.replace('<head>', '<head>' + injection);
  } else if (content.includes('<HEAD>')) {
    content = content.replace('<HEAD>', '<HEAD>' + injection);
  } else {
    content = injection + content;
  }

  return content;
};

// GET /game/:gameId - Game detail page on v2.dreamcore.gg
app.get('/game/:gameId', async (req, res) => {
  // Only serve on v2 domain (not play domain)
  if (req.isPlayDomain) {
    return res.status(404).send('Not found');
  }
  return res.sendFile(path.join(__dirname, '..', 'public', 'game.html'));
});

// GET /g/:gameId - Redirect to /g/:gameId/index.html on play domain
app.get('/g/:gameId', async (req, res) => {
  if (!req.isPlayDomain) {
    return res.status(404).send('Not found');
  }
  // Redirect to index.html
  return res.redirect(`/g/${req.params.gameId}/index.html`);
});

// GET /g/:gameId/* - Public game file serving on play.dreamcore.gg only
app.get('/g/:gameId/*', async (req, res) => {
  const { gameId } = req.params;
  const filename = req.params[0] || 'index.html';

  // Only serve game files on play domain
  if (!req.isPlayDomain) {
    return res.status(404).send('Not found');
  }

  // Validate UUID
  if (!isValidUUID(gameId)) {
    return res.status(400).send('Invalid game ID');
  }

  // Path traversal protection
  if (filename.includes('..') || filename.startsWith('/')) {
    return res.status(400).send('Invalid file path');
  }

  // Get published game info (uses admin client, returns public/unlisted only)
  const game = await db.getPublishedGameById(gameId);
  if (!game || !['public', 'unlisted'].includes(game.visibility)) {
    return res.status(404).send('Game not found');
  }

  const userId = game.user_id;
  const projectId = game.project_id;
  const projectDir = getProjectPath(userId, projectId);
  const localFilePath = path.join(projectDir, filename);

  // Path safety check
  if (!isPathSafe(projectDir, localFilePath)) {
    return res.status(400).send('Invalid path');
  }

  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  };

  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.woff', '.woff2', '.ttf'];
  const isBinary = binaryExtensions.includes(ext);

  // Set CSP header to allow embedding from v2 domain
  const v2Domain = config.V2_DOMAIN || 'https://v2.dreamcore.gg';
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${v2Domain}`);

  // Try local filesystem first
  if (fs.existsSync(localFilePath)) {
    res.type(contentTypes[ext] || 'application/octet-stream');

    if (isBinary) {
      return res.sendFile(localFilePath);
    }

    let content = fs.readFileSync(localFilePath, 'utf-8');

    // Inject ASSET_BASE_URL into index.html
    if (ext === '.html' && filename === 'index.html') {
      content = injectPublicGameHtml(content);
    }

    return res.send(content);
  }

  // Fallback to Modal if USE_MODAL=true
  if (config.USE_MODAL) {
    try {
      const client = getModalClient();
      const content = await client.getFile(userId, projectId, filename);

      if (content === null) {
        return res.status(404).send('File not found');
      }

      res.type(contentTypes[ext] || 'application/octet-stream');

      if (isBinary) {
        return res.send(content);
      }

      let textContent = content;
      if (Buffer.isBuffer(textContent)) {
        textContent = textContent.toString('utf-8');
      }

      // Inject ASSET_BASE_URL into index.html
      if (ext === '.html' && filename === 'index.html') {
        textContent = injectPublicGameHtml(textContent);
      }

      return res.send(textContent);
    } catch (err) {
      console.error('[/g Modal getFile error]', err.message);
      return res.status(500).json({ error: 'Failed to fetch file from Modal' });
    }
  }

  return res.status(404).send('File not found');
});

// ==================== WebSocket Connection Handling ====================

// Track WebSocket connections by userId
const wsConnections = new Map(); // userId -> Set of ws

wss.on('connection', (ws) => {
  let userId = null;
  let currentProjectId = null;
  let jobUnsubscribe = null;
  let sessionId = null;
  let userSupabase = null;  // Supabase client with user's JWT

  // Helper to safely send
  const safeSend = (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  // Helper: check project ownership (async)
  const verifyProjectOwnership = async (projectId) => {
    if (!projectId || !isValidUUID(projectId)) return false;
    if (!userSupabase) return false;
    const project = await db.getProjectById(userSupabase, projectId);
    return project && project.user_id === userId;
  };

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'init':
          // Initialize with access_token (Supabase Auth)
          if (!data.access_token) {
            safeSend({ type: 'error', message: 'access_token required' });
            ws.close(4001, 'Authentication required');
            return;
          }

          const { user, supabase, error } = await verifyWebSocketAuth(data.access_token);
          if (error || !user) {
            safeSend({ type: 'error', message: error || 'Invalid token' });
            ws.close(4001, 'Authentication failed');
            return;
          }

          userId = user.id;
          userSupabase = supabase;  // Store for db operations
          sessionId = data.sessionId || 'unknown';

          // Ensure profile exists in database (for foreign key constraints)
          const profile = await db.getOrCreateUserFromAuth(user);
          console.log(`[${sessionId}] Profile ensured:`, profile ? profile.id : 'null');

          userManager.ensureUserDirectory(userId);  // Ensure user dir exists
          const projects = await userManager.getProjects(userSupabase, userId);

          // Track connection
          if (!wsConnections.has(userId)) {
            wsConnections.set(userId, new Set());
          }
          wsConnections.get(userId).add(ws);

          console.log(`[${sessionId}] Client connected: ${userId} (total: ${wsConnections.get(userId).size} connections)`);

          safeSend({
            type: 'init',
            userId,
            projects
          });
          break;

        case 'ping':
          // Respond to ping for connection health check
          safeSend({ type: 'pong' });
          break;

        case 'selectProject':
          if (!userId) {
            safeSend({ type: 'error', message: 'Not initialized' });
            return;
          }
          if (!await verifyProjectOwnership(data.projectId)) {
            safeSend({ type: 'error', message: 'Access denied' });
            return;
          }
          currentProjectId = data.projectId;

          // Sync files from Modal to local for fast preview (non-blocking)
          if (config.USE_MODAL) {
            userManager.syncFromModal(userId, currentProjectId).catch(err => {
              console.error(`[selectProject] syncFromModal failed for ${currentProjectId}:`, err.message);
            });
          }

          // Get conversation history
          const history = await userManager.getConversationHistory(userSupabase, userId, currentProjectId);

          // Get versions (without edits - edits are fetched on demand)
          const versionsWithEdits = await userManager.getVersions(userId, currentProjectId);

          // Check for active job
          const activeJob = await jobManager.getActiveJob(currentProjectId);

          safeSend({
            type: 'projectSelected',
            projectId: currentProjectId,
            history,
            versions: versionsWithEdits,
            activeJob: activeJob || null
          });

          // Subscribe to active job updates if exists
          if (activeJob && ['pending', 'processing'].includes(activeJob.status)) {
            if (jobUnsubscribe) jobUnsubscribe();
            jobUnsubscribe = jobManager.subscribe(activeJob.id, (update) => {
              safeSend({ type: 'jobUpdate', ...update });
            });
          }
          break;

        case 'createProject':
          if (!userId) {
            safeSend({ type: 'error', message: 'Not initialized' });
            return;
          }

          // Quota check for project creation
          try {
            const projectQuotaResult = await quotaService.tryConsumeProjectQuota(userId);
            if (!projectQuotaResult.allowed) {
              safeSend({
                type: 'error',
                error: {
                  code: 'DAILY_PROJECT_LIMIT_EXCEEDED',
                  message: `本日のプロジェクト作成上限（${projectQuotaResult.limit}回）に達しました`,
                  remaining: 0,
                  limit: projectQuotaResult.limit,
                  resetAt: getNextResetTime()
                }
              });
              return;
            }
          } catch (quotaErr) {
            console.error('[Quota] Project check failed:', quotaErr);
            // Fail-open: allow operation if quota check fails
          }

          const newProject = await userManager.createProject(userSupabase, userId, data.name);
          currentProjectId = newProject.id;
          safeSend({
            type: 'projectCreated',
            project: newProject,
            projects: await userManager.getProjects(userSupabase, userId)
          });
          break;

        case 'deleteProject':
          if (!userId || !data.projectId) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          if (!await verifyProjectOwnership(data.projectId)) {
            safeSend({ type: 'error', message: 'Access denied' });
            return;
          }
          await userManager.deleteProject(userSupabase, userId, data.projectId);
          if (currentProjectId === data.projectId) {
            currentProjectId = null;
          }
          safeSend({
            type: 'projectDeleted',
            projectId: data.projectId,
            projects: await userManager.getProjects(userSupabase, userId)
          });
          break;

        case 'renameProject':
          if (!userId || !data.projectId || !data.name) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          if (!await verifyProjectOwnership(data.projectId)) {
            safeSend({ type: 'error', message: 'Access denied' });
            return;
          }
          const renamedProject = await userManager.renameProject(userSupabase, userId, data.projectId, data.name);
          safeSend({
            type: 'projectRenamed',
            project: renamedProject,
            projects: await userManager.getProjects(userSupabase, userId)
          });
          break;

        case 'getProjectInfo':
          if (!userId || !data.projectId) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          if (!await verifyProjectOwnership(data.projectId)) {
            safeSend({ type: 'error', message: 'Access denied' });
            return;
          }
          const projectInfo = await db.getProjectById(userSupabase, data.projectId);
          if (projectInfo) {
            safeSend({
              type: 'projectInfo',
              project: {
                id: projectInfo.id,
                name: projectInfo.name,
                createdAt: projectInfo.created_at,
                updatedAt: projectInfo.updated_at
              }
            });
          }
          break;

        case 'testError':
          // Test error handling by triggering simulated errors from Modal
          // Usage: { type: 'testError', errorType: 'timeout' | 'general' | 'sandbox' | 'network' | 'rate_limit' }
          if (!userId || !currentProjectId) {
            safeSend({ type: 'error', message: 'No project selected' });
            return;
          }
          if (!config.USE_MODAL) {
            safeSend({ type: 'error', message: 'Test errors only available in Modal mode' });
            return;
          }
          try {
            const modalClient = require('./modalClient');
            const testErrorType = data.errorType || 'timeout';
            console.log(`[Test] Triggering test error: ${testErrorType}`);

            // Create a test job (requires userId and projectId)
            const testJob = await jobManager.createJob(userId, currentProjectId);
            jobManager.subscribe(testJob.id, (update) => {
              safeSend({ ...update, jobId: testJob.id });
            });

            // Start the test
            safeSend({ type: 'started', job: testJob });
            jobManager.updateProgress(testJob.id, 10, 'テストエラーをシミュレート中...');

            // Call Modal with test error parameter
            for await (const event of modalClient.generateGame({
              user_id: userId,
              project_id: currentProjectId,
              prompt: 'test',
              _test_error: testErrorType
            })) {
              if (event.type === 'failed') {
                await jobManager.failJob(testJob.id, event.userMessage || event.error, {
                  code: event.code,
                  userMessage: event.userMessage,
                  recoverable: event.recoverable,
                  exitCode: event.exitCode
                });
              } else if (event.type === 'completed') {
                await jobManager.completeJob(testJob.id, { message: 'Test completed' });
              }
            }
          } catch (err) {
            console.error('[Test] Error:', err.message);
            safeSend({ type: 'error', message: err.message });
          }
          break;

        case 'message':
          if (!userId || !currentProjectId) {
            safeSend({ type: 'error', message: 'No project selected' });
            return;
          }

          // Quota check for message sending
          try {
            const messageQuotaResult = await quotaService.tryConsumeMessageQuota(userId);
            if (!messageQuotaResult.allowed) {
              safeSend({
                type: 'error',
                error: {
                  code: 'DAILY_MESSAGE_LIMIT_EXCEEDED',
                  message: `本日のメッセージ上限（${messageQuotaResult.limit}回）に達しました`,
                  remaining: 0,
                  limit: messageQuotaResult.limit,
                  resetAt: getNextResetTime()
                }
              });
              return;
            }
          } catch (quotaErr) {
            console.error('[Quota] Message check failed:', quotaErr);
            // Fail-open: allow operation if quota check fails
          }

          let userMessage = data.content;
          const debugOptions = data.debugOptions || {};

          // Auto-fix mode: skip Gemini, use Claude Code CLI directly
          if (data.autoFix) {
            debugOptions.useClaude = true;
            console.log('[AutoFix] Using Claude Code CLI directly for bug fix');
          }

          // Check if style selection is needed for new game creation
          const shouldCheckStyleSelection = !data.skipStyleSelection && !data.selectedStyle;
          if (shouldCheckStyleSelection) {
            // Check if this is a new project
            const files = await userManager.listProjectFiles(userId, currentProjectId);
            let isNewProject = true;
            if (files.length > 0) {
              const indexContent = await userManager.readProjectFile(userId, currentProjectId, 'index.html');
              const isInitialWelcomePage = indexContent &&
                indexContent.length < 2000 &&
                indexContent.includes('Welcome to Game Creator');
              if (!isInitialWelcomePage) {
                isNewProject = false;
              }
            }

            // Check if user is requesting game creation (and dimension is specified)
            const isGameCreationRequest = /作って|作成|create|ゲーム/i.test(userMessage);
            const has2DSpecified = /2d|２d|2D|２D/i.test(userMessage);
            const has3DSpecified = /3d|３d|3D|３D/i.test(userMessage);
            const hasDimensionSpecified = has2DSpecified || has3DSpecified;

            if (isNewProject && isGameCreationRequest && hasDimensionSpecified) {
              // Show style selection
              const dimension = has3DSpecified ? '3d' : '2d';

              // Get styles with images
              const styles = getStyleOptionsWithImages(dimension);

              safeSend({
                type: 'styleOptions',
                dimension,
                styles,
                originalMessage: userMessage
              });
              return; // Wait for user to select style
            }
          }

          // If style was selected, generate visual guide with AI
          if (data.selectedStyle) {
            const { dimension, styleId } = data.selectedStyle;
            const style = getStyleById(dimension, styleId);
            console.log(`[Style Selection] Received: dimension=${dimension}, styleId=${styleId}, style=${style?.name}`);

            if (style) {
              // Save STYLE.md to project for persistence across updates
              try {
                const styleContent = `# ビジュアルスタイル: ${style.name}\n\nID: ${styleId}\nDimension: ${dimension}\n\n${style.guideline || ''}`;
                await userManager.writeProjectFile(userSupabase, userId, currentProjectId, 'STYLE.md', styleContent);
                console.log(`[Style Selection] Saved STYLE.md for ${style.name}`);
              } catch (err) {
                console.error(`[Style Selection] Failed to save STYLE.md:`, err.message);
              }

              try {
                // Generate AI-powered visual guide
                const guide = await generateVisualGuide(userMessage, dimension, styleId);
                if (guide) {
                  const formattedGuide = formatGuideForCodeGeneration(guide);
                  userMessage = `${userMessage}\n\n${formattedGuide}`;
                  console.log(`[Style Selection] AI-generated guide for: ${guide.styleName}`);
                  console.log(`[Style Selection] Full message length: ${userMessage.length}`);
                }
              } catch (error) {
                console.error(`[Style Selection] Guide generation failed:`, error.message);
                // Fallback: use guideline directly if available
                if (style.guideline) {
                  userMessage = `${userMessage}\n\n${style.guideline}`;
                }
              }
            }
          } else {
            console.log(`[Style Selection] No selectedStyle in data`);
          }

          await userManager.addToHistory(userSupabase, userId, currentProjectId, 'user', data.content); // Store original message

          // Log debug options if enabled
          if (debugOptions.disableSkills || debugOptions.useClaude) {
            console.log('Debug options:', debugOptions);
          }

          // Use job-based async processing
          if (data.async !== false) {
            try {
              const { job, isExisting, startProcessing } = await claudeRunner.runClaudeAsJob(
                userId,
                currentProjectId,
                userMessage,
                debugOptions
              );

              // Subscribe to job updates BEFORE starting processing
              if (jobUnsubscribe) jobUnsubscribe();
              jobUnsubscribe = jobManager.subscribe(job.id, (update) => {
                console.log('[DEBUG] Job update received:', update.type);
                // Handle stream content directly
                if (update.type === 'stream') {
                  safeSend({ type: 'stream', content: update.content });
                } else if (update.type === 'geminiCode' || update.type === 'geminiChat' || update.type === 'geminiRestore' || update.type === 'imagesGenerated') {
                  // Send Gemini messages directly with their original type
                  console.log('[DEBUG] Sending Gemini message:', update.type);
                  safeSend(update);
                } else if (update.type === 'projectRenamed') {
                  // Send project rename notification directly
                  safeSend(update);
                } else {
                  safeSend({ type: 'jobUpdate', ...update });

                  // On completion, send game updated
                  if (update.type === 'completed') {
                    safeSend({
                      type: 'gameUpdated',
                      userId,
                      projectId: currentProjectId
                    });
                  }
                }
              });

              safeSend({
                type: 'jobStarted',
                job,
                isExisting
              });

              // Start processing AFTER subscription is set up
              startProcessing();

            } catch (error) {
              // Handle slot limit errors with appropriate codes
              if (error.code === 'USER_LIMIT_EXCEEDED') {
                // Get active jobs for the user to show which project is running
                const activeJobs = await jobManager.getActiveJobsForUser(userId);
                const { maxConcurrentPerUser } = config.RATE_LIMIT.cli;

                safeSend({
                  type: 'limitExceeded',
                  limit: maxConcurrentPerUser,
                  inProgress: activeJobs.length,
                  jobs: activeJobs,
                  // Store pending prompt info for retry after cancel
                  pendingPrompt: {
                    content: data.rawContent || data.content,  // Prefer raw user input
                    attachedAssets: data.attachedAssets || [],
                    selectedStyle: data.selectedStyle
                  }
                });
              } else if (error.code === 'SYSTEM_LIMIT_EXCEEDED') {
                safeSend(createWsError(ErrorCodes.SYSTEM_LIMIT_EXCEEDED, error.message));
              } else {
                safeSend(createWsError(ErrorCodes.OPERATION_FAILED, error.message));
              }
            }
          } else {
            // Legacy synchronous processing
            safeSend({ type: 'status', message: 'Processing...' });

            try {
              const result = await claudeRunner.runClaude(
                userId,
                currentProjectId,
                userMessage,
                (progress) => safeSend(progress)
              );

              userManager.createVersionSnapshot(userId, currentProjectId, userMessage.substring(0, 50));
              await userManager.addToHistory(userSupabase, userId, currentProjectId, 'assistant', result.output ? 'ゲームを更新しました' : '');

              safeSend({
                type: 'gameUpdated',
                userId,
                projectId: currentProjectId
              });
            } catch (error) {
              await userManager.addToHistory(userSupabase, userId, currentProjectId, 'assistant', `Error: ${error.message}`);
              safeSend({
                type: 'error',
                message: error.message
              });
            }
          }
          break;

        case 'getJobStatus':
          if (!userId) {
            safeSend({ type: 'error', message: 'Not authenticated' });
            return;
          }
          if (!data.jobId) {
            safeSend({ type: 'error', message: 'Job ID required' });
            return;
          }
          const jobStatus = await jobManager.getJob(data.jobId);
          if (!jobStatus || jobStatus.user_id !== userId) {
            safeSend({ type: 'jobStatus', job: null });
            return;
          }
          safeSend({
            type: 'jobStatus',
            job: jobStatus
          });
          break;

        case 'subscribeJob':
          if (!userId) {
            safeSend({ type: 'error', message: 'Not authenticated' });
            return;
          }
          if (!data.jobId) {
            safeSend({ type: 'error', message: 'Job ID required' });
            return;
          }
          // Verify ownership before subscribing
          const jobToSubscribe = await jobManager.getJob(data.jobId);
          if (!jobToSubscribe || jobToSubscribe.user_id !== userId) {
            safeSend({ type: 'error', message: 'Job not found' });
            return;
          }
          if (jobUnsubscribe) jobUnsubscribe();
          jobUnsubscribe = jobManager.subscribe(data.jobId, (update) => {
            safeSend({ type: 'jobUpdate', ...update });
          });
          safeSend({ type: 'subscribed', jobId: data.jobId });
          break;

        case 'cancelJob':
          // Cancel a running job (used when limit is exceeded and user wants to cancel previous)
          if (!userId) {
            safeSend({ type: 'error', message: 'Not authenticated' });
            return;
          }
          if (!data.jobId) {
            safeSend({ type: 'error', message: 'Job ID required' });
            return;
          }
          // Verify ownership before cancelling
          const jobToCancel = await jobManager.getJob(data.jobId);
          if (!jobToCancel || jobToCancel.user_id !== userId) {
            safeSend({ type: 'error', message: 'Job not found' });
            return;
          }
          try {
            await jobManager.cancelJob(data.jobId);
            // Note: slot is released by processJobWithSlot's finally block
            // after the AbortError is processed
            safeSend({ type: 'jobCancelled', jobId: data.jobId });
          } catch (cancelError) {
            console.error('Failed to cancel job:', cancelError);
            safeSend({ type: 'error', message: 'Failed to cancel job' });
          }
          break;

        case 'getVersions':
          if (!userId || !data.projectId) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          if (!await verifyProjectOwnership(data.projectId)) {
            safeSend({ type: 'error', message: 'Access denied' });
            return;
          }
          const versionResult = await userManager.getVersions(userId, data.projectId);
          safeSend({
            type: 'versionsList',
            projectId: data.projectId,
            versions: versionResult.versions,
            currentHead: versionResult.currentHead,
            autoInitialized: versionResult.autoInitialized || false
          });
          break;

        case 'getVersionEdits':
          if (!userId || !data.projectId || !data.versionHash) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          if (!await verifyProjectOwnership(data.projectId)) {
            safeSend({ type: 'error', message: 'Access denied' });
            return;
          }
          const editsData = await userManager.getVersionEdits(userId, data.projectId, data.versionHash);
          safeSend({
            type: 'versionEdits',
            projectId: data.projectId,
            versionHash: data.versionHash,
            edits: editsData?.edits || [],
            summary: editsData?.summary || ''
          });
          break;

        case 'restoreVersion':
          if (!userId || !data.projectId || !data.versionId) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          // Validate versionId format before processing
          if (!isValidGitHash(data.versionId)) {
            safeSend({ type: 'error', message: 'Invalid version ID format' });
            return;
          }
          if (!await verifyProjectOwnership(data.projectId)) {
            safeSend({ type: 'error', message: 'Access denied' });
            return;
          }

          // Send progress: checkout
          safeSend({
            type: 'restoreProgress',
            stage: 'checkout',
            message: 'ファイルを復元中...'
          });

          const restoreResult = await userManager.restoreVersion(userId, data.projectId, data.versionId);
          if (restoreResult.success) {
            // Send progress: sync (if Modal is enabled)
            if (config.USE_MODAL) {
              safeSend({
                type: 'restoreProgress',
                stage: 'sync',
                message: 'ファイルを同期中...'
              });
            }

            // Sync restored files from Modal to local for fast preview
            await userManager.syncFromModal(userId, data.projectId);

            safeSend({
              type: 'versionRestored',
              projectId: data.projectId,
              versionId: data.versionId
            });

            // Regenerate SPEC.md after restore to reflect restored code
            if (restoreResult.needsSpecRegeneration) {
              claudeRunner.updateSpec(userId, data.projectId).catch(err => {
                console.error('SPEC.md regeneration after restore failed:', err.message);
              });
            }
          } else {
            safeSend({
              type: 'error',
              message: restoreResult.error
            });
          }
          break;

        case 'cancel':
          if (data.jobId) {
            // Verify job ownership
            const cancelJobData = await jobManager.getJob(data.jobId);
            if (cancelJobData && cancelJobData.user_id === userId) {
              await claudeRunner.cancelJob(data.jobId);
              safeSend({ type: 'cancelled', message: 'Job cancelled', jobId: data.jobId });
            } else {
              safeSend({ type: 'error', message: 'Access denied' });
            }
          } else if (userId && currentProjectId) {
            claudeRunner.cancelRun(`${userId}-${currentProjectId}`);
            safeSend({ type: 'cancelled', message: 'Operation cancelled' });
          }
          break;

        default:
          safeSend({ type: 'error', message: 'Unknown message type' });
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      safeSend({ type: 'error', message: 'Invalid message format' });
    }
  });

  ws.on('close', () => {
    console.log(`[${sessionId}] Client disconnected: ${userId}`);

    // Clean up
    if (jobUnsubscribe) jobUnsubscribe();

    // Remove from connections
    if (userId && wsConnections.has(userId)) {
      wsConnections.get(userId).delete(ws);
      if (wsConnections.get(userId).size === 0) {
        wsConnections.delete(userId);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// ==================== Project API Endpoints ====================

// Get project by ID
// NOTE: /api/project/:projectId removed - use /api/projects/:projectId instead

// Get all projects for a user
// Query params:
//   ?published=true - Only return projects that have been published
app.get('/api/projects', authenticate, async (req, res) => {
  const publishedOnly = req.query.published === 'true';

  if (publishedOnly) {
    // Get only published games
    const publishedGames = await db.getPublishedGamesByUserId(req.supabase, req.user.id);
    const projects = publishedGames.map(g => ({
      id: g.project_id,
      name: g.title,
      description: g.description || '',
      isPublic: true,
      isPublished: true,
      publishedGameId: g.id,
      createdAt: g.published_at,
      updatedAt: g.updated_at
    }));
    return res.json({ projects });
  }

  const projects = await userManager.getProjects(req.supabase, req.user.id);
  res.json({ projects });
});

// Get single project by ID
app.get('/api/projects/:projectId', authenticate, checkProjectOwnership, (req, res) => {
  res.json(req.project);
});

// ==================== Publish API ====================

// Get publish draft
app.get('/api/projects/:projectId/publish-draft', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;
  const draft = await db.getPublishDraft(req.supabase, projectId);
  res.json(draft || null);
});

// Save publish draft
app.put('/api/projects/:projectId/publish-draft', authenticate, checkProjectOwnership, async (req, res) => {
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

// Generate title, description, tags using Claude CLI (Haiku)
app.post('/api/projects/:projectId/generate-publish-info', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;

  try {
    // Use Modal when enabled
    if (config.USE_MODAL) {
      const modal = getModalClient();
      const result = await modal.generatePublishInfo({
        user_id: req.user.id,
        project_id: projectId,
        project_name: req.project.name,
      });

      // Check for error in response
      if (result.error) {
        console.error('Error generating publish info:', result.error);
        return res.status(500).json({ error: result.error, raw: result.raw || '' });
      }

      return res.json(result);
    }

    // Local fallback (when USE_MODAL=false)
    const projectDir = getProjectPath(req.user.id, projectId);
    const indexPath = path.join(projectDir, 'index.html');
    let gameCode = '';
    if (fs.existsSync(indexPath)) {
      gameCode = fs.readFileSync(indexPath, 'utf-8');
    }

    // Get spec content (try specs/game.md first, then spec.md)
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

    const { spawn } = require('child_process');
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

// Generate thumbnail using Nano Banana
app.post('/api/projects/:projectId/generate-thumbnail', authenticate, checkProjectOwnership, async (req, res) => {
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

    // Asset descriptions are now in spec.md (in the "使用画像アセット" section)
    // The spec is already included in specContent, so no need to build separate assetSection

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

    const { spawn } = require('child_process');

    // Step 1: Generate image prompt with Modal Haiku
    console.log('[Thumbnail] Generating prompt with Modal Haiku...');
    let imagePrompt = '';
    try {
      const haikuResult = await modalClient.chatHaiku({
        message: promptGeneratorPrompt,
        game_spec: '',
        conversation_history: [],
      });
      imagePrompt = (haikuResult.message || '')
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
    const nanoBananaScript = path.join(__dirname, '..', '.claude', 'skills', 'nanobanana', 'generate.py');
    const nanoBananaVenvPython = path.join(__dirname, '..', '.claude', 'skills', 'nanobanana', '.venv', 'bin', 'python');
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
        gitCommitAsync(projectDir, 'Update thumbnail');

        // Return URL to the generated thumbnail
        const thumbnailUrl = `/api/projects/${projectId}/thumbnail?t=${Date.now()}`;
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

// Upload thumbnail image
app.post('/api/projects/:projectId/upload-thumbnail', authenticate, checkProjectOwnership, upload.single('thumbnail'), async (req, res) => {
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

    // Move uploaded file to project directory as thumbnail.webp
    fs.copyFileSync(req.file.path, thumbnailPath);
    fs.unlinkSync(req.file.path); // Remove temp file

    // Commit to git (non-blocking, safe)
    gitCommitAsync(projectDir, 'Upload thumbnail');

    const thumbnailUrl = `/api/projects/${projectId}/thumbnail?t=${Date.now()}`;
    res.json({ success: true, thumbnailUrl });

  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get thumbnail image
// V2: Public access (no auth required) - thumbnail is meant to be shown
app.get('/api/projects/:projectId/thumbnail', async (req, res) => {
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

    const projectDir = getProjectPath(project.user_id, projectId);

    // Check for webp first (uploaded), then png (generated)
    const webpPath = path.join(projectDir, 'thumbnail.webp');
    const pngPath = path.join(projectDir, 'thumbnail.png');

    if (fs.existsSync(webpPath)) {
      res.type('image/webp').sendFile(webpPath);
    } else if (fs.existsSync(pngPath)) {
      res.type('image/png').sendFile(pngPath);
    } else {
      res.status(404).send('Not found');
    }
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(404).send('Not found');  // Hide errors as 404
  }
});

// ==================== Game Movie Generation ====================

// Generate game demo movie using Remotion + AI
// AI reads the game code and generates a Remotion component that recreates the gameplay
app.post('/api/projects/:projectId/generate-movie', authenticate, checkProjectOwnership, async (req, res) => {
  const { projectId } = req.params;

  try {
    const projectDir = getProjectPath(req.user.id, projectId);
    const gameVideoDir = path.join(__dirname, '..', 'game-video');

    // Read the game code
    const indexPath = path.join(projectDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ error: 'Game code not found' });
    }
    const gameCode = fs.readFileSync(indexPath, 'utf-8');

    // Read the game spec
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

    // Gather assets and copy to Remotion public directory
    const projectAssets = await db.getProjectAssets(req.supabase, projectId);
    const remotionPublicDir = path.join(gameVideoDir, 'public');

    // Ensure public directory exists
    if (!fs.existsSync(remotionPublicDir)) {
      fs.mkdirSync(remotionPublicDir, { recursive: true });
    }

    // Clear old assets
    const existingFiles = fs.readdirSync(remotionPublicDir);
    existingFiles.forEach(file => {
      if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.webp')) {
        fs.unlinkSync(path.join(remotionPublicDir, file));
      }
    });

    // Copy assets to Remotion public dir
    const assetInfo = [];
    projectAssets
      .filter(a => !a.is_deleted && a.mime_type?.startsWith('image/'))
      .forEach((a, index) => {
        if (a.storage_path && fs.existsSync(a.storage_path)) {
          const ext = path.extname(a.storage_path);
          const newName = `asset${index}${ext}`;
          fs.copyFileSync(a.storage_path, path.join(remotionPublicDir, newName));
          assetInfo.push({
            name: a.original_name,
            staticName: newName,
            description: a.ai_description || ''
          });
        }
      });

    console.log('[Movie] Generating demo for project:', projectId);
    console.log('[Movie] Assets copied:', assetInfo.length);

    // Generate Remotion component using Claude
    const { spawn } = require('child_process');

    const prompt = `あなたはRemotionの専門家です。以下のゲーム情報を読んで、そのゲームのデモプレイ動画を再現するRemotionコンポーネントを生成してください。

## ゲーム仕様書
${specContent ? specContent.slice(0, 5000) : '（仕様書なし）'}

**重要**: 仕様書に記載されている仮想解像度（virtualWidth/virtualHeight）とキャラクターサイズを必ず確認し、実際のゲーム画面と同じ比率・サイズ感で再現してください。

## ゲームコード
\`\`\`html
${gameCode.slice(0, 12000)}
\`\`\`

## 利用可能なアセット画像
${assetInfo.map(a => `- ${a.staticName}: ${a.name}${a.description ? ` (${a.description})` : ''}`).join('\n') || 'なし'}

## 要件
- 7秒間（210フレーム、30fps）のデモ動画を4つのシーンで構成
- **各シーンは視覚的に明確に区別できるようにする**（カット割りが分かるように）

### シーン構成（各シーンで異なるカメラワーク・演出を使う）
1. **シーン1 (0-45f)**: イントロ
   - 画面全体を引きで見せる（scale: 0.8〜0.9）
   - タイトルが大きくフェードイン
   - ゲーム要素は静止または軽い動き

2. **シーン2 (45-105f)**: メインプレイ
   - 通常のゲーム画面（scale: 1.0）
   - プレイヤーと敵が活発に動く
   - タイトルは小さく隅に移動または非表示

3. **シーン3 (105-165f)**: クライマックス・フォーカス
   - **ズームイン演出（scale: 1.3〜1.5）**
   - **ビネット効果（画面端を暗く）**
   - 激しいアクション（敵撃破、爆発など）

4. **シーン4 (165-210f)**: フィニッシュ
   - フラッシュ効果で場面転換を強調
   - 引きの画面に戻る
   - タイトルが再度大きく表示
   - 「PLAY NOW」的なCTA演出

### 技術要件
- アセット画像は staticFile() で読み込む（例: staticFile("asset0.png")）
- ゲームタイトル「${req.project.name}」を表示
- interpolate() でシーンごとにscale/opacity/positionを変化させる
- ビネット効果: radial-gradient(circle, transparent 50%, rgba(0,0,0,0.8) 100%)
- ゲームの雰囲気が伝わる魅力的なデモ

### サイズ計算（重要）
- 動画サイズ: 1080x1920 (9:16)
- 仕様書の仮想解像度を読み、実際のゲームと同じ比率でキャラクターを描画
- 例: 仮想解像度が 390x700 でプレイヤーサイズが 50px なら、動画では 50 * (1080/390) ≈ 138px
- **キャラクターが小さすぎないように注意** - 実際のゲーム画面を見た時と同じサイズ感にする

## 出力形式
以下の形式でRemotionコンポーネントのみを出力してください（説明不要）:

\`\`\`tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img, staticFile } from "remotion";

export const GameDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // アセット画像の読み込み例
  // const playerImg = staticFile("asset0.png");
  // <Img src={playerImg} ... />

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* ゲーム要素のアニメーション */}
    </AbsoluteFill>
  );
};
\`\`\``;

    const claude = spawn('claude', [
      '--print',
      '--model', 'sonnet',
      '--dangerously-skip-permissions'
    ], {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    claude.stdin.write(prompt);
    claude.stdin.end();

    let claudeOutput = '';
    claude.stdout.on('data', (data) => {
      claudeOutput += data.toString();
    });

    claude.stderr.on('data', (data) => {
      console.log('[Movie] Claude stderr:', data.toString());
    });

    claude.on('close', async (claudeCode) => {
      if (claudeCode !== 0) {
        console.error('[Movie] Claude failed:', claudeCode);
        return res.status(500).json({ error: 'Failed to generate demo component' });
      }

      // Extract TSX code from Claude's output
      const tsxMatch = claudeOutput.match(/```tsx\n([\s\S]*?)```/);
      if (!tsxMatch) {
        console.error('[Movie] No TSX code found in Claude output');
        console.log('[Movie] Claude output:', claudeOutput.slice(0, 500));
        return res.status(500).json({ error: 'Failed to extract component code' });
      }

      const componentCode = tsxMatch[1];
      console.log('[Movie] Generated component code length:', componentCode.length);

      // Write the generated component
      const demoPath = path.join(gameVideoDir, 'src', 'GameDemo.tsx');
      fs.writeFileSync(demoPath, componentCode);

      // Update Root.tsx to use GameDemo
      const rootCode = `import { Composition } from "remotion";
import { GameDemo } from "./GameDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="GameVideo"
      component={GameDemo}
      durationInFrames={210}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;
      fs.writeFileSync(path.join(gameVideoDir, 'src', 'Root.tsx'), rootCode);

      // Render the video
      const outputPath = path.join(projectDir, 'movie.mp4');

      console.log('[Movie] Starting Remotion render...');

      const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      const envBrowserPath = process.env.REMOTION_BROWSER_EXECUTABLE || process.env.CHROME_PATH || null;
      const remotionBrowserDir = path.join(gameVideoDir, 'node_modules', '.remotion', 'chrome-headless-shell');
      const headlessShellPlatforms = process.platform === 'darwin'
        ? ['mac-arm64', 'mac-x64']
        : process.platform === 'linux'
          ? ['linux-x64', 'linux-arm64']
          : ['win64'];
      const headlessShellCandidates = headlessShellPlatforms.map((platform) => {
        const exeName = platform === 'win64' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
        return path.join(remotionBrowserDir, platform, `chrome-headless-shell-${platform}`, exeName);
      });
      const headlessShellPath = headlessShellCandidates.find((candidate) => fs.existsSync(candidate)) || null;

      const browserExecutable = envBrowserPath
        ? (fs.existsSync(envBrowserPath) ? envBrowserPath : null)
        : headlessShellPath || (fs.existsSync(defaultChromePath) ? defaultChromePath : null);
      const chromeMode = headlessShellPath && browserExecutable === headlessShellPath
        ? 'headless-shell'
        : 'chrome-for-testing';

      const remotionArgs = [
        'remotion', 'render',
        'GameVideo',
        outputPath,
        '--log=verbose',
        `--chrome-mode=${chromeMode}`
      ];
      if (browserExecutable) {
        remotionArgs.push('--browser-executable', browserExecutable);
      }

      const remotion = spawn('npx', remotionArgs, {
        cwd: gameVideoDir,
        env: { ...process.env }
      });

      let renderOutput = '';
      remotion.stdout.on('data', (data) => {
        renderOutput += data.toString();
        console.log('[Movie] Render:', data.toString().trim());
      });

      remotion.stderr.on('data', (data) => {
        renderOutput += data.toString();
        console.log('[Movie] Render stderr:', data.toString().trim());
      });

      remotion.on('close', (renderCode) => {
        if (renderCode === 0 && fs.existsSync(outputPath)) {
          console.log('[Movie] Render successful!');

          // Git commit (non-blocking, safe)
          gitCommitAsync(projectDir, 'Generate demo movie');

          const movieUrl = `/api/projects/${projectId}/movie?t=${Date.now()}`;
          res.json({ success: true, movieUrl, duration: 7 });
        } else {
          console.error('[Movie] Render failed:', renderCode);
          console.error('[Movie] Output:', renderOutput.slice(-4000));
          res.status(500).json({ error: 'Failed to render video', output: renderOutput.slice(-4000) });
        }
      });

      remotion.on('error', (error) => {
        console.error('[Movie] Render spawn error:', error);
        res.status(500).json({ error: error.message });
      });
    });

    claude.on('error', (error) => {
      console.error('[Movie] Claude spawn error:', error);
      res.status(500).json({ error: error.message });
    });

  } catch (error) {
    console.error('Error generating movie:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve movie file (owner-only for Phase 1)
app.get('/api/projects/:projectId/movie', authenticate, checkProjectOwnership, (req, res) => {
  try {
    const projectDir = getProjectPath(req.user.id, req.params.projectId);
    const moviePath = path.join(projectDir, 'movie.mp4');

    if (fs.existsSync(moviePath)) {
      res.type('video/mp4').sendFile(moviePath);
    } else {
      res.status(404).send('Movie not found');
    }
  } catch (error) {
    console.error('Error serving movie:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== My Page Route ====================

app.get('/mypage', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mypage.html'));
});

// ==================== Play Screen Route ====================

// Phase 1: Owner-only preview
app.get('/play/:projectId', authenticate, async (req, res) => {
  const { projectId } = req.params;

  // Validate and check ownership
  if (!isValidUUID(projectId)) {
    return res.status(400).send('Invalid project ID');
  }

  const project = await db.getProjectById(req.supabase, projectId);
  if (!project) {
    return res.status(404).send('Project not found');
  }

  if (project.user_id !== req.user.id) {
    return res.status(403).send('Access denied');
  }

  res.sendFile(path.join(__dirname, '..', 'public', 'play.html'));
});

// ==================== Public Games API ====================

// Get random public game (must be before :projectId to avoid matching 'random' as projectId)
// NOTE: /api/public/games/* routes removed for Phase 1 (owner-only)

// ==================== Notifications Route ====================

app.get('/notifications', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'notifications.html'));
});

// ==================== Page Routes ====================

// Login page (root)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Discover page
app.get('/discover', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'discover.html'));
});

// Create page (project list)
app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'create.html'));
});

// Editor page (project detail)
app.get('/project/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'editor.html'));
});

// ==================== Server Start ====================

server.listen(PORT, () => {
  console.log(`Game Creator MVP running at http://localhost:${PORT}`);

  // Preload skill metadata in background (non-blocking)
  claudeRunner.preloadSkillMetadata().then(() => {
    console.log('Skill metadata preloaded in background');
  }).catch(err => {
    console.error('Failed to preload skill metadata:', err.message);
  });
});
