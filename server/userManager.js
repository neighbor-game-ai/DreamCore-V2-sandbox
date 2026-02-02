/**
 * User Manager for DreamCore V2
 *
 * Handles user data, projects, and file operations.
 * Uses config.js for path configuration.
 * userId (Supabase Auth UUID) for all user identification.
 *
 * Unified Path Structure:
 * - /data/users/{userId}/projects/{projectId}/  - Project files
 * - /data/users/{userId}/assets/                - User assets
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('./database-supabase');
const { supabaseAdmin } = require('./supabaseClient');
const config = require('./config');

// Modal client for remote file operations (lazy-loaded when USE_MODAL=true)
let modalClient = null;
function getModalClient() {
  if (!modalClient && config.USE_MODAL) {
    modalClient = require('./modalClient');
  }
  return modalClient;
}

// Helper: get client or fallback to admin (for background job context)
const getClient = (client) => client || supabaseAdmin;

// Ensure directories exist
config.ensureDirectories();

// Note: Users directory git has been replaced with DB activity_log table
// initUsersGit() is no longer needed - activity is logged to SQLite instead

// Note: Migration from JSON files is no longer needed with Supabase
// Legacy data migration should be done via SQL scripts or manual import

/**
 * Execute git commands safely using execFileSync (no shell interpolation)
 * @param {string[]} args - Git command arguments (e.g., ['commit', '-m', 'message'])
 * @param {string} cwd - Working directory
 * @returns {string|null} Command output or null on error
 */
const execGitSafe = (args, cwd) => {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 30000
    }).trim();
  } catch (e) {
    return null;
  }
};

/**
 * Get project directory path
 * @param {string} userId - User ID (Supabase Auth UUID)
 * @param {string} projectId - Project ID
 * @returns {string} Absolute path to project directory
 */
const getProjectDir = (userId, projectId) => {
  return config.getProjectPath(userId, projectId);
};

/**
 * Ensure project directory exists with git initialization
 * @param {string} userId - User ID (Supabase Auth UUID)
 * @param {string} projectId - Project ID
 * @returns {string} Absolute path to project directory
 */
const ensureProjectDir = (userId, projectId) => {
  const projectDir = getProjectDir(userId, projectId);

  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });

    // Initialize git for the project
    execGitSafe(['init'], projectDir);
    execGitSafe(['config', 'user.email', 'gamecreator@local'], projectDir);
    execGitSafe(['config', 'user.name', 'Game Creator'], projectDir);

    // Create initial index.html - Nintendo × Kashiwa Sato style
    const initialHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Game</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FAFAFA;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-font-smoothing: antialiased;
    }
    .welcome {
      text-align: center;
      padding: 40px;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #FF3B30 0%, #FF6B6B 100%);
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 32px;
      box-shadow: 0 8px 32px rgba(255, 59, 48, 0.3);
    }
    .icon svg {
      width: 40px;
      height: 40px;
      color: white;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      color: #171717;
      letter-spacing: -0.03em;
      margin-bottom: 12px;
    }
    p {
      font-size: 1rem;
      color: #525252;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="welcome">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
      </svg>
    </div>
    <h1>Welcome to Game Creator!</h1>
    <p>Send a message to start creating your game.</p>
  </div>
</body>
</html>`;

    fs.writeFileSync(path.join(projectDir, 'index.html'), initialHtml);

    // Initial commit
    execGitSafe(['add', '-A'], projectDir);
    execGitSafe(['commit', '-m', 'Initial project setup'], projectDir);

    console.log('Created project directory:', projectDir);
  }

  return projectDir;
};

// Log activity to database (replaces git-based commitToUsers)
// Note: This is async but we don't await it - fire and forget
const logActivity = async (action, targetType = null, targetId = null, details = null, userId = null) => {
  try {
    await db.logActivity(userId, action, targetType, targetId, details);
  } catch (e) {
    // Ignore errors - activity logging should not break main flow
    console.log('Activity log error:', e.message);
  }
};

// Commit to project git
const commitToProject = (projectDir, message) => {
  const status = execGitSafe(['status', '--porcelain'], projectDir);
  if (!status) return null;

  // Sanitize message: remove newlines to prevent git commit -m issues
  const sanitizedMessage = (message || 'Update').replace(/[\r\n]+/g, ' ').trim();

  execGitSafe(['add', '-A'], projectDir);
  const result = execGitSafe(['commit', '-m', sanitizedMessage], projectDir);

  if (result !== null) {
    const hash = execGitSafe(['rev-parse', '--short', 'HEAD'], projectDir);
    return hash;
  }
  return null;
};

// ==================== User Operations ====================

/**
 * Ensure user directory exists (for file storage)
 * Called after Supabase Auth creates/retrieves user
 * @param {string} userId - Supabase Auth user ID
 */
const ensureUserDirectory = (userId) => {
  const userDir = config.getUserPath(userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
    // Fire and forget - don't await
    logActivity('create', 'user', userId);
  }
};

/**
 * @deprecated Use Supabase Auth directly
 * User creation is now handled by Supabase Auth
 */
const getOrCreateUserFromAuth = async () => {
  throw new Error('getOrCreateUserFromAuth is deprecated - use Supabase Auth');
};

/**
 * @deprecated Use Supabase Auth directly
 */
const getOrCreateUser = async () => {
  throw new Error('getOrCreateUser is deprecated - use Supabase Auth');
};

// ==================== Project Operations ====================

/**
 * Get all projects for a user
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @returns {Promise<Array>} Array of project objects
 */
const getProjects = async (client, userId) => {
  const c = getClient(client);
  const projects = await db.getProjectsByUserId(c, userId);

  // Get publish drafts for descriptions (parallel fetch)
  const drafts = await Promise.all(
    projects.map(p => db.getPublishDraft(c, p.id))
  );

  return projects.map((p, i) => ({
    id: p.id,
    name: p.name,
    description: drafts[i]?.description || '',
    isPublic: !!p.is_public,
    remixedFrom: p.remixed_from,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  }));
};

/**
 * Create a new project
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} name - Project name
 * @returns {Promise<Object>} Created project
 */
const createProject = async (client, userId, name = 'New Game') => {
  // Ensure user directory exists
  ensureUserDirectory(userId);

  const project = await db.createProject(getClient(client), userId, name);

  if (!project) {
    throw new Error('Failed to create project');
  }

  // Create project directory
  ensureProjectDir(userId, project.id);

  // Log activity (fire and forget)
  logActivity('create', 'project', project.id, name, userId);

  return {
    id: project.id,
    name: project.name,
    createdAt: project.created_at,
    updatedAt: project.updated_at
  };
};

/**
 * Delete a project
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} projectId - Project ID
 */
const deleteProject = async (client, userId, projectId) => {
  const c = getClient(client);
  const project = await db.getProjectById(c, projectId);
  if (!project) return;

  // Delete from database (RLS ensures ownership)
  await db.deleteProject(c, projectId);

  // Delete project directory
  const projectDir = getProjectDir(userId, projectId);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  logActivity('delete', 'project', projectId);
};

/**
 * Rename a project
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} projectId - Project ID
 * @param {string} newName - New project name
 * @returns {Promise<Object|null>} Updated project or null
 */
const renameProject = async (client, userId, projectId, newName) => {
  const project = await db.updateProject(getClient(client), projectId, newName);
  if (!project) return null;

  logActivity('rename', 'project', projectId, newName);

  return {
    id: project.id,
    name: project.name,
    createdAt: project.created_at,
    updatedAt: project.updated_at
  };
};

// ==================== File Operations ====================

/**
 * Recursively list all files in project directory
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} [subdir=''] - Subdirectory to list (for local recursion)
 * @returns {string[]|Promise<string[]>} Array of file paths
 *
 * Note: Returns Promise when USE_MODAL=true
 */
const listProjectFiles = (userId, projectId, subdir = '') => {
  // Use Modal for file listing if enabled
  if (config.USE_MODAL) {
    return listProjectFilesModal(userId, projectId);
  }

  // Local file listing
  return listProjectFilesLocal(userId, projectId, subdir);
};

// Local file listing (original implementation)
const listProjectFilesLocal = (userId, projectId, subdir = '') => {
  const projectDir = getProjectDir(userId, projectId);
  const targetDir = subdir ? path.join(projectDir, subdir) : projectDir;

  if (!fs.existsSync(targetDir)) return [];

  const results = [];
  const entries = fs.readdirSync(targetDir);

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;  // Skip hidden files
    if (entry.endsWith('.json') && !subdir) continue;  // Skip root-level json

    const entryPath = path.join(targetDir, entry);
    const relativePath = subdir ? `${subdir}/${entry}` : entry;
    const stat = fs.statSync(entryPath);

    if (stat.isDirectory()) {
      // Recursively get files from subdirectory
      const subFiles = listProjectFilesLocal(userId, projectId, relativePath);
      results.push(...subFiles);
    } else if (stat.isFile()) {
      results.push(relativePath);
    }
  }

  return results;
};

// Modal file listing
const listProjectFilesModal = async (userId, projectId) => {
  try {
    const client = getModalClient();
    const files = await client.listFiles(userId, projectId);

    // Filter out hidden files and root-level json (matching local behavior)
    return files.filter(f => {
      if (f.startsWith('.')) return false;
      if (f.endsWith('.json') && !f.includes('/')) return false;
      return true;
    });
  } catch (err) {
    console.error(`[listProjectFiles] Modal error:`, err.message);
    return [];
  }
};

// List only directories in project
const listProjectDirs = (userId, projectId) => {
  const projectDir = getProjectDir(userId, projectId);
  if (!fs.existsSync(projectDir)) return [];

  return fs.readdirSync(projectDir).filter(f => {
    const stat = fs.statSync(path.join(projectDir, f));
    return stat.isDirectory() && !f.startsWith('.');
  });
};

/**
 * Read a file from a project directory
 * @param {string} userId - User ID (Supabase Auth UUID)
 * @param {string} projectId - Project ID
 * @param {string} filename - Filename (can include subdirectory)
 * @returns {Promise<string|null>|string|null} File content or null if not found
 *
 * Note: Returns Promise when USE_MODAL=true, synchronous string when false
 * For backward compatibility, callers should handle both cases
 */
const readProjectFile = (userId, projectId, filename) => {
  // Use Modal for file reading if enabled
  if (config.USE_MODAL) {
    return readProjectFileModal(userId, projectId, filename);
  }

  // Local file reading
  return readProjectFileLocal(userId, projectId, filename);
};

// Local file reading (original implementation)
const readProjectFileLocal = (userId, projectId, filename) => {
  const projectDir = getProjectDir(userId, projectId);
  const filePath = path.join(projectDir, filename);

  // パストラバーサル対策: ファイルパスがプロジェクトディレクトリ内か検証
  if (!config.isPathSafe(projectDir, filePath)) {
    console.error('[readProjectFile] Path traversal attempt:', filename);
    return null;
  }

  if (fs.existsSync(filePath)) {
    // Check if it's a binary file
    const ext = path.extname(filename).toLowerCase();
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg'];
    if (binaryExtensions.includes(ext)) {
      return `[Binary file: ${filename}]`;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }
  return null;
};

// Modal file reading
const readProjectFileModal = async (userId, projectId, filename) => {
  try {
    const client = getModalClient();
    const content = await client.getFile(userId, projectId, filename);

    if (content === null) {
      return null;
    }

    // Check if it's a binary file (returned as Buffer)
    if (Buffer.isBuffer(content)) {
      return `[Binary file: ${filename}]`;
    }

    return content;
  } catch (err) {
    console.error(`[readProjectFile] Modal error for ${filename}:`, err.message);
    return null;
  }
};

/**
 * Sync project files from Modal Volume to local filesystem
 * Call this after Modal operations (Claude, Gemini, restore) to enable fast preview
 * @param {string} userId - User ID (Supabase Auth UUID)
 * @param {string} projectId - Project ID
 * @returns {Promise<number>} Number of files synced
 */
const syncFromModal = async (userId, projectId) => {
  if (!config.USE_MODAL) {
    return 0;  // No-op when not using Modal
  }

  const startTime = Date.now();
  const projectDir = ensureProjectDir(userId, projectId);
  const client = getModalClient();

  try {
    // List all files from Modal
    const files = await client.listFiles(userId, projectId);
    if (!files || files.length === 0) {
      console.log(`[syncFromModal] No files to sync for project ${projectId}`);
      return 0;
    }

    let syncedCount = 0;

    // Download and write each file
    for (const filename of files) {
      try {
        const content = await client.getFile(userId, projectId, filename);
        if (content === null) continue;

        const filePath = path.join(projectDir, filename);
        const fileDir = path.dirname(filePath);

        // Ensure subdirectory exists
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        // Write file (Buffer for binary, string for text)
        if (Buffer.isBuffer(content)) {
          fs.writeFileSync(filePath, content);
        } else {
          fs.writeFileSync(filePath, content, 'utf-8');
        }

        syncedCount++;
      } catch (fileErr) {
        console.error(`[syncFromModal] Failed to sync ${filename}:`, fileErr.message);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[syncFromModal] Synced ${syncedCount}/${files.length} files in ${elapsed}ms`);
    return syncedCount;
  } catch (err) {
    console.error(`[syncFromModal] Error:`, err.message);
    return 0;
  }
};

/**
 * Write a file to a project directory
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} projectId - Project ID
 * @param {string} filename - Filename (can include subdirectory)
 * @param {string} content - File content
 * @returns {Promise<string>} File path
 */
const writeProjectFile = async (client, userId, projectId, filename, content) => {
  // Use Modal for file writing if enabled
  if (config.USE_MODAL) {
    return writeProjectFileModal(client, userId, projectId, filename, content);
  }

  // Local file writing
  return writeProjectFileLocal(client, userId, projectId, filename, content);
};

// Local file writing (original implementation)
const writeProjectFileLocal = async (client, userId, projectId, filename, content) => {
  const projectDir = ensureProjectDir(userId, projectId);
  const filePath = path.join(projectDir, filename);

  // パストラバーサル対策: ファイルパスがプロジェクトディレクトリ内か検証
  if (!config.isPathSafe(projectDir, filePath)) {
    console.error('[writeProjectFile] Path traversal attempt:', filename);
    throw new Error('Invalid file path');
  }

  // Create subdirectory if needed
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  fs.writeFileSync(filePath, content);

  // Update project timestamp
  await db.touchProject(getClient(client), projectId);

  return filePath;
};

// Modal file writing
const writeProjectFileModal = async (client, userId, projectId, filename, content) => {
  try {
    const modalClientInstance = getModalClient();

    // Use applyFilesSync to wait for completion
    await modalClientInstance.applyFilesSync({
      user_id: userId,
      project_id: projectId,
      files: [{ path: filename, content: content, action: 'create' }],
      commit_message: `Update ${filename}`
    });

    // Update project timestamp in database
    await db.touchProject(getClient(client), projectId);

    // Return a virtual path (files are on Modal Volume)
    return `/modal/data/users/${userId}/projects/${projectId}/${filename}`;
  } catch (err) {
    console.error(`[writeProjectFile] Modal error for ${filename}:`, err.message);
    throw err;
  }
};

/**
 * Ensure user's assets directory exists
 * @param {string} userId - User ID
 * @returns {string} Path to user's assets directory
 */
const ensureUserAssetsDir = (userId) => {
  const userAssetsDir = config.getUserAssetsPath(userId);
  if (!fs.existsSync(userAssetsDir)) {
    fs.mkdirSync(userAssetsDir, { recursive: true });
  }
  return userAssetsDir;
};

/**
 * Save a generated image using reference-based asset management
 * Returns the API path (e.g., "/api/assets/{assetId}") for use in HTML
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} projectId - Project ID
 * @param {string} filename - Original filename
 * @param {string} base64Data - Base64 encoded image data
 * @returns {Promise<string|null>} API path or null on error
 */
const saveGeneratedImage = async (client, userId, projectId, filename, base64Data) => {
  const c = getClient(client);

  // Use unified assets directory structure
  const userAssetsDir = config.getUserAssetsPath(userId);
  if (!fs.existsSync(userAssetsDir)) {
    fs.mkdirSync(userAssetsDir, { recursive: true });
  }

  // Extract base64 data (remove data:image/png;base64, prefix if present)
  const base64Content = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  // Convert base64 to buffer
  const buffer = Buffer.from(base64Content, 'base64');

  // V2: Calculate SHA256 hash for deduplication
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const hashShort = hash.substring(0, 8);

  // V2: Sanitize baseName (same as upload endpoint)
  const ext = (path.extname(filename) || '.png').toLowerCase();
  const baseName = path.basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 32) || 'image';

  // V2: Generate alias with collision avoidance
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
  const storageName = `${aliasBase}_${hashShort}${ext}`;
  const storagePath = path.join(userAssetsDir, storageName);

  // Save file
  fs.writeFileSync(storagePath, buffer);

  // Determine MIME type from extension
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  const mimeType = mimeTypes[ext] || 'image/png';

  // V2: Create asset record with new fields
  // Wrap in try-catch to clean up orphan file on DB failure
  let asset;
  try {
    asset = await db.createAssetV2(c, {
      owner_id: userId,
      alias: alias,
      filename: storageName,
      original_name: filename,
      storage_path: storagePath,
      mime_type: mimeType,
      size: buffer.length,
      hash: hash,
      created_in_project_id: projectId,
      is_public: true,  // V2: Public by default for game assets
      is_remix_allowed: false,
      is_global: false,
      category: null,
      tags: null,
      description: null
    });
  } catch (dbError) {
    // Clean up orphan file on DB failure
    try {
      fs.unlinkSync(storagePath);
      console.error(`[saveGeneratedImage] DB failed, cleaned up: ${storagePath}`);
    } catch (cleanupError) {
      console.error(`[saveGeneratedImage] Failed to cleanup: ${storagePath}`);
    }
    throw dbError;
  }

  // Link asset to project
  await db.linkAssetToProject(c, projectId, asset.id, 'image');

  // Update project timestamp
  await db.touchProject(c, projectId);

  // V2: Return alias-based URL
  const assetUrl = `/user-assets/${userId}/${alias}`;
  console.log(`Saved generated image: ${filename} -> ${assetUrl}`);

  return assetUrl;
};

// ==================== Chat History Operations ====================

/**
 * Get conversation history for a project
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} projectId - Project ID
 * @param {number} limit - Max messages to return
 * @returns {Promise<Array>} Array of message objects
 */
const getConversationHistory = async (client, userId, projectId, limit = 50) => {
  const messages = await db.getChatHistory(getClient(client), projectId);
  const result = messages.map(m => ({
    role: m.role,
    content: m.message,
    timestamp: m.created_at
  }));
  return result.length > limit ? result.slice(-limit) : result;
};

/**
 * Add a message to conversation history
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} projectId - Project ID
 * @param {string} role - Message role (user/assistant)
 * @param {string} content - Message content
 */
const addToHistory = async (client, userId, projectId, role, content) => {
  const c = getClient(client);
  await db.addChatMessage(c, projectId, role, content);
  await db.touchProject(c, projectId);
};

// ==================== Version Control Operations ====================

/**
 * Save AI context (prompt, reasoning, skills) to .ai-context/ folder
 * This file is committed alongside code changes for full traceability
 * @param {string} projectDir - Project directory path
 * @param {Object} aiContext - AI context information
 * @param {string} aiContext.userPrompt - User's original request
 * @param {string} aiContext.aiSummary - AI's summary of changes
 * @param {string[]} aiContext.skills - Skills used for generation
 * @param {string} aiContext.generator - 'gemini' or 'claude'
 * @param {Array} aiContext.edits - Code edits made (optional)
 */
const saveAIContext = (projectDir, aiContext) => {
  const contextDir = path.join(projectDir, '.ai-context');

  // Create directory if needed
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  // Generate filename from timestamp (ISO format, replace colons for filesystem)
  const timestamp = new Date().toISOString();
  const filename = timestamp.replace(/:/g, '-').replace(/\.\d{3}Z$/, '') + '.json';
  const filePath = path.join(contextDir, filename);

  // Build context object
  const context = {
    timestamp,
    userPrompt: aiContext.userPrompt || '',
    aiSummary: aiContext.aiSummary || '',
    skills: aiContext.skills || [],
    generator: aiContext.generator || 'unknown',
    edits: aiContext.edits || [],
    systemPromptVersion: '1.0'
  };

  // Write file
  fs.writeFileSync(filePath, JSON.stringify(context, null, 2), 'utf-8');
  console.log(`Saved AI context: ${filename}`);

  return filePath;
};

/**
 * Create version snapshot with optional AI context
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} message - Commit message
 * @param {Object} aiContext - Optional AI context to save alongside commit
 */
const createVersionSnapshot = (userId, projectId, message = '', aiContext = null) => {
  const projectDir = getProjectDir(userId, projectId);
  const indexPath = path.join(projectDir, 'index.html');

  if (!fs.existsSync(indexPath)) return null;

  const content = fs.readFileSync(indexPath, 'utf-8');

  // Skip if it's just the initial welcome page
  if (content.length < 2000 && content.includes('Welcome to Game Creator')) {
    return null;
  }

  // Save AI context if provided (before git add)
  if (aiContext) {
    saveAIContext(projectDir, aiContext);
  }

  // Commit to project Git (includes .ai-context/ files)
  const hash = commitToProject(projectDir, message || 'Update');

  if (hash) {
    // Clear current version tracking (latest commit is now "current")
    setCurrentVersion(projectDir, null);

    // Log activity
    logActivity('update', 'project', projectId, message);
    return { id: hash, message };
  }

  return null;
};

// ==================== Current Version Tracking ====================

/**
 * Get the currently displayed version for a project
 * (Tracks which version was last restored or is being viewed)
 * @param {string} projectDir - Project directory path
 * @returns {string|null} Version hash or null if not set (defaults to latest)
 */
const getCurrentVersion = (projectDir) => {
  const versionFile = path.join(projectDir, '.current-version');
  try {
    if (fs.existsSync(versionFile)) {
      return fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (e) {
    // Ignore read errors
  }
  return null;
};

/**
 * Set the currently displayed version for a project
 * @param {string} projectDir - Project directory path
 * @param {string|null} versionHash - Version hash to set, or null to clear
 */
const setCurrentVersion = (projectDir, versionHash) => {
  const versionFile = path.join(projectDir, '.current-version');
  try {
    if (versionHash) {
      fs.writeFileSync(versionFile, versionHash, 'utf8');
    } else if (fs.existsSync(versionFile)) {
      fs.unlinkSync(versionFile);
    }
  } catch (e) {
    console.warn('[setCurrentVersion] Error:', e.message);
  }
};

/**
 * Get version history for a project
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.includeEdits] - Include edit diffs
 * @returns {Object|Promise<Object>} { versions: Array, currentHead: string|null }
 *
 * Note: Returns Promise when USE_MODAL=true
 */
const getVersions = (userId, projectId, options = {}) => {
  // Use Modal for git operations if enabled
  if (config.USE_MODAL) {
    return getVersionsModal(userId, projectId, options);
  }

  // Local git operations
  return getVersionsLocal(userId, projectId, options);
};

// Local git log (original implementation)
const getVersionsLocal = (userId, projectId, options = {}) => {
  const projectDir = getProjectDir(userId, projectId);

  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    return { versions: [], currentHead: null };
  }

  const logOutput = execGitSafe(['log', '--pretty=format:%h|%s|%ai', '-50'], projectDir);
  if (!logOutput) return { versions: [], currentHead: null };

  // Filter out internal commits
  const restorePatterns = ['Before restore', 'Restored to', 'Initial project setup', 'Migration from'];

  const allCommits = logOutput.split('\n').filter(line => line.trim());
  const versions = [];
  let versionNum = 1;

  for (const line of allCommits) {
    const [hash, message, timestamp] = line.split('|');

    const isRestoreCommit = restorePatterns.some(pattern =>
      message && message.includes(pattern)
    );

    if (!isRestoreCommit) {
      const version = {
        id: hash,
        number: versionNum++,
        message: message || 'Update',
        timestamp: new Date(timestamp).toISOString(),
        hash
      };

      // Include AI context (edits) if requested
      if (options.includeEdits) {
        const aiContext = getAIContextForCommit(projectDir, hash);
        if (aiContext && aiContext.edits && aiContext.edits.length > 0) {
          version.edits = aiContext.edits;
          version.summary = aiContext.aiSummary || '';
        }
      }

      versions.push(version);
    }
  }

  const finalVersions = versions.slice(0, 20);
  // Get current version from tracking file, or default to latest
  const currentHead = getCurrentVersion(projectDir) || (finalVersions[0]?.id || null);

  return { versions: finalVersions, currentHead };
};

// Modal git log
const getVersionsModal = async (userId, projectId, options = {}) => {
  const projectDir = getProjectDir(userId, projectId);

  try {
    const client = getModalClient();
    const gitLogResult = await client.gitLog(userId, projectId, 50);
    const commits = gitLogResult.commits;
    const autoInitialized = gitLogResult.autoInitialized;

    // Filter out internal commits (same as local)
    const restorePatterns = ['Before restore', 'Restored to', 'Initial project setup', 'Migration from'];

    const versions = [];
    let versionNum = 1;

    for (const commit of commits) {
      const isRestoreCommit = restorePatterns.some(pattern =>
        commit.message && commit.message.includes(pattern)
      );

      if (!isRestoreCommit) {
        const version = {
          id: commit.hash,
          number: versionNum++,
          message: commit.message || 'Update',
          timestamp: commit.date || new Date().toISOString(),
          hash: commit.hash
        };

        // Include edits if requested (via git diff)
        if (options.includeEdits) {
          try {
            const diff = await client.gitDiff(userId, projectId, commit.hash);
            if (diff) {
              version.edits = [{ diff }];
              version.summary = '';
            }
          } catch (diffErr) {
            console.warn(`[getVersionsModal] Failed to get diff for ${commit.hash}:`, diffErr.message);
          }
        }

        versions.push(version);
      }
    }

    const finalVersions = versions.slice(0, 20);
    // Get current version from local tracking file, or default to latest
    const currentHead = getCurrentVersion(projectDir) || (finalVersions[0]?.id || null);

    return { versions: finalVersions, currentHead, autoInitialized };
  } catch (err) {
    console.error('[getVersionsModal] Error:', err.message);
    return { versions: [], currentHead: null };
  }
};

/**
 * Get AI context for a specific git commit
 * @param {string} projectDir - Project directory path
 * @param {string} commitHash - Git commit hash
 * @returns {Object|null} AI context or null if not found
 */
const getAIContextForCommit = (projectDir, commitHash) => {
  // Validate commitHash format to prevent command injection
  if (!config.isValidGitHash(commitHash)) {
    console.error('Invalid git hash format:', commitHash);
    return null;
  }

  try {
    // First try .ai-context/ files
    const filesOutput = execGitSafe(['ls-tree', '--name-only', commitHash, '.ai-context/'], projectDir);
    if (filesOutput) {
      const files = filesOutput.split('\n').filter(f => f.endsWith('.json')).sort().reverse();
      if (files.length > 0) {
        const latestFile = files[0];
        const content = execGitSafe(['show', `${commitHash}:${latestFile}`], projectDir);
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.edits && parsed.edits.length > 0) {
            return parsed;
          }
        }
      }
    }

    // Fallback: generate edits from git diff
    const diff = execGitSafe(['diff', `${commitHash}^..${commitHash}`, '--', 'index.html'], projectDir);
    if (diff) {
      return {
        edits: [{ diff }],
        summary: '',
        fromGitDiff: true
      };
    }

    return null;
  } catch (e) {
    return null;
  }
};

/**
 * Restore project to a specific version
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} versionId - Git commit hash to restore to
 * @returns {Object|Promise<Object>} Result with success flag
 *
 * Note: Returns Promise when USE_MODAL=true
 */
const restoreVersion = (userId, projectId, versionId) => {
  // Validate versionId format to prevent command injection
  if (!config.isValidGitHash(versionId)) {
    return { success: false, error: 'Invalid version ID format' };
  }

  // Use Modal for git operations if enabled
  if (config.USE_MODAL) {
    return restoreVersionModal(userId, projectId, versionId);
  }

  // Local git operations
  return restoreVersionLocal(userId, projectId, versionId);
};

// Local git restore (original implementation)
const restoreVersionLocal = (userId, projectId, versionId) => {
  const projectDir = getProjectDir(userId, projectId);

  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    return { success: false, error: 'Git not initialized' };
  }

  // Checkout the specific version's files (no new commit created)
  // This just restores the files to that version's state
  const result = execGitSafe(['checkout', versionId, '--', '.'], projectDir);

  if (result !== null) {
    // Delete SPEC.md if it wasn't in the restored version
    // (git checkout won't delete files that didn't exist in that commit)
    const specPath = path.join(projectDir, 'SPEC.md');
    const specInCommit = execGitSafe(['ls-tree', versionId, '--name-only', 'SPEC.md'], projectDir);
    if (!specInCommit && fs.existsSync(specPath)) {
      fs.unlinkSync(specPath);
      console.log('Deleted SPEC.md (not in restored version)');
    }

    // Track which version is now being displayed
    setCurrentVersion(projectDir, versionId);

    // Don't create a new commit - just restore the files
    // User's history remains clean with only their actual changes
    return { success: true, versionId, needsSpecRegeneration: true };
  }

  return { success: false, error: 'Failed to restore version' };
};

// Modal git restore
const restoreVersionModal = async (userId, projectId, versionId) => {
  const projectDir = getProjectDir(userId, projectId);

  try {
    const client = getModalClient();
    const result = await client.gitRestore(userId, projectId, versionId);

    if (result.success) {
      // Track which version is now being displayed (in local cache)
      setCurrentVersion(projectDir, versionId);

      return {
        success: true,
        versionId,
        needsSpecRegeneration: true,
        restored_files: result.restored_files
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to restore version on Modal'
      };
    }
  } catch (err) {
    console.error('[restoreVersionModal] Error:', err.message);
    return { success: false, error: err.message };
  }
};

// ==================== Public Projects ====================

/**
 * Set project public/private status
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} projectId - Project ID
 * @param {boolean} isPublic - Public status
 * @returns {Promise<Object>} Updated project
 */
const setProjectPublic = async (client, userId, projectId, isPublic) => {
  const project = await db.setProjectPublic(getClient(client), projectId, isPublic);
  return {
    id: project.id,
    name: project.name,
    isPublic: !!project.is_public
  };
};

/**
 * Get public projects (for discovery)
 * Note: Uses admin client internally (public data)
 * @param {number} limit - Max projects to return
 * @returns {Promise<Array>} Array of public projects
 */
const getPublicProjects = async (limit = 50) => {
  return await db.getPublicProjects(limit);
};

// ==================== Remix ====================

/**
 * Remix a public project
 * @param {Object} client - Supabase client with user's JWT (optional, uses admin if null)
 * @param {string} userId - User ID (from Supabase Auth)
 * @param {string} sourceProjectId - Source project ID (must be public)
 * @returns {Promise<Object>} New remixed project
 */
const remixProject = async (client, userId, sourceProjectId) => {
  // Get source project via admin (caller already verified published_games.allow_remix)
  const { data: sourceProject, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', sourceProjectId)
    .single();

  if (error || !sourceProject) {
    throw new Error('Project not found');
  }

  // Create new project as remix
  const newProject = await db.createProject(
    getClient(client),
    userId,
    `${sourceProject.name} (Remix)`,
    sourceProjectId
  );

  // Copy files from source to new project
  // If USE_MODAL, sync source files from Modal to local FS first
  if (config.USE_MODAL) {
    await syncFromModal(sourceProject.user_id, sourceProjectId);
  }

  const sourceDir = getProjectDir(sourceProject.user_id, sourceProjectId);
  const targetDir = ensureProjectDir(userId, newProject.id);

  // listProjectFiles returns Promise when USE_MODAL=true
  const files = await listProjectFiles(sourceProject.user_id, sourceProjectId);
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    // Ensure subdirectories exist
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const content = fs.readFileSync(sourcePath);
    fs.writeFileSync(targetPath, content);
  }

  // Commit the remix
  execGitSafe(['add', '-A'], targetDir);
  execGitSafe(['commit', '-m', `Remixed from ${sourceProjectId}`], targetDir);

  logActivity('remix', 'project', newProject.id, `from ${sourceProjectId}`, userId);

  return {
    id: newProject.id,
    name: newProject.name,
    remixedFrom: sourceProjectId,
    createdAt: newProject.created_at
  };
};

// ==================== AI Context ====================

/**
 * Get the latest AI context for a project
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Object|null} Latest AI context or null if not found
 */
const getLatestAIContext = (userId, projectId) => {
  const projectDir = getProjectDir(userId, projectId);
  const contextDir = path.join(projectDir, '.ai-context');

  if (!fs.existsSync(contextDir)) {
    return null;
  }

  // Get all context files and sort by name (timestamp-based)
  const files = fs.readdirSync(contextDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  // Read the most recent context file
  const latestFile = path.join(contextDir, files[0]);
  try {
    const content = fs.readFileSync(latestFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to read AI context:', e);
    return null;
  }
};

/**
 * Get edits for a specific version (on demand)
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} versionHash - Git commit hash
 * @returns {Object|Promise<Object>|null} AI context or diff data
 *
 * Note: Returns Promise when USE_MODAL=true
 */
const getVersionEdits = (userId, projectId, versionHash) => {
  // Use Modal for git operations if enabled
  if (config.USE_MODAL) {
    return getVersionEditsModal(userId, projectId, versionHash);
  }

  // Local git operations
  const projectDir = getProjectDir(userId, projectId);
  return getAIContextForCommit(projectDir, versionHash);
};

// Modal git diff
const getVersionEditsModal = async (userId, projectId, versionHash) => {
  try {
    const client = getModalClient();
    const diff = await client.gitDiff(userId, projectId, versionHash);

    if (diff) {
      return {
        edits: [{ diff }],
        summary: '',
        fromGitDiff: true
      };
    }

    return null;
  } catch (err) {
    console.error('[getVersionEditsModal] Error:', err.message);
    return null;
  }
};

module.exports = {
  getProjectDir,
  ensureProjectDir,
  ensureUserDirectory,

  // User operations (deprecated - use Supabase Auth)
  getOrCreateUserFromAuth,  // @deprecated
  getOrCreateUser,          // @deprecated

  // Project operations (async, require client param)
  getProjects,
  createProject,
  deleteProject,
  renameProject,
  setProjectPublic,
  getPublicProjects,
  remixProject,

  // File operations
  listProjectFiles,
  listProjectDirs,
  readProjectFile,
  writeProjectFile,        // async, requires client param
  saveGeneratedImage,      // async, requires client param
  syncFromModal,           // async, sync Modal Volume -> local FS

  // Chat operations (async, require client param)
  getConversationHistory,
  addToHistory,

  // Version control
  createVersionSnapshot,
  getVersions,
  getVersionEdits,
  restoreVersion,

  // AI Context
  getLatestAIContext,
};
