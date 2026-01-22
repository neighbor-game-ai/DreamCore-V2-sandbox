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

// ==================== Storage Paths ====================

/**
 * V2 uses a new directory structure for projects:
 * Production: /data/projects/{userId}/{projectId}/
 * Development: ./users/{userId}/{projectId}/
 */

// Base data directory
const DATA_DIR = IS_PRODUCTION
  ? process.env.DATA_DIR || '/data'
  : path.join(__dirname, '..');

// Projects directory (game code, SPEC.md, etc.)
const PROJECTS_DIR = IS_PRODUCTION
  ? path.join(DATA_DIR, 'projects')
  : path.join(DATA_DIR, 'users');  // Legacy compatibility

// Assets directory (uploaded images, audio, etc.)
const ASSETS_DIR = path.join(DATA_DIR, 'assets');

// Database directory (SQLite files)
const DB_DIR = path.join(DATA_DIR, 'data');

// Ensure directories exist
const ensureDirectories = () => {
  const dirs = [PROJECTS_DIR, ASSETS_DIR, DB_DIR];
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
 * @param {string} userId - User ID (Supabase Auth UUID or legacy visitorId)
 * @param {string} projectId - Project ID
 * @returns {string} Absolute path to project directory
 */
const getProjectPath = (userId, projectId) => {
  return path.join(PROJECTS_DIR, userId, projectId);
};

/**
 * Get the user's directory path
 * @param {string} userId - User ID
 * @returns {string} Absolute path to user directory
 */
const getUserPath = (userId) => {
  return path.join(PROJECTS_DIR, userId);
};

/**
 * Get the assets directory path for a user
 * @param {string} userId - User ID
 * @returns {string} Absolute path to user's assets directory
 */
const getUserAssetsPath = (userId) => {
  return path.join(ASSETS_DIR, userId);
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

// ==================== Supabase Settings ====================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ==================== Startup Guard ====================

/**
 * Validate required environment variables at startup.
 * Call this function early in index.js to fail fast.
 */
const validateEnvironment = () => {
  const missing = [];

  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

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

  console.log('Environment validation passed');
};

// ==================== GCS Settings (Backup) ====================

const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;
const GCS_BUCKET_PROJECTS = process.env.GCS_BUCKET_PROJECTS || 'dreamcore-v2-projects';
const GCS_BUCKET_GAMES = process.env.GCS_BUCKET_GAMES || 'dreamcore-v2-games';

// Check if GCS is configured
const USE_GCS_BACKUP = !!GCS_PROJECT_ID;

// ==================== Rate Limiting ====================

const RATE_LIMIT = {
  // Claude CLI execution limits
  cli: {
    timeout: 5 * 60 * 1000,           // 5 minutes
    maxConcurrentPerUser: 1,
    maxConcurrentTotal: 10,
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
    anonymous: 10
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

// NOTE: legacyAuth (visitorId) has been removed.
// All authentication now requires Supabase Auth.

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
  PROJECTS_DIR,
  ASSETS_DIR,
  DB_DIR,
  ensureDirectories,
  getProjectPath,
  getUserPath,
  getUserAssetsPath,
  isPathSafe,
  isValidUUID,
  UUID_REGEX,

  // Supabase
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  validateEnvironment,

  // GCS
  GCS_PROJECT_ID,
  GCS_BUCKET_PROJECTS,
  GCS_BUCKET_GAMES,
  USE_GCS_BACKUP,

  // Rate Limiting
  RATE_LIMIT,

  // Features
  FEATURES
};
