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

// Initialize users directory git
const initUsersGit = () => {
  const gitDir = path.join(USERS_DIR, '.git');
  if (!fs.existsSync(gitDir)) {
    try {
      execSync('git init', { cwd: USERS_DIR, stdio: 'ignore' });
      execSync('git config user.email "gamecreator@local"', { cwd: USERS_DIR, stdio: 'ignore' });
      execSync('git config user.name "Game Creator"', { cwd: USERS_DIR, stdio: 'ignore' });
      // Create .gitignore
      fs.writeFileSync(path.join(USERS_DIR, '.gitignore'), '# Exclude project-level git\n*/*/.git/\n');
      execSync('git add -A', { cwd: USERS_DIR, stdio: 'ignore' });
      execSync('git commit -m "Initialize users directory" --allow-empty', { cwd: USERS_DIR, stdio: 'ignore' });
      console.log('Users directory git initialized');
    } catch (e) {
      console.log('Git init for users directory failed:', e.message);
    }
  }
};

initUsersGit();

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

    // Create initial index.html
    const initialHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Game</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: sans-serif;
      background: #1a1a2e;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .welcome {
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="welcome">
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

// Commit to users-level git (activity log)
const commitToUsers = (message) => {
  try {
    execGit('git add -A', USERS_DIR);
    const status = execGit('git status --porcelain', USERS_DIR);
    if (status && status.trim()) {
      execGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, USERS_DIR);
    }
  } catch (e) {
    // Ignore errors
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
    commitToUsers(`New user: ${visitorId}`);
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

  // Commit to users git
  commitToUsers(`Create project: ${name}`);

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

  commitToUsers(`Delete project: ${projectId}`);
};

const renameProject = (visitorId, projectId, newName) => {
  const project = db.updateProject(projectId, newName);
  if (!project) return null;

  commitToUsers(`Rename project: ${newName}`);

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

// Save a generated image to the project's assets directory
const saveGeneratedImage = (visitorId, projectId, filename, base64Data) => {
  const projectDir = ensureProjectDir(visitorId, projectId);
  const assetsDir = path.join(projectDir, 'assets');

  // Ensure assets directory exists
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Extract base64 data (remove data:image/png;base64, prefix if present)
  const base64Content = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  // Convert base64 to buffer and save
  const buffer = Buffer.from(base64Content, 'base64');
  const filePath = path.join(assetsDir, filename);
  fs.writeFileSync(filePath, buffer);

  // Update project timestamp
  db.touchProject(projectId);

  console.log(`Saved generated image: assets/${filename}`);
  return `assets/${filename}`;
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

const createVersionSnapshot = (visitorId, projectId, message = '') => {
  const projectDir = getProjectDir(visitorId, projectId);
  const indexPath = path.join(projectDir, 'index.html');

  if (!fs.existsSync(indexPath)) return null;

  const content = fs.readFileSync(indexPath, 'utf-8');

  // Skip if it's just the initial welcome page
  if (content.length < 1000 && content.includes('Welcome to Game Creator')) {
    return null;
  }

  // Commit to project Git
  const hash = commitToProject(projectDir, message || 'Update');

  if (hash) {
    // Also commit to users/ for global log
    commitToUsers(`Update: ${message} (${visitorId}/${projectId})`);
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

  commitToUsers(`Remix project: ${sourceProjectId} -> ${newProject.id}`);

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
