const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const userManager = require('./userManager');
const { claudeRunner, jobManager } = require('./claudeRunner');
const db = require('./database');
const geminiClient = require('./geminiClient');
const { getStyleById } = require('./stylePresets');
const { getStyleOptionsWithImages } = require('./styleImageCache');
const { generateVisualGuide, formatGuideForCodeGeneration } = require('./visualGuideGenerator');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Ensure assets directory exists
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ASSETS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

// JSON body parser
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==================== Authentication API Endpoints ====================

// Login with username only (invite-only)
app.post('/api/auth/login', (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  // Find user by username
  const loginUser = db.getLoginUserByUsername(username.trim().toLowerCase());
  if (!loginUser) {
    return res.status(401).json({ error: 'このIDは登録されていません' });
  }

  // Create session
  const session = db.createSession(loginUser.id);

  // Update last login
  db.updateLoginUserLastLogin(loginUser.id);

  // Get linked user's visitor_id
  const user = db.getUserById(loginUser.user_id);

  res.json({
    success: true,
    sessionId: session.id,
    user: {
      id: loginUser.id,
      username: loginUser.username,
      displayName: loginUser.display_name,
      visitorId: user ? user.visitor_id : null
    }
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.body.sessionId;

  if (sessionId) {
    db.deleteSession(sessionId);
  }

  res.json({ success: true });
});

// Get current user from session
app.get('/api/auth/me', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;

  if (!sessionId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Validate session
  const session = db.getSessionById(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  // Get login user
  const loginUser = db.getLoginUserById(session.login_user_id);
  if (!loginUser) {
    return res.status(401).json({ error: 'User not found' });
  }

  // Get linked user's visitor_id
  const user = db.getUserById(loginUser.user_id);

  res.json({
    user: {
      id: loginUser.id,
      username: loginUser.username,
      displayName: loginUser.display_name,
      visitorId: user ? user.visitor_id : null
    }
  });
});

// ==================== REST API Endpoints ====================

// Get job status
app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobManager.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Get active job for a project
app.get('/api/projects/:projectId/active-job', (req, res) => {
  const job = jobManager.getActiveJob(req.params.projectId);
  res.json({ job: job || null });
});

// Get jobs for a project
app.get('/api/projects/:projectId/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const jobs = jobManager.getProjectJobs(req.params.projectId, limit);
  res.json({ jobs });
});

// Cancel a job
app.post('/api/jobs/:jobId/cancel', (req, res) => {
  const job = claudeRunner.cancelJob(req.params.jobId);
  res.json({ success: true, job });
});

// Get project HTML code
app.get('/api/projects/:projectId/code', (req, res) => {
  const visitorId = req.query.visitorId;
  if (!visitorId) {
    return res.status(401).json({ error: 'No visitor ID' });
  }

  const projectDir = userManager.getProjectDir(visitorId, req.params.projectId);
  const indexPath = path.join(projectDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const code = fs.readFileSync(indexPath, 'utf-8');
  res.json({ code });
});

// Get latest AI context (Gemini edits, summary, etc.)
app.get('/api/projects/:projectId/ai-context', (req, res) => {
  const visitorId = req.query.visitorId;
  if (!visitorId) {
    return res.status(401).json({ error: 'No visitor ID' });
  }

  const context = userManager.getLatestAIContext(visitorId, req.params.projectId);
  res.json({ context });
});

// Download project as ZIP
app.get('/api/projects/:projectId/download', async (req, res) => {
  const visitorId = req.query.visitorId;
  if (!visitorId) {
    return res.status(401).json({ error: 'No visitor ID' });
  }

  const projectDir = userManager.getProjectDir(visitorId, req.params.projectId);

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
app.post('/api/generate-image', async (req, res) => {
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

// ==================== Asset API Endpoints ====================

// Upload asset
app.post('/api/assets/upload', upload.single('file'), (req, res) => {
  try {
    const { visitorId } = req.body;
    if (!visitorId) {
      return res.status(400).json({ error: 'visitorId required' });
    }

    const user = db.getUserByVisitorId(visitorId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const asset = db.createAsset(
      user.id,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.mimetype,
      req.file.size,
      false,  // isPublic
      req.body.tags || null,
      req.body.description || null
    );

    res.json({
      success: true,
      asset: {
        id: asset.id,
        filename: asset.original_name,
        mimeType: asset.mime_type,
        size: asset.size,
        url: `/api/assets/${asset.id}`
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search assets (must be before /:id to avoid route collision)
app.get('/api/assets/search', (req, res) => {
  const { q, visitorId } = req.query;

  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  let assets;
  if (q) {
    assets = db.searchAssets(user.id, q);
  } else {
    assets = db.getAccessibleAssets(user.id);
  }

  res.json({
    assets: assets.map(a => ({
      id: a.id,
      filename: a.original_name,
      mimeType: a.mime_type,
      size: a.size,
      isPublic: !!a.is_public,
      isOwner: a.owner_id === user.id,
      tags: a.tags,
      description: a.description,
      url: `/api/assets/${a.id}`
    }))
  });
});

// Get asset file (reference-based: checks deletion and availability)
app.get('/api/assets/:id', (req, res) => {
  // Use getActiveAsset to check deletion status and availability period
  const asset = db.getActiveAsset(req.params.id);

  if (!asset) {
    // Check if asset exists but is deleted/unavailable
    const rawAsset = db.getAssetById(req.params.id);
    if (rawAsset) {
      if (rawAsset.is_deleted) {
        return res.status(410).json({ error: 'Asset has been deleted' });
      }
      // Check availability period
      const now = new Date().toISOString();
      if (rawAsset.available_until && now > rawAsset.available_until) {
        return res.status(410).json({ error: 'Asset is no longer available' });
      }
      if (rawAsset.available_from && now < rawAsset.available_from) {
        return res.status(403).json({ error: 'Asset is not yet available' });
      }
    }
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Check if file exists
  if (!fs.existsSync(asset.storage_path)) {
    return res.status(404).json({ error: 'Asset file not found' });
  }

  res.type(asset.mime_type || 'application/octet-stream');
  res.sendFile(asset.storage_path);
});

// Get asset metadata
app.get('/api/assets/:id/meta', (req, res) => {
  const asset = db.getAssetById(req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  res.json({
    id: asset.id,
    filename: asset.original_name,
    mimeType: asset.mime_type,
    size: asset.size,
    isPublic: !!asset.is_public,
    tags: asset.tags,
    description: asset.description,
    createdAt: asset.created_at,
    url: `/api/assets/${asset.id}`
  });
});

// List user's assets
app.get('/api/assets', (req, res) => {
  const { visitorId, currentProjectId } = req.query;

  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const assets = db.getAssetsWithProjectsByOwnerId(user.id);

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
      mimeType: a.mime_type,
      size: a.size,
      isPublic: !!a.is_public,
      tags: a.tags,
      description: a.description,
      url: `/api/assets/${a.id}`,
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
app.put('/api/assets/:id/publish', (req, res) => {
  const { visitorId, isPublic } = req.body;

  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const asset = db.getAssetById(req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Check ownership
  if (asset.owner_id !== user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const updated = db.setAssetPublic(req.params.id, isPublic);
  res.json({
    success: true,
    asset: {
      id: updated.id,
      isPublic: !!updated.is_public
    }
  });
});

// Update asset metadata
app.put('/api/assets/:id', (req, res) => {
  const { visitorId, tags, description } = req.body;

  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const asset = db.getAssetById(req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Check ownership
  if (asset.owner_id !== user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const updated = db.updateAssetMeta(req.params.id, tags, description);
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
app.delete('/api/assets/:id', (req, res) => {
  const { visitorId } = req.body;

  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const asset = db.getAssetById(req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Check ownership
  if (asset.owner_id !== user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Soft delete (logical deletion - asset becomes inaccessible but data remains)
  // This ensures that all projects referencing this asset will see it as "deleted"
  db.deleteAsset(req.params.id);

  // Return usage count so owner knows impact
  const usageCount = db.getAssetUsageCount(req.params.id);
  res.json({
    success: true,
    message: usageCount > 0
      ? `Asset deleted. It was used in ${usageCount} project(s) - they will now see a placeholder.`
      : 'Asset deleted.'
  });
});

// ==================== Public Games API ====================

// Get public games for discover feed
app.get('/api/public-games', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const publicProjects = db.getPublicProjects(limit);

    const games = publicProjects.map(project => {
      // Get creator info
      const creator = db.getUserById(project.user_id);
      return {
        id: project.id,
        name: project.name,
        creatorId: creator?.visitor_id,
        creatorName: creator?.display_name || creator?.username || 'anonymous',
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        likes: project.likes || 0
      };
    });

    res.json({ games });
  } catch (error) {
    console.error('Failed to get public games:', error);
    res.status(500).json({ error: 'Failed to get public games' });
  }
});

// Get single public game preview
app.get('/api/projects/:projectId/preview', (req, res) => {
  const { visitorId } = req.query;
  const { projectId } = req.params;

  try {
    const project = db.getProjectById(projectId);
    if (!project) {
      return res.status(404).send('Game not found');
    }

    // Allow access if public OR if owner
    const user = visitorId ? db.getUserByVisitorId(visitorId) : null;
    const isOwner = user && project.user_id === user.id;

    if (!project.is_public && !isOwner) {
      return res.status(403).send('This game is not public');
    }

    // Get the creator's visitor_id
    const creator = db.getUserById(project.user_id);
    if (!creator) {
      return res.status(404).send('Creator not found');
    }

    // Read the index.html file
    const projectDir = userManager.getProjectDir(creator.visitor_id, projectId);
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

// Serve project game files (supports nested paths: js/, css/, assets/)
app.get('/game/:visitorId/:projectId/*', (req, res) => {
  const { visitorId, projectId } = req.params;
  const filename = req.params[0] || 'index.html';

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

  const projectDir = userManager.getProjectDir(visitorId, projectId);
  const filePath = path.join(projectDir, filename);

  if (fs.existsSync(filePath)) {
    res.type(contentTypes[ext] || 'application/octet-stream');

    if (isBinary) {
      // Send binary files directly
      res.sendFile(filePath);
    } else {
      let content = fs.readFileSync(filePath, 'utf-8');

      // Inject error detection script into HTML files
      if (ext === '.html' && filename === 'index.html') {
        // Inject right after <head> tag
        if (content.includes('<head>')) {
          content = content.replace('<head>', '<head>' + ERROR_DETECTION_SCRIPT);
        } else if (content.includes('<HEAD>')) {
          content = content.replace('<HEAD>', '<HEAD>' + ERROR_DETECTION_SCRIPT);
        } else {
          // No head tag, prepend to content
          content = ERROR_DETECTION_SCRIPT + content;
        }
      }

      res.send(content);
    }
  } else {
    res.status(404).send('File not found');
  }
});

// ==================== WebSocket Connection Handling ====================

// Track WebSocket connections by visitor
const wsConnections = new Map(); // visitorId -> Set of ws

wss.on('connection', (ws) => {
  let visitorId = null;
  let currentProjectId = null;
  let jobUnsubscribe = null;
  let sessionId = null;

  // Helper to safely send
  const safeSend = (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'init':
          // Initialize or reconnect visitor
          visitorId = userManager.getOrCreateUser(data.visitorId);
          sessionId = data.sessionId || 'unknown';
          const projects = userManager.getProjects(visitorId);

          // Track connection
          if (!wsConnections.has(visitorId)) {
            wsConnections.set(visitorId, new Set());
          }
          wsConnections.get(visitorId).add(ws);

          console.log(`[${sessionId}] Client connected: ${visitorId} (total: ${wsConnections.get(visitorId).size} connections)`);

          safeSend({
            type: 'init',
            visitorId,
            projects
          });
          break;

        case 'ping':
          // Respond to ping for connection health check
          safeSend({ type: 'pong' });
          break;

        case 'selectProject':
          if (!visitorId) {
            safeSend({ type: 'error', message: 'Not initialized' });
            return;
          }
          currentProjectId = data.projectId;

          // Get conversation history
          const history = userManager.getConversationHistory(visitorId, currentProjectId);

          // Get versions (without edits - edits are fetched on demand)
          const versionsWithEdits = userManager.getVersions(visitorId, currentProjectId);

          // Check for active job
          const activeJob = jobManager.getActiveJob(currentProjectId);

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
          if (!visitorId) {
            safeSend({ type: 'error', message: 'Not initialized' });
            return;
          }
          const newProject = userManager.createProject(visitorId, data.name);
          currentProjectId = newProject.id;
          safeSend({
            type: 'projectCreated',
            project: newProject,
            projects: userManager.getProjects(visitorId)
          });
          break;

        case 'deleteProject':
          if (!visitorId || !data.projectId) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          userManager.deleteProject(visitorId, data.projectId);
          if (currentProjectId === data.projectId) {
            currentProjectId = null;
          }
          safeSend({
            type: 'projectDeleted',
            projectId: data.projectId,
            projects: userManager.getProjects(visitorId)
          });
          break;

        case 'renameProject':
          if (!visitorId || !data.projectId || !data.name) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          const renamedProject = userManager.renameProject(visitorId, data.projectId, data.name);
          safeSend({
            type: 'projectRenamed',
            project: renamedProject,
            projects: userManager.getProjects(visitorId)
          });
          break;

        case 'message':
          if (!visitorId || !currentProjectId) {
            safeSend({ type: 'error', message: 'No project selected' });
            return;
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
            const files = userManager.listProjectFiles(visitorId, currentProjectId);
            let isNewProject = true;
            if (files.length > 0) {
              const indexContent = userManager.readProjectFile(visitorId, currentProjectId, 'index.html');
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
                userManager.writeProjectFile(visitorId, currentProjectId, 'STYLE.md', styleContent);
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

          userManager.addToHistory(visitorId, currentProjectId, 'user', data.content); // Store original message

          // Log debug options if enabled
          if (debugOptions.disableSkills || debugOptions.useClaude) {
            console.log('Debug options:', debugOptions);
          }

          // Use job-based async processing
          if (data.async !== false) {
            try {
              const { job, isExisting, startProcessing } = await claudeRunner.runClaudeAsJob(
                visitorId,
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
                } else {
                  safeSend({ type: 'jobUpdate', ...update });

                  // On completion, send game updated
                  if (update.type === 'completed') {
                    safeSend({
                      type: 'gameUpdated',
                      visitorId,
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
              safeSend({
                type: 'error',
                message: error.message
              });
            }
          } else {
            // Legacy synchronous processing
            safeSend({ type: 'status', message: 'Processing...' });

            try {
              const result = await claudeRunner.runClaude(
                visitorId,
                currentProjectId,
                userMessage,
                (progress) => safeSend(progress)
              );

              userManager.createVersionSnapshot(visitorId, currentProjectId, userMessage.substring(0, 50));
              userManager.addToHistory(visitorId, currentProjectId, 'assistant', result.output ? 'ゲームを更新しました' : '');

              safeSend({
                type: 'gameUpdated',
                visitorId,
                projectId: currentProjectId
              });
            } catch (error) {
              userManager.addToHistory(visitorId, currentProjectId, 'assistant', `Error: ${error.message}`);
              safeSend({
                type: 'error',
                message: error.message
              });
            }
          }
          break;

        case 'getJobStatus':
          if (!data.jobId) {
            safeSend({ type: 'error', message: 'Job ID required' });
            return;
          }
          const job = jobManager.getJob(data.jobId);
          safeSend({
            type: 'jobStatus',
            job: job || null
          });
          break;

        case 'subscribeJob':
          if (!data.jobId) {
            safeSend({ type: 'error', message: 'Job ID required' });
            return;
          }
          if (jobUnsubscribe) jobUnsubscribe();
          jobUnsubscribe = jobManager.subscribe(data.jobId, (update) => {
            safeSend({ type: 'jobUpdate', ...update });
          });
          safeSend({ type: 'subscribed', jobId: data.jobId });
          break;

        case 'getVersions':
          if (!visitorId || !data.projectId) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          const versions = userManager.getVersions(visitorId, data.projectId);
          safeSend({
            type: 'versionsList',
            projectId: data.projectId,
            versions
          });
          break;

        case 'getVersionEdits':
          if (!visitorId || !data.projectId || !data.versionHash) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          const editsData = userManager.getVersionEdits(visitorId, data.projectId, data.versionHash);
          safeSend({
            type: 'versionEdits',
            projectId: data.projectId,
            versionHash: data.versionHash,
            edits: editsData?.edits || [],
            summary: editsData?.summary || ''
          });
          break;

        case 'restoreVersion':
          if (!visitorId || !data.projectId || !data.versionId) {
            safeSend({ type: 'error', message: 'Invalid request' });
            return;
          }
          const restoreResult = userManager.restoreVersion(visitorId, data.projectId, data.versionId);
          if (restoreResult.success) {
            safeSend({
              type: 'versionRestored',
              projectId: data.projectId,
              versionId: data.versionId
            });

            // Regenerate SPEC.md after restore to reflect restored code
            if (restoreResult.needsSpecRegeneration) {
              claudeRunner.updateSpec(visitorId, data.projectId).catch(err => {
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
            claudeRunner.cancelJob(data.jobId);
            safeSend({ type: 'cancelled', message: 'Job cancelled', jobId: data.jobId });
          } else if (visitorId && currentProjectId) {
            claudeRunner.cancelRun(`${visitorId}-${currentProjectId}`);
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
    console.log(`[${sessionId}] Client disconnected: ${visitorId}`);

    // Clean up
    if (jobUnsubscribe) jobUnsubscribe();

    // Remove from connections
    if (visitorId && wsConnections.has(visitorId)) {
      wsConnections.get(visitorId).delete(ws);
      if (wsConnections.get(visitorId).size === 0) {
        wsConnections.delete(visitorId);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// ==================== Project API Endpoints ====================

// Get project by ID
app.get('/api/project/:projectId', (req, res) => {
  const { visitorId } = req.query;
  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const projects = userManager.getProjects(visitorId);
  const project = projects.find(p => p.id === req.params.projectId);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  res.json({ project });
});

// Get all projects for a user
app.get('/api/projects', (req, res) => {
  const { visitorId } = req.query;
  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const projects = userManager.getProjects(visitorId);
  res.json({ projects });
});

// ==================== My Page Route ====================

app.get('/mypage', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mypage.html'));
});

// ==================== Notifications Route ====================

app.get('/notifications', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'notifications.html'));
});

// ==================== SPA Routing ====================

// Handle SPA routes - serve index.html for all non-API, non-asset routes
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  // Skip game files
  if (req.path.startsWith('/game/')) {
    return next();
  }
  // Skip static files (with extensions)
  if (path.extname(req.path) && req.path !== '/') {
    return next();
  }

  // Serve index.html for SPA routes
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ==================== Server Start ====================

server.listen(PORT, () => {
  console.log(`Game Creator MVP running at http://localhost:${PORT}`);
});
