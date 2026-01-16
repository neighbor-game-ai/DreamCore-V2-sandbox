const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('./database');

// Base directory for user files (game code, assets)
const USERS_DIR = path.join(__dirname, '..', 'users');

// Ensure users directory exists
if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

// Note: Users directory git has been replaced with DB activity_log table
// initUsersGit() is no longer needed - activity is logged to SQLite instead

// Run migration from JSON files if needed
const runMigration = () => {
  try {
    const result = db.migrateFromJsonFiles(USERS_DIR);
    if (result.migratedUsers > 0 || result.migratedProjects > 0) {
      console.log('Migration completed:', result);
    }
  } catch (e) {
    console.error('Migration failed:', e);
  }
};

runMigration();

// Helper to execute git commands
const execGit = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch (e) {
    return null;
  }
};

// Get project directory path
const getProjectDir = (visitorId, projectId) => {
  return path.join(USERS_DIR, visitorId, projectId);
};

// Ensure project directory exists with git
const ensureProjectDir = (visitorId, projectId) => {
  const projectDir = getProjectDir(visitorId, projectId);

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
const logActivity = (action, targetType = null, targetId = null, details = null, userId = null) => {
  try {
    db.logActivity(userId, action, targetType, targetId, details);
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

const getOrCreateUser = (visitorId) => {
  // Generate new UUID if visitorId is null or undefined
  if (!visitorId) {
    visitorId = require('uuid').v4();
    console.log('Generated new visitorId:', visitorId);
  }

  const user = db.getOrCreateUser(visitorId);

  // Ensure visitor directory exists
  const visitorDir = path.join(USERS_DIR, visitorId);
  if (!fs.existsSync(visitorDir)) {
    fs.mkdirSync(visitorDir, { recursive: true });
    logActivity('create', 'user', visitorId);
  }

  return user.visitor_id;
};

// ==================== Project Operations ====================

const getProjects = (visitorId) => {
  const user = db.getUserByVisitorId(visitorId);
  if (!user) return [];

  const projects = db.getProjectsByUserId(user.id);
  return projects.map(p => ({
    id: p.id,
    name: p.name,
    isPublic: !!p.is_public,
    remixedFrom: p.remixed_from,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  }));
};

const createProject = (visitorId, name = 'New Game') => {
  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    throw new Error('User not found');
  }

  const project = db.createProject(user.id, name);

  // Create project directory
  ensureProjectDir(visitorId, project.id);

  // Log activity
  logActivity('create', 'project', project.id, name, user.id);

  return {
    id: project.id,
    name: project.name,
    createdAt: project.created_at,
    updatedAt: project.updated_at
  };
};

const deleteProject = (visitorId, projectId) => {
  const project = db.getProjectById(projectId);
  if (!project) return;

  // Delete from database
  db.deleteProject(projectId);

  // Delete project directory
  const projectDir = getProjectDir(visitorId, projectId);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  logActivity('delete', 'project', projectId);
};

const renameProject = (visitorId, projectId, newName) => {
  const project = db.updateProject(projectId, newName);
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
const listProjectFiles = (visitorId, projectId, subdir = '') => {
  const projectDir = getProjectDir(visitorId, projectId);
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
      const subFiles = listProjectFiles(visitorId, projectId, relativePath);
      results.push(...subFiles);
    } else if (stat.isFile()) {
      results.push(relativePath);
    }
  }

  return results;
};

// List only directories in project
const listProjectDirs = (visitorId, projectId) => {
  const projectDir = getProjectDir(visitorId, projectId);
  if (!fs.existsSync(projectDir)) return [];

  return fs.readdirSync(projectDir).filter(f => {
    const stat = fs.statSync(path.join(projectDir, f));
    return stat.isDirectory() && !f.startsWith('.');
  });
};

const readProjectFile = (visitorId, projectId, filename) => {
  const filePath = path.join(getProjectDir(visitorId, projectId), filename);
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

const writeProjectFile = (visitorId, projectId, filename, content) => {
  const projectDir = ensureProjectDir(visitorId, projectId);
  const filePath = path.join(projectDir, filename);

  // Create subdirectory if needed
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  fs.writeFileSync(filePath, content);

  // Update project timestamp
  db.touchProject(projectId);

  return filePath;
};

// Central assets directory (outside of project folders)
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Ensure user's assets directory exists
const ensureUserAssetsDir = (visitorId) => {
  const userAssetsDir = path.join(ASSETS_DIR, visitorId);
  if (!fs.existsSync(userAssetsDir)) {
    fs.mkdirSync(userAssetsDir, { recursive: true });
  }
  return userAssetsDir;
};

// Save a generated image using reference-based asset management
// Returns the API path (e.g., "/api/assets/{assetId}") for use in HTML
const saveGeneratedImage = (visitorId, projectId, filename, base64Data) => {
  // Get user for DB operations
  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    console.error('User not found for visitorId:', visitorId);
    return null;
  }

  // Ensure user's assets directory exists
  const userAssetsDir = ensureUserAssetsDir(visitorId);

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
  const asset = db.createAsset(
    user.id,
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
  db.linkAssetToProject(projectId, asset.id, 'image');

  // Update project timestamp
  db.touchProject(projectId);

  console.log(`Saved generated image: ${filename} -> /api/assets/${asset.id}`);

  // Return API path for use in HTML (reference-based)
  return `/api/assets/${asset.id}`;
};

// Search files in user's past projects using git
const searchPastProjects = (visitorId, query) => {
  const visitorDir = path.join(USERS_DIR, visitorId);
  if (!fs.existsSync(visitorDir)) return [];

  const results = [];
  const projectDirs = fs.readdirSync(visitorDir).filter(f => {
    const stat = fs.statSync(path.join(visitorDir, f));
    return stat.isDirectory() && !f.startsWith('.');
  });

  for (const projectId of projectDirs) {
    const projectDir = path.join(visitorDir, projectId);
    const gitDir = path.join(projectDir, '.git');

    if (!fs.existsSync(gitDir)) continue;

    // Search in git log for the query
    const grepResult = execGit(`git log --all -p --grep="${query}" --oneline -5`, projectDir);
    if (grepResult && grepResult.trim()) {
      results.push({
        projectId,
        type: 'commit',
        matches: grepResult.substring(0, 500)
      });
    }

    // Search in current files
    const files = listProjectFiles(visitorId, projectId);
    for (const file of files) {
      const content = readProjectFile(visitorId, projectId, file);
      if (content && content.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          projectId,
          type: 'file',
          file,
          preview: content.substring(0, 200)
        });
      }
    }
  }

  return results.slice(0, 10);  // Limit results
};

// ==================== Chat History Operations ====================

const getConversationHistory = (visitorId, projectId, limit = 50) => {
  const messages = db.getChatHistory(projectId);
  const result = messages.map(m => ({
    role: m.role,
    content: m.message,
    timestamp: m.created_at
  }));
  return result.length > limit ? result.slice(-limit) : result;
};

const addToHistory = (visitorId, projectId, role, content) => {
  db.addChatMessage(projectId, role, content);
  db.touchProject(projectId);
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
    systemPromptVersion: '1.0'
  };

  // Write file
  fs.writeFileSync(filePath, JSON.stringify(context, null, 2), 'utf-8');
  console.log(`Saved AI context: ${filename}`);

  return filePath;
};

/**
 * Create version snapshot with optional AI context
 * @param {string} visitorId - Visitor ID
 * @param {string} projectId - Project ID
 * @param {string} message - Commit message
 * @param {Object} aiContext - Optional AI context to save alongside commit
 */
const createVersionSnapshot = (visitorId, projectId, message = '', aiContext = null) => {
  const projectDir = getProjectDir(visitorId, projectId);
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

const getVersions = (visitorId, projectId) => {
  const projectDir = getProjectDir(visitorId, projectId);

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
      versions.push({
        id: hash,
        number: versionNum++,
        message: message || 'Update',
        timestamp: new Date(timestamp).toISOString(),
        hash
      });
    }
  }

  return versions.slice(0, 20);
};

const restoreVersion = (visitorId, projectId, versionId) => {
  const projectDir = getProjectDir(visitorId, projectId);

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

const setProjectPublic = (visitorId, projectId, isPublic) => {
  const project = db.setProjectPublic(projectId, isPublic);
  return {
    id: project.id,
    name: project.name,
    isPublic: !!project.is_public
  };
};

const getPublicProjects = (limit = 50) => {
  return db.getPublicProjects(limit);
};

// ==================== Remix ====================

const remixProject = (visitorId, sourceProjectId) => {
  const sourceProject = db.getProjectById(sourceProjectId);
  if (!sourceProject || !sourceProject.is_public) {
    throw new Error('Project not found or not public');
  }

  const user = db.getUserByVisitorId(visitorId);
  if (!user) {
    throw new Error('User not found');
  }

  // Find source visitor
  const sourceUser = db.getUserById(sourceProject.user_id);
  if (!sourceUser) {
    throw new Error('Source user not found');
  }

  // Create new project as remix
  const newProject = db.createProject(user.id, `${sourceProject.name} (Remix)`, sourceProjectId);

  // Copy files
  const sourceDir = getProjectDir(sourceUser.visitor_id, sourceProjectId);
  const targetDir = ensureProjectDir(visitorId, newProject.id);

  const files = listProjectFiles(sourceUser.visitor_id, sourceProjectId);
  for (const file of files) {
    const content = fs.readFileSync(path.join(sourceDir, file));
    fs.writeFileSync(path.join(targetDir, file), content);
  }

  // Commit the remix
  execGit('git add -A', targetDir);
  execGit(`git commit -m "Remixed from ${sourceProjectId}"`, targetDir);

  logActivity('remix', 'project', newProject.id, `from ${sourceProjectId}`, user.id);

  return {
    id: newProject.id,
    name: newProject.name,
    remixedFrom: sourceProjectId,
    createdAt: newProject.created_at
  };
};

module.exports = {
  getProjectDir,
  ensureProjectDir,

  // User operations
  getOrCreateUser,

  // Project operations
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
  writeProjectFile,
  saveGeneratedImage,
  searchPastProjects,

  // Chat operations
  getConversationHistory,
  addToHistory,

  // Version control
  createVersionSnapshot,
  getVersions,
  restoreVersion,
};
