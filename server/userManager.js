/**
 * User Manager for DreamCore V2
 *
 * Handles user data, projects, and file operations.
 *
 * V2 Changes:
 * - Uses config.js for path configuration
 * - userId (Supabase Auth UUID) for all user identification
 *
 * Path Structure:
 * - Production: /data/projects/{userId}/{projectId}/
 * - Development: ./users/{userId}/{projectId}/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('./database-supabase');
const { supabaseAdmin } = require('./supabaseClient');
const config = require('./config');

// Helper: get client or fallback to admin (for background job context)
const getClient = (client) => client || supabaseAdmin;

// Base directory for user files (game code, assets)
const PROJECTS_DIR = config.PROJECTS_DIR;
const ASSETS_DIR = config.ASSETS_DIR;

// Ensure directories exist
config.ensureDirectories();

// Note: Users directory git has been replaced with DB activity_log table
// initUsersGit() is no longer needed - activity is logged to SQLite instead

// Note: Migration from JSON files is no longer needed with Supabase
// Legacy data migration should be done via SQL scripts or manual import

// Helper to execute git commands
const execGit = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
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
    execGit('git init', projectDir);
    execGit('git config user.email "gamecreator@local"', projectDir);
    execGit('git config user.name "Game Creator"', projectDir);

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
    execGit('git add -A', projectDir);
    execGit('git commit -m "Initial project setup"', projectDir);

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
  const status = execGit('git status --porcelain', projectDir);
  if (!status) return null;

  execGit('git add -A', projectDir);
  const result = execGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, projectDir);

  if (result !== null) {
    const hash = execGit('git rev-parse --short HEAD', projectDir);
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

// Recursively list all files in project directory
const listProjectFiles = (userId, projectId, subdir = '') => {
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
      const subFiles = listProjectFiles(userId, projectId, relativePath);
      results.push(...subFiles);
    } else if (stat.isFile()) {
      results.push(relativePath);
    }
  }

  return results;
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

const readProjectFile = (userId, projectId, filename) => {
  const filePath = path.join(getProjectDir(userId, projectId), filename);
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
  const projectDir = ensureProjectDir(userId, projectId);
  const filePath = path.join(projectDir, filename);

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

  // Ensure user's assets directory exists
  const userAssetsDir = ensureUserAssetsDir(userId);

  // Generate unique asset ID
  const assetId = require('uuid').v4();
  const ext = path.extname(filename) || '.png';
  const storageName = `${assetId}${ext}`;
  const storagePath = path.join(userAssetsDir, storageName);

  // Extract base64 data (remove data:image/png;base64, prefix if present)
  const base64Content = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  // Convert base64 to buffer and save
  const buffer = Buffer.from(base64Content, 'base64');
  fs.writeFileSync(storagePath, buffer);

  // Determine MIME type from extension
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  const mimeType = mimeTypes[ext.toLowerCase()] || 'image/png';

  // Create asset record in database
  const asset = await db.createAsset(
    c,
    userId,
    storageName,
    filename,
    storagePath,
    mimeType,
    buffer.length,
    false,  // isPublic
    null,   // tags
    null    // description
  );

  // Link asset to project
  await db.linkAssetToProject(c, projectId, asset.id, 'image');

  // Update project timestamp
  await db.touchProject(c, projectId);

  console.log(`Saved generated image: ${filename} -> /api/assets/${asset.id}`);

  // Return API path for use in HTML (reference-based)
  return `/api/assets/${asset.id}`;
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
    // Log activity
    logActivity('update', 'project', projectId, message);
    return { id: hash, message };
  }

  return null;
};

const getVersions = (userId, projectId, options = {}) => {
  const projectDir = getProjectDir(userId, projectId);

  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    return [];
  }

  const logOutput = execGit('git log --pretty=format:"%h|%s|%ai" -50', projectDir);
  if (!logOutput) return [];

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

  return versions.slice(0, 20);
};

/**
 * Get AI context for a specific git commit
 * @param {string} projectDir - Project directory path
 * @param {string} commitHash - Git commit hash
 * @returns {Object|null} AI context or null if not found
 */
const getAIContextForCommit = (projectDir, commitHash) => {
  try {
    // First try .ai-context/ files
    const filesOutput = execGit(`git ls-tree --name-only ${commitHash} .ai-context/`, projectDir);
    if (filesOutput) {
      const files = filesOutput.split('\n').filter(f => f.endsWith('.json')).sort().reverse();
      if (files.length > 0) {
        const latestFile = files[0];
        const content = execGit(`git show ${commitHash}:${latestFile}`, projectDir);
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.edits && parsed.edits.length > 0) {
            return parsed;
          }
        }
      }
    }

    // Fallback: generate edits from git diff
    const diff = execGit(`git diff ${commitHash}^..${commitHash} -- index.html`, projectDir);
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

const restoreVersion = (userId, projectId, versionId) => {
  const projectDir = getProjectDir(userId, projectId);

  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    return { success: false, error: 'Git not initialized' };
  }

  // Checkout the specific version's files (no new commit created)
  // This just restores the files to that version's state
  const result = execGit(`git checkout ${versionId} -- .`, projectDir);

  if (result !== null) {
    // Delete SPEC.md if it wasn't in the restored version
    // (git checkout won't delete files that didn't exist in that commit)
    const specPath = path.join(projectDir, 'SPEC.md');
    const specInCommit = execGit(`git ls-tree ${versionId} --name-only SPEC.md`, projectDir);
    if (!specInCommit && fs.existsSync(specPath)) {
      fs.unlinkSync(specPath);
      console.log('Deleted SPEC.md (not in restored version)');
    }

    // Don't create a new commit - just restore the files
    // User's history remains clean with only their actual changes
    return { success: true, versionId, needsSpecRegeneration: true };
  }

  return { success: false, error: 'Failed to restore version' };
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
  // Get source project (uses admin to read public projects)
  const sourceProject = await db.getPublicProjectById(sourceProjectId);
  if (!sourceProject || !sourceProject.is_public) {
    throw new Error('Project not found or not public');
  }

  // Create new project as remix
  const newProject = await db.createProject(
    getClient(client),
    userId,
    `${sourceProject.name} (Remix)`,
    sourceProjectId
  );

  // Copy files from source to new project
  const sourceDir = getProjectDir(sourceProject.user_id, sourceProjectId);
  const targetDir = ensureProjectDir(userId, newProject.id);

  const files = listProjectFiles(sourceProject.user_id, sourceProjectId);
  for (const file of files) {
    const content = fs.readFileSync(path.join(sourceDir, file));
    fs.writeFileSync(path.join(targetDir, file), content);
  }

  // Commit the remix
  execGit('git add -A', targetDir);
  execGit(`git commit -m "Remixed from ${sourceProjectId}"`, targetDir);

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
 */
const getVersionEdits = (userId, projectId, versionHash) => {
  const projectDir = getProjectDir(userId, projectId);
  return getAIContextForCommit(projectDir, versionHash);
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
