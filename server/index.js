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
// multer is now used via ./middleware/uploads
// sharp is now used via ./routes/publishApi
const userManager = require('./userManager');
const { claudeRunner, jobManager, spawnClaudeAsync } = require('./claudeRunner');
const db = require('./database-supabase');
const geminiClient = require('./geminiClient');
const { getStyleById } = require('./stylePresets');
const { getStyleOptionsWithImages } = require('./styleImageCache');
const { generateVisualGuide, formatGuideForCodeGeneration } = require('./visualGuideGenerator');
const { authenticate, optionalAuth, verifyWebSocketAuth } = require('./authMiddleware');
const { isValidUUID, isPathSafe, isValidGitHash, getProjectPath, USERS_DIR, GLOBAL_ASSETS_DIR, SUPABASE_URL, SUPABASE_ANON_KEY } = require('./config');
const crypto = require('crypto');
const { supabaseAdmin } = require('./supabaseClient');
const { ErrorCodes, createWsError, sendHttpError } = require('./errorResponse');
const config = require('./config');
const { injectGameHtml, injectPublicGameHtml, rewriteUserAssets } = require('./gameHtmlUtils');
const r2Publisher = require('./r2Publisher');
const r2Client = require('./r2Client');
const assetPublisher = require('./assetPublisher');
const thumbnailGenerator = require('./thumbnailGenerator');
const waitlist = require('./waitlist');
const quotaService = require('./quotaService');
const remixService = require('./remixService');
const profileRoutes = require('./modules/profile/routes');
const publicProfileRoutes = require('./modules/profile/publicRoutes');
const analyticsRoutes = require('./modules/analytics');
// Asset routes (modularized)
const assetsApiRouter = require('./routes/assetsApi');
const assetsPublicRouter = require('./routes/assetsPublic');
// Publish routes (modularized)
const publishApiRouter = require('./routes/publishApi');
// Auth routes (custom magic link emails)
const authApiRouter = require('./routes/authApi');
// Shared middleware/utils (extracted for modularization)
const { checkProjectOwnership } = require('./middleware/projectChecks');
const { gitCommitAsync } = require('./utils/git');
const { aiRateLimiter, apiRateLimiter, publicRateLimiter } = require('./rateLimiter');
const helmet = require('helmet');
// JSDOM/DOMPurify moved to routes/assetsApi.js (SVG sanitization)

// CLI Deploy（条件付きロード）
const cliDeploy = process.env.SUPABASE_CLI_URL ? require('../cli-deploy/server') : null;

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

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// ==================== セキュリティヘッダー（helmet）====================
// Phase 2b: CSP Report-Only で違反ログ収集（ブロックしない）
// Phase 2c: 違反がないことを確認後、強制モードに移行予定

// CSP ディレクティブ（アプリページ用）
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",  // インラインスクリプト（将来的に nonce/hash に移行）
    "https://cdnjs.cloudflare.com",  // cropper.js
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",  // インラインスタイル
    "https://fonts.googleapis.com",
  ],
  fontSrc: [
    "'self'",
    "https://fonts.gstatic.com",
  ],
  imgSrc: [
    "'self'",
    "data:",   // Base64 画像
    "blob:",   // Blob URL
    "https://*.supabase.co",  // Supabase Storage
    "https://lh3.googleusercontent.com",  // Google アバター
    "https://api.qrserver.com",  // QR コード生成
    "https://cdn.dreamcore.gg",  // R2 CDN (サムネイル、アセット)
  ],
  mediaSrc: [
    "'self'",
    "blob:",  // 動画/音声 Blob
  ],
  connectSrc: [
    "'self'",
    "wss:",  // WebSocket（同一ホスト）
    "https://*.supabase.co",  // Supabase API
  ],
  frameSrc: [
    "'self'",
    "https://play.dreamcore.gg",  // ゲーム iframe
  ],
  frameAncestors: ["'self'"],  // 自身のみ埋め込み許可
  objectSrc: ["'none'"],  // プラグイン禁止
  baseUri: ["'self'"],  // base タグ制限
  formAction: ["'self'"],  // フォーム送信先制限
  upgradeInsecureRequests: [],  // HTTP → HTTPS 自動アップグレード
  reportUri: ["/api/csp-report"],  // 違反レポート送信先
};

// helmet ミドルウェア（CSP あり版）
const helmetWithCSP = helmet({
  contentSecurityPolicy: {
    reportOnly: true,  // 違反をログするがブロックしない
    directives: cspDirectives,
  },
  frameguard: false,
});

// helmet ミドルウェア（CSP なし版 - ゲームページ用）
const helmetWithoutCSP = helmet({
  contentSecurityPolicy: false,
  frameguard: false,
});

// ゲームページ・CLI認証ページは CSP を適用しない
// - ゲーム: AI 生成コンテンツで CDN が予測不能、iframe sandbox で隔離
// - CLI認証: cdn.jsdelivr.net から Supabase SDK をロード
app.use((req, res, next) => {
  if (req.path.startsWith('/g/') || req.path.startsWith('/game/') || req.path.startsWith('/cli-auth/')) {
    return helmetWithoutCSP(req, res, next);
  }
  return helmetWithCSP(req, res, next);
});

// CSP 違反レポートエンドポイント（ブラウザが自動送信）
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  const report = req.body?.['csp-report'] || req.body;
  console.warn('[CSP Violation]', JSON.stringify(report, null, 2));
  res.status(204).end();
});

// ゲームページ以外には X-Frame-Options を適用
app.use((req, res, next) => {
  // /g/ (公開ゲーム) と /game/ (プレビュー) はiframe埋め込みを許可
  if (!req.path.startsWith('/g/') && !req.path.startsWith('/game/')) {
    res.setHeader('X-Frame-Options', 'DENY');
  }
  next();
});

// Upload middleware (shared with routes/assetsApi.js)
const upload = require('./middleware/uploads');

// JSON body parser with increased limit for base64 images
app.use(express.json({ limit: '50mb' }));

// CORS for Phase 2 subdomain architecture (play.dreamcore.gg)
// Assets need to be accessible from the play subdomain where games run
// NOTE: Moved here (before rate limiter) for lineage CORS to work properly
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);  // Remove empty strings

// Lineage API CORS - must be before rate limiter for OPTIONS preflight
app.use((req, res, next) => {
  const isLineageRequest = req.path.match(/^\/api\/games\/[^/]+\/lineage$/) &&
    (req.method === 'GET' || req.method === 'OPTIONS');

  if (isLineageRequest) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
      res.header('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }
  next();
});

// 一般APIレート制限（認証済み: 60 req/min, 未認証: 60 req/min）
// AI系APIは個別にさらに厳しい制限（5 req/min）が適用される
// 公開API（ゲーム情報取得等）はレート制限から除外
app.use('/api/', (req, res, next) => {
  const fullPath = `${req.baseUrl}${req.path}`;
  // 公開APIはレート制限から除外（UX優先）
  // CLI Deploy は独自のレート制限を実装しているため除外
  const publicPaths = [
    '/api/published-games/',  // ゲーム情報取得
    '/api/config',            // フロントエンド設定
    '/api/cli/',              // CLI Deploy（独自レート制限）
  ];
  if (publicPaths.some(p => fullPath.startsWith(p))) {
    return next();
  }
  // サムネイル取得は静的ファイル配信に近いため除外
  if (/^\/api\/projects\/[^/]+\/thumbnail$/.test(fullPath)) {
    return next();
  }

  // 認証ヘッダーがある場合は認証済みレート制限を適用
  if (req.headers.authorization) {
    return apiRateLimiter(req, res, next);
  }
  // 認証ヘッダーがない場合は未認証レート制限を適用
  return publicRateLimiter(req, res, next);
});

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
// Get git commit hash at startup
let GIT_COMMIT = 'unknown';
try {
  GIT_COMMIT = require('child_process')
    .execSync('git rev-parse --short HEAD', { cwd: __dirname })
    .toString().trim();
} catch (e) {
  console.warn('[Health] Could not get git commit hash');
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    commit: GIT_COMMIT,
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
  const publicGameBaseUrl = config.R2_PUBLIC_BASE_URL || config.PLAY_DOMAIN || 'https://play.dreamcore.gg';
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    playDomain: config.PLAY_DOMAIN || 'https://play.dreamcore.gg',
    publicGameBaseUrl
  });
});

// ==================== Waitlist/Access Control ====================
// V2 初期リリース用。無効化方法: この行をコメントアウト
waitlist.setupRoutes(app);

// ==================== Profile Module ====================
app.use('/api/users', profileRoutes);
app.use('/', publicProfileRoutes);  // /u/:id public profile pages

// ==================== Analytics Module ====================
// Includes tracking API and admin dashboard API
// Admin endpoints: /api/analytics/admin/summary, /api/analytics/admin/retention
app.use('/api/analytics', analyticsRoutes);

// ==================== Remix API ====================
remixService.setupRoutes(app);

// ==================== CLI Deploy ====================
// CLI からゲームをデプロイする機能。無効化: SUPABASE_CLI_URL を未設定にする
if (cliDeploy) {
  app.use('/api/cli', cliDeploy.router);
  app.use('/cli-auth', express.static(path.join(__dirname, '../cli-deploy/public')));
  console.log('[CLI Deploy] Mounted at /api/cli');
}

// ==================== Asset Routes ====================
// /api/assets/* - API endpoints for asset management
app.use('/api/assets', assetsApiRouter);
// /user-assets/*, /global-assets/* - Public asset serving (CDN redirect)
app.use('/', assetsPublicRouter);

// ==================== Publish Routes ====================
// /api/projects/:projectId/publish-draft, generate-publish-info, generate-thumbnail, upload-thumbnail, thumbnail
app.use('/api/projects', publishApiRouter);

// ==================== Auth Routes ====================
// /api/auth/magic-link - Custom branded magic link emails
app.use('/api/auth', authApiRouter);

// ==================== Skills 配信 ====================
// Claude Code Skills の配信（自動更新用）
app.use('/skills', express.static(path.join(__dirname, '../cli-deploy/skills')));

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
app.post('/api/generate-image', authenticate, aiRateLimiter, async (req, res) => {
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

// Asset routes moved to routes/assetsApi.js and routes/assetsPublic.js

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

// Inject asset base URL and normalize /user-assets/ to absolute URLs (optional)
const getAssetBaseUrl = (req) => {
  if (config.ASSET_BASE_URL) {
    return config.ASSET_BASE_URL.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
};

// ==================== Signed Game URL API ====================

/**
 * Generate a signed URL for game preview/play iframe access.
 * This replaces passing access_token in URL query params, which is insecure.
 *
 * Signature algorithm:
 *   payload = "{userId}:{projectId}:{expiresAt}"
 *   signature = HMAC-SHA256(GAME_SIGNING_SECRET, payload)
 *
 * URL format: /game/{userId}/{projectId}/index.html?sig={signature}&exp={expiresAt}
 */
app.get('/api/game-url/:projectId', authenticate, checkProjectOwnership, (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  const payload = `${userId}:${projectId}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', config.GAME_SIGNING_SECRET)
    .update(payload)
    .digest('hex');

  res.json({
    url: `/game/${userId}/${projectId}/index.html?sig=${signature}&exp=${expiresAt}`,
    expiresAt
  });
});

// ==================== Game File Server ====================

// Serve project game files (supports nested paths: js/, css/, assets/)
// Authentication methods (in priority order):
// 1. Signed URL (sig + exp params) - recommended
// 2. Bearer token - for migration period
// 3. Referer-based - for sub-resources only
app.get('/game/:userId/:projectId/*', optionalAuth, async (req, res) => {
  const { userId, projectId } = req.params;
  const filename = req.params[0] || 'index.html';

  // Validate UUID format
  if (!isValidUUID(userId) || !isValidUUID(projectId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // Authentication methods (in priority order):
  // 1. Signed URL (sig + exp params) - recommended, most secure
  // 2. Bearer token - for migration period
  // 3. Referer-based - for sub-resources loaded from authenticated iframe
  const { sig, exp } = req.query;
  const referer = req.headers.referer || '';
  const expectedRefererPattern = new RegExp(`/game/${userId}/${projectId}/`);
  const isValidReferer = referer && expectedRefererPattern.test(referer);

  if (sig && exp) {
    // Method 1: Signed URL (recommended)
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = parseInt(exp, 10);

    if (isNaN(expiresAt) || now > expiresAt) {
      return res.status(401).json({ error: 'URL expired' });
    }

    const payload = `${userId}:${projectId}:${expiresAt}`;
    const expectedSig = crypto
      .createHmac('sha256', config.GAME_SIGNING_SECRET)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (sig.length !== expectedSig.length ||
        !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else if (req.user) {
    // Method 2: Bearer token (migration period)
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
  } else if (isValidReferer) {
    // Method 3: Referer-based access for sub-resources ONLY
    // This allows audio.js, style.css, etc. to load from authenticated iframe
    // Security: Referer can be spoofed, so restrict to non-HTML files only
    // index.html always requires signature or token
    if (filename === 'index.html' || filename.endsWith('.html')) {
      return res.status(401).json({ error: 'Authentication required for HTML files' });
    }
  } else {
    // No valid authentication
    return res.status(401).json({ error: 'Authentication required' });
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
      const assetBase = getAssetBaseUrl(req);
      content = injectGameHtml(content, assetBase);
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
          const assetBase = getAssetBaseUrl(req);
          textContent = injectGameHtml(textContent, assetBase);
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
// Supports both UUID and public_id (e.g., g_abc123XYZ0)
// Also supports CLI-deployed games (stored in Supabase B)
app.get('/api/published-games/:id', async (req, res) => {
  const { id } = req.params;

  const isUUID = isValidUUID(id);
  const isPublicId = /^g_[A-Za-z0-9]{10}$/.test(id);
  if (!isUUID && !isPublicId) {
    return res.status(400).json({ error: 'Invalid game ID' });
  }

  // 1. まず通常のpublished_games（Supabase A）を検索
  let game = isUUID
    ? await db.getPublishedGameById(id)
    : await db.getPublishedGameByPublicId(id);

  // 2. 見つからない場合、CLI games（Supabase B）をフォールバック検索
  if (!game && isPublicId && cliDeploy) {
    game = await cliDeploy.getCliPublishedGame(id);
  }

  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // 通常ゲームにはデフォルトのplay_domainを設定
  if (!game.play_domain) {
    game.play_domain = 'play.dreamcore.gg';
  }

  res.json(game);
});

// POST /api/published-games/:id/play - Increment play count (call when game actually starts)
// Supports both UUID and public_id (e.g., g_abc123XYZ0)
// Also supports CLI-deployed games
app.post('/api/published-games/:id/play', async (req, res) => {
  const { id } = req.params;

  const isUUID = isValidUUID(id);
  const isPublicId = /^g_[A-Za-z0-9]{10}$/.test(id);
  if (!isUUID && !isPublicId) {
    return res.status(400).json({ error: 'Invalid game ID' });
  }

  // Verify game exists and is public/unlisted (check Play first, then CLI)
  let game = isUUID
    ? await db.getPublishedGameById(id)
    : await db.getPublishedGameByPublicId(id);

  // Fallback to CLI games if not found in main Supabase
  if (!game && isPublicId && cliDeploy) {
    game = await cliDeploy.getCliPublishedGame(id);
  }

  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // Increment play count (use internal UUID, not public_id)
  if (game.is_cli_game && cliDeploy) {
    await cliDeploy.incrementCliPlayCount(game.id);
  } else {
    await db.incrementPlayCount(game.id);
  }

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

  const existingGame = await db.getPublishedGameByProjectId(req.supabase, projectId);

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

  try {
    if (r2Client.isR2Enabled()) {
      const uploadResult = await r2Publisher.uploadProjectToR2({
        projectId,
        publicId: game.public_id,
        userId
      });

      if (uploadResult.thumbnailUrl && uploadResult.thumbnailUrl !== game.thumbnail_url) {
        await db.updatePublishedGame(req.supabase, game.id, {
          thumbnailUrl: uploadResult.thumbnailUrl
        });
        game.thumbnail_url = uploadResult.thumbnailUrl;
      }
    }
  } catch (error) {
    console.error('[publish] R2 upload failed:', error.message);
    // Roll back if this was a new publish and R2 failed
    if (!existingGame) {
      await db.unpublishGame(req.supabase, projectId);
    }
    return res.status(500).json({ error: 'Failed to publish game assets to CDN' });
  }

  console.log(`[publish] Game published: ${game.id} / ${game.public_id} (project: ${projectId})`);

  // Async thumbnail generation if not already uploaded
  if (r2Client.isR2Enabled() && !game.thumbnail_url?.startsWith('https://')) {
    // Fire-and-forget: generate thumbnail in background
    setImmediate(async () => {
      try {
        // Read spec for better prompt
        const projectDir = getProjectPath(userId, projectId);
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

        await thumbnailGenerator.generateThumbnailAsync({
          projectId,
          publicId: game.public_id,
          userId,
          title: game.title,
          specContent
        });
      } catch (err) {
        console.error(`[publish] Background thumbnail generation failed:`, err.message);
      }
    });
  }

  res.json({ success: true, gameId: game.public_id, game });
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

// GET /api/my-published-games - Get user's own published games (including CLI games)
app.get('/api/my-published-games', authenticate, async (req, res) => {
  // Play で公開したゲームを取得
  const playGames = await db.getPublishedGamesByUserId(req.supabase, req.user.id);

  // CLI で公開したゲームを取得（CLI Deploy が有効な場合のみ）
  let cliGames = [];
  if (cliDeploy) {
    cliGames = await cliDeploy.getCliPublishedGamesByUserId(req.user.id);
  }

  // マージして日付順でソート
  const allGames = [...playGames, ...cliGames].sort((a, b) => {
    const dateA = new Date(a.published_at || 0);
    const dateB = new Date(b.published_at || 0);
    return dateB - dateA;
  });

  res.json({ games: allGames });
});

// ==================== Public ID Routes ====================

// NOTE: GET /u/:id moved to modules/profile/publicRoutes.js

// NOTE: GET /@/:username moved to modules/profile/publicRoutes.js

// NOTE: GET /api/users/:id/public moved to modules/profile/routes.js

// GET /p/:publicId - Project page (redirects to game if published)
// Supports both UUID and public_id (e.g., p_abc123XYZ0)
app.get('/p/:id', async (req, res) => {
  const { id } = req.params;

  // Only serve on v2 domain
  if (req.isPlayDomain) {
    return res.status(404).send('Not found');
  }

  const isUUID = isValidUUID(id);
  const isPublicId = /^p_[A-Za-z0-9]{10}$/.test(id);
  if (!isUUID && !isPublicId) {
    return res.status(400).send('Invalid project ID');
  }

  // Get project with published game (public or unlisted)
  let project;
  if (isPublicId) {
    project = await db.getProjectByPublicId(id);
  } else {
    const { data } = await db.supabaseAdmin
      .from('projects')
      .select('id, name, public_id, user_id, published_games!inner(id, public_id, visibility)')
      .eq('id', id)
      .in('published_games.visibility', ['public', 'unlisted'])
      .single();
    project = data;
  }

  if (!project || !project.published_games || project.published_games.length === 0) {
    return res.status(404).send('Project not found or not published');
  }

  // Redirect to game page using game's public_id
  const gamePublicId = project.published_games[0].public_id;
  return res.redirect(`/game/${gamePublicId}`);
});

// ==================== Game Routes ====================

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

  // Block direct browser access - only allow iframe embedding
  const secFetchDest = req.headers['sec-fetch-dest'];
  if (secFetchDest === 'document') {
    return res.status(403).send('This game can only be played within DreamCore');
  }

  // Redirect to index.html
  return res.redirect(`/g/${req.params.gameId}/index.html`);
});

// GET /g/:gameId/* - Public game file serving on play.dreamcore.gg only
// Supports both UUID and public_id (e.g., g_abc123XYZ0)
app.get('/g/:gameId/*', async (req, res) => {
  const { gameId } = req.params;
  const filename = req.params[0] || 'index.html';

  // Only serve game files on play domain
  if (!req.isPlayDomain) {
    return res.status(404).send('Not found');
  }

  // Block direct browser access to HTML files - only allow iframe embedding
  // Sub-resources (js, css, images, etc.) are allowed for the game to work
  const secFetchDest = req.headers['sec-fetch-dest'];
  if (secFetchDest === 'document' && filename.endsWith('.html')) {
    return res.status(403).send('This game can only be played within DreamCore');
  }

  // Validate ID format: UUID or public_id (g_xxxxxxxxxx)
  const isUUID = isValidUUID(gameId);
  const isPublicId = /^g_[A-Za-z0-9]{10}$/.test(gameId);
  if (!isUUID && !isPublicId) {
    return res.status(400).send('Invalid game ID');
  }

  // Path traversal protection
  if (filename.includes('..') || filename.startsWith('/')) {
    return res.status(400).send('Invalid file path');
  }

  // Get published game info (uses admin client, returns public/unlisted only)
  const game = isUUID
    ? await db.getPublishedGameById(gameId)
    : await db.getPublishedGameByPublicId(gameId);
  if (!game || !['public', 'unlisted'].includes(game.visibility)) {
    return res.status(404).send('Game not found');
  }

  // Prefer R2/CDN for public game assets when enabled
  if (r2Client.isR2Enabled()) {
    const publicId = game.public_id;
    const r2Url = r2Client.getPublicUrl(`g/${publicId}/${filename}`);
    return res.redirect(302, r2Url);
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
      const assetBaseUrl = config.ASSET_BASE_URL || config.V2_DOMAIN || '';
      content = injectPublicGameHtml(content, assetBaseUrl);
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
        const assetBaseUrl = config.ASSET_BASE_URL || config.V2_DOMAIN || '';
        textContent = injectPublicGameHtml(textContent, assetBaseUrl);
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

  // 認証タイムアウト: 10秒以内にinitメッセージを受信しない場合は切断（DoS対策）
  const authTimeout = setTimeout(() => {
    if (!userId) {
      console.warn('[WS] Authentication timeout - closing unauthenticated connection');
      ws.close(4008, 'Authentication timeout');
    }
  }, 10000);

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
          clearTimeout(authTimeout);  // 認証成功したのでタイムアウトをキャンセル

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
    clearTimeout(authTimeout);  // 接続終了時にタイムアウトをキャンセル

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
      thumbnailUrl: g.thumbnail_url || null,
      publishedGameId: g.public_id,  // Use short public_id for URLs
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

// ==================== Game Movie Generation ====================

// Generate game demo movie using Remotion + AI
// AI reads the game code and generates a Remotion component that recreates the gameplay
app.post('/api/projects/:projectId/generate-movie', authenticate, checkProjectOwnership, aiRateLimiter, async (req, res) => {
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

    // 本番環境ではローカルCLI実行禁止
    // TODO: Modal経由でのmovie生成実装後に USE_MODAL 分岐を追加
    if (config.IS_PRODUCTION) {
      console.error('[generate-movie] Local CLI execution not allowed in production');
      return res.status(503).json({ error: 'Movie generation service is not yet available in production' });
    }

    // 開発環境のみローカル実行
    console.warn('[DEV] Using local CLI for generate-movie');

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
          gitCommitAsync(projectDir, 'Generate demo movie', ['movie.mp4']);

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

// Zap page (game discovery with specific game)
// Supports both UUID and public_id (e.g., g_abc123XYZ0)
app.get('/zap/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'discover.html'));
});

// ==================== 404 Catch-all ====================
// Must be last route - catches all unmatched requests
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
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
