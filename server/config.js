/**
 * Configuration for DreamCore V2
 *
 * Centralizes all configuration settings and path definitions.
 * Authentication: Supabase Auth only (Google OAuth).
 */

const path = require('path');
const fs = require('fs');

// ==================== Environment ====================

const ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = ENV === 'production';

// ==================== Server Settings ====================

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// CORS: Allowed origins for asset access (Phase 2 subdomain architecture)
// Production: CORS_ALLOWED_ORIGINS=https://play.dreamcore.gg
// Development: defaults to http://localhost:3000
// Multiple origins: comma-separated (e.g., "https://play.dreamcore.gg,https://staging-play.dreamcore.gg")

// ==================== Storage Paths ====================

/**
 * Unified directory structure:
 * /data/users/{userId}/projects/{projectId}/  - Project files
 * /data/users/{userId}/assets/                - User assets
 * /data/assets/global/                        - Global assets
 */

// Base data directory
const DATA_DIR = IS_PRODUCTION
  ? process.env.DATA_DIR || '/data'
  : path.join(__dirname, '..');

// Users directory (contains projects and assets per user)
const USERS_DIR = path.join(DATA_DIR, 'users');

// Global assets directory
const GLOBAL_ASSETS_DIR = path.join(DATA_DIR, 'assets', 'global');

// Database directory (SQLite files)
const DB_DIR = path.join(DATA_DIR, 'data');

// Ensure directories exist
const ensureDirectories = () => {
  const dirs = [USERS_DIR, GLOBAL_ASSETS_DIR, DB_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }
};

// ==================== Path Helpers ====================

/**
 * Get the project directory path
 * @param {string} userId - User ID (Supabase Auth UUID)
 * @param {string} projectId - Project ID
 * @returns {string} Absolute path to project directory
 */
const getProjectPath = (userId, projectId) => {
  return path.join(USERS_DIR, userId, 'projects', projectId);
};

/**
 * Get the user's directory path
 * @param {string} userId - User ID
 * @returns {string} Absolute path to user directory
 */
const getUserPath = (userId) => {
  return path.join(USERS_DIR, userId);
};

/**
 * Get the assets directory path for a user
 * @param {string} userId - User ID
 * @returns {string} Absolute path to user's assets directory
 */
const getUserAssetsPath = (userId) => {
  return path.join(USERS_DIR, userId, 'assets');
};

/**
 * Get the global assets directory path for a category
 * @param {string} category - Category (e.g., 'seasonal', 'characters')
 * @returns {string} Absolute path to global assets category directory
 */
const getGlobalAssetsPath = (category) => {
  return path.join(GLOBAL_ASSETS_DIR, category);
};

/**
 * Validate path to prevent traversal attacks
 * @param {string} basePath - Base directory path
 * @param {string} targetPath - Target path to validate
 * @returns {boolean} True if path is safe
 */
const isPathSafe = (basePath, targetPath) => {
  const resolved = path.resolve(targetPath);
  const normalizedBase = basePath.endsWith(path.sep) ? basePath : basePath + path.sep;
  return resolved.startsWith(normalizedBase) || resolved === basePath.replace(/\/$/, '');
};

/**
 * UUID validation regex
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid UUID
 */
const isValidUUID = (id) => {
  return UUID_REGEX.test(id);
};

/**
 * Git hash validation regex (7-40 hex characters)
 */
const GIT_HASH_REGEX = /^[0-9a-f]{7,40}$/i;

/**
 * Validate Git hash format
 * @param {string} hash - Hash to validate
 * @returns {boolean} True if valid Git hash
 */
const isValidGitHash = (hash) => {
  return typeof hash === 'string' && GIT_HASH_REGEX.test(hash);
};

// ==================== Supabase Settings ====================

// 末尾スラッシュを削除（JWT issuer 不一致防止）
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Optional: Base URL for assets (e.g., https://v2.dreamcore.gg)
const ASSET_BASE_URL = process.env.ASSET_BASE_URL || '';

// V2 Domain for public game URLs (e.g., https://v2.dreamcore.gg)
// Used for ASSET_BASE_URL injection in public games
const V2_DOMAIN = process.env.V2_DOMAIN || '';

// Play domain for iframe embedding (e.g., https://play.dreamcore.gg)
const PLAY_DOMAIN = process.env.PLAY_DOMAIN || '';

// ==================== R2 Public Asset Settings ====================
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_BUCKET = process.env.R2_BUCKET || '';
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';

// ==================== Startup Guard ====================

/**
 * Validate required environment variables at startup.
 * Call this function early in index.js to fail fast.
 */
const validateEnvironment = () => {
  const missing = [];
  const warnings = [];

  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  // Warn if V2_DOMAIN is not set (required for public game asset URLs)
  if (!V2_DOMAIN) {
    warnings.push('V2_DOMAIN not set - public game assets may not load correctly from play domain');
  }

  // In production, require GAME_SIGNING_SECRET or MODAL_INTERNAL_SECRET
  if (IS_PRODUCTION && !process.env.GAME_SIGNING_SECRET && !process.env.MODAL_INTERNAL_SECRET) {
    missing.push('GAME_SIGNING_SECRET or MODAL_INTERNAL_SECRET');
  }

  if (missing.length > 0) {
    console.error('='.repeat(60));
    console.error('FATAL: Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    console.error('');
    console.error('Please configure these in your .env file.');
    console.error('See .env.example for reference.');
    console.error('='.repeat(60));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('='.repeat(60));
    console.warn('WARNING: Configuration issues detected:');
    warnings.forEach(w => console.warn(`  - ${w}`));
    console.warn('='.repeat(60));
  }

  console.log('Environment validation passed');
};

// ==================== Modal Integration ====================

/**
 * Modal Sandbox integration settings.
 * When USE_MODAL=true, Claude CLI and file operations run on Modal.
 * When USE_MODAL=false, operations run locally (fallback).
 */
const USE_MODAL = process.env.USE_MODAL === 'true';

// Main Modal endpoint (for generate_game)
const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT;

// Internal authentication secret (shared between Express and Modal)
const MODAL_INTERNAL_SECRET = process.env.MODAL_INTERNAL_SECRET;

// Game URL signing secret (defaults to MODAL_INTERNAL_SECRET for convenience)
// In development without secrets, generates a random one per server start
const GAME_SIGNING_SECRET = process.env.GAME_SIGNING_SECRET || MODAL_INTERNAL_SECRET ||
  (IS_PRODUCTION ? null : require('crypto').randomBytes(32).toString('hex'));

// Optional: Individual endpoint overrides (auto-derived from MODAL_ENDPOINT if not set)
const MODAL_GET_FILE_ENDPOINT = process.env.MODAL_GET_FILE_ENDPOINT;
const MODAL_LIST_FILES_ENDPOINT = process.env.MODAL_LIST_FILES_ENDPOINT;
const MODAL_APPLY_FILES_ENDPOINT = process.env.MODAL_APPLY_FILES_ENDPOINT;
const MODAL_DETECT_INTENT_ENDPOINT = process.env.MODAL_DETECT_INTENT_ENDPOINT;
const MODAL_DETECT_SKILLS_ENDPOINT = process.env.MODAL_DETECT_SKILLS_ENDPOINT;
const MODAL_GET_SKILL_CONTENT_ENDPOINT = process.env.MODAL_GET_SKILL_CONTENT_ENDPOINT;
const MODAL_GEMINI_ENDPOINT = process.env.MODAL_GEMINI_ENDPOINT;

// ==================== GCS Settings (Backup) ====================

const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;
const GCS_BUCKET_PROJECTS = process.env.GCS_BUCKET_PROJECTS || 'dreamcore-v2-projects';
const GCS_BUCKET_GAMES = process.env.GCS_BUCKET_GAMES || 'dreamcore-v2-games';

// Check if GCS is configured
const USE_GCS_BACKUP = !!GCS_PROJECT_ID;

// ==================== Tier Limits (Quota) ====================

const TIER_LIMITS = {
  free: {
    dailyProjectCreations: 3,
    dailyMessages: 20,
  },
  pro: {
    dailyProjectCreations: 100,
    dailyMessages: 500,
  },
  team: {
    dailyProjectCreations: -1,  // unlimited
    dailyMessages: -1,          // unlimited
  }
};

// ==================== Rate Limiting ====================

const RATE_LIMIT = {
  // Claude CLI execution limits
  cli: {
    timeout: 10 * 60 * 1000,          // 10 minutes
    maxConcurrentPerUser: 1,
    maxConcurrentTotal: 50,
    maxTokens: 100000,
    maxOutputSize: 1 * 1024 * 1024    // 1MB
  },
  // Weekly chat limit
  chat: {
    weeklyLimit: 50,
    resetDay: 1                        // Monday
  },
  // API rate limits (requests per minute)
  api: {
    authenticated: 60,
    anonymous: 60  // 公開APIは除外済みなので、残りの匿名APIも緩め
  }
};

// ==================== Feature Flags ====================

const FEATURES = {
  // Phase 1: Creator only
  publishing: false,                   // Game publishing (Phase 2)
  playerSandbox: false,                // Player sandbox (Phase 2)

  // Backup
  gcsBackup: USE_GCS_BACKUP
};

// ==================== Export ====================

module.exports = {
  // Environment
  ENV,
  IS_PRODUCTION,

  // Server
  PORT,
  HOST,

  // Paths
  DATA_DIR,
  USERS_DIR,
  GLOBAL_ASSETS_DIR,
  DB_DIR,
  ensureDirectories,
  getProjectPath,
  getUserPath,
  getUserAssetsPath,
  getGlobalAssetsPath,
  isPathSafe,
  isValidUUID,
  UUID_REGEX,
  isValidGitHash,
  GIT_HASH_REGEX,

  // Supabase
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  ASSET_BASE_URL,
  V2_DOMAIN,
  PLAY_DOMAIN,
  R2_ACCOUNT_ID,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  validateEnvironment,

  // GCS
  GCS_PROJECT_ID,
  GCS_BUCKET_PROJECTS,
  GCS_BUCKET_GAMES,
  USE_GCS_BACKUP,

  // Modal Integration
  USE_MODAL,
  MODAL_ENDPOINT,
  MODAL_INTERNAL_SECRET,
  GAME_SIGNING_SECRET,
  MODAL_GET_FILE_ENDPOINT,
  MODAL_LIST_FILES_ENDPOINT,
  MODAL_APPLY_FILES_ENDPOINT,
  MODAL_DETECT_INTENT_ENDPOINT,
  MODAL_DETECT_SKILLS_ENDPOINT,
  MODAL_GET_SKILL_CONTENT_ENDPOINT,
  MODAL_GEMINI_ENDPOINT,

  // Tier Limits (Quota)
  TIER_LIMITS,

  // Rate Limiting
  RATE_LIMIT,

  // Features
  FEATURES
};

// ==================== Production Guard ====================
// 本番環境では Modal Sandbox が必須（ローカルCLI実行禁止）
if (IS_PRODUCTION && !USE_MODAL) {
  console.error('='.repeat(60));
  console.error('FATAL: USE_MODAL=true is required in production');
  console.error('');
  console.error('Local CLI execution is a security risk in production.');
  console.error('Please set USE_MODAL=true and configure MODAL_ENDPOINT.');
  console.error('='.repeat(60));
  process.exit(1);
}
