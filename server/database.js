const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Database file location
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'gamecreator.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
const initSchema = () => {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      visitor_id TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'New Game',
      is_public INTEGER DEFAULT 0,
      remixed_from TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (remixed_from) REFERENCES projects(id) ON DELETE SET NULL
    );

    -- Assets table
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      storage_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      is_public INTEGER DEFAULT 0,
      tags TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Chat history table
    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Jobs table for async processing
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
      progress INTEGER DEFAULT 0,
      progress_message TEXT,
      result TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_is_public ON projects(is_public);
    CREATE INDEX IF NOT EXISTS idx_assets_owner_id ON assets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_chat_history_project_id ON chat_history(project_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  `);

  console.log('Database schema initialized');
};

// Initialize schema on module load
initSchema();

// ==================== User Operations ====================

const userQueries = {
  findByVisitorId: db.prepare('SELECT * FROM users WHERE visitor_id = ?'),
  create: db.prepare('INSERT INTO users (id, visitor_id) VALUES (?, ?)'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
};

const getOrCreateUser = (visitorId) => {
  let user = userQueries.findByVisitorId.get(visitorId);
  if (!user) {
    const id = uuidv4();
    userQueries.create.run(id, visitorId);
    user = userQueries.findById.get(id);
    console.log('Created new user:', id);
  }
  return user;
};

const getUserByVisitorId = (visitorId) => {
  return userQueries.findByVisitorId.get(visitorId);
};

const getUserById = (id) => {
  return userQueries.findById.get(id);
};

// ==================== Project Operations ====================

const projectQueries = {
  findByUserId: db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC'),
  findById: db.prepare('SELECT * FROM projects WHERE id = ?'),
  create: db.prepare('INSERT INTO projects (id, user_id, name, remixed_from) VALUES (?, ?, ?, ?)'),
  update: db.prepare("UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?"),
  delete: db.prepare('DELETE FROM projects WHERE id = ?'),
  setPublic: db.prepare("UPDATE projects SET is_public = ?, updated_at = datetime('now') WHERE id = ?"),
  findPublic: db.prepare('SELECT p.*, u.visitor_id as creator_visitor_id FROM projects p JOIN users u ON p.user_id = u.id WHERE p.is_public = 1 ORDER BY p.updated_at DESC LIMIT ?'),
  touch: db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?"),
};

const getProjectsByUserId = (userId) => {
  return projectQueries.findByUserId.all(userId);
};

const getProjectById = (projectId) => {
  return projectQueries.findById.get(projectId);
};

const createProject = (userId, name = 'New Game', remixedFrom = null) => {
  const id = uuidv4();
  projectQueries.create.run(id, userId, name, remixedFrom);
  return projectQueries.findById.get(id);
};

const updateProject = (projectId, name) => {
  projectQueries.update.run(name, projectId);
  return projectQueries.findById.get(projectId);
};

const deleteProject = (projectId) => {
  projectQueries.delete.run(projectId);
};

const setProjectPublic = (projectId, isPublic) => {
  projectQueries.setPublic.run(isPublic ? 1 : 0, projectId);
  return projectQueries.findById.get(projectId);
};

const getPublicProjects = (limit = 50) => {
  return projectQueries.findPublic.all(limit);
};

const touchProject = (projectId) => {
  projectQueries.touch.run(projectId);
};

// ==================== Chat History Operations ====================

const chatQueries = {
  findByProjectId: db.prepare('SELECT * FROM chat_history WHERE project_id = ? ORDER BY created_at ASC'),
  create: db.prepare('INSERT INTO chat_history (id, project_id, role, message) VALUES (?, ?, ?, ?)'),
  deleteByProjectId: db.prepare('DELETE FROM chat_history WHERE project_id = ?'),
};

const getChatHistory = (projectId) => {
  return chatQueries.findByProjectId.all(projectId);
};

const addChatMessage = (projectId, role, message) => {
  const id = uuidv4();
  chatQueries.create.run(id, projectId, role, message);
  return { id, project_id: projectId, role, message };
};

const clearChatHistory = (projectId) => {
  chatQueries.deleteByProjectId.run(projectId);
};

// ==================== Asset Operations ====================

const assetQueries = {
  findByOwnerId: db.prepare('SELECT * FROM assets WHERE owner_id = ? ORDER BY created_at DESC'),
  findById: db.prepare('SELECT * FROM assets WHERE id = ?'),
  create: db.prepare('INSERT INTO assets (id, owner_id, filename, original_name, storage_path, mime_type, size, is_public, tags, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  delete: db.prepare('DELETE FROM assets WHERE id = ?'),
  setPublic: db.prepare('UPDATE assets SET is_public = ? WHERE id = ?'),
  updateMeta: db.prepare('UPDATE assets SET tags = ?, description = ? WHERE id = ?'),
  findPublic: db.prepare('SELECT * FROM assets WHERE is_public = 1 ORDER BY created_at DESC LIMIT ?'),
  findAccessible: db.prepare('SELECT * FROM assets WHERE owner_id = ? OR is_public = 1 ORDER BY created_at DESC'),
};

const getAssetsByOwnerId = (ownerId) => {
  return assetQueries.findByOwnerId.all(ownerId);
};

const getAssetById = (assetId) => {
  return assetQueries.findById.get(assetId);
};

const getAccessibleAssets = (userId) => {
  return assetQueries.findAccessible.all(userId);
};

const searchAssets = (userId, query) => {
  const searchQuery = `%${query.toLowerCase()}%`;
  const stmt = db.prepare(`
    SELECT * FROM assets
    WHERE (owner_id = ? OR is_public = 1)
    AND (LOWER(filename) LIKE ? OR LOWER(original_name) LIKE ? OR LOWER(tags) LIKE ? OR LOWER(description) LIKE ?)
    ORDER BY created_at DESC
    LIMIT 50
  `);
  return stmt.all(userId, searchQuery, searchQuery, searchQuery, searchQuery);
};

const getPublicAssets = (limit = 50) => {
  return assetQueries.findPublic.all(limit);
};

const createAsset = (ownerId, filename, originalName, storagePath, mimeType = null, size = null, isPublic = false, tags = null, description = null) => {
  const id = uuidv4();
  assetQueries.create.run(id, ownerId, filename, originalName, storagePath, mimeType, size, isPublic ? 1 : 0, tags, description);
  return assetQueries.findById.get(id);
};

const deleteAsset = (assetId) => {
  assetQueries.delete.run(assetId);
};

const setAssetPublic = (assetId, isPublic) => {
  assetQueries.setPublic.run(isPublic ? 1 : 0, assetId);
  return assetQueries.findById.get(assetId);
};

const updateAssetMeta = (assetId, tags, description) => {
  assetQueries.updateMeta.run(tags, description, assetId);
  return assetQueries.findById.get(assetId);
};

// ==================== Job Operations ====================

const jobQueries = {
  findById: db.prepare('SELECT * FROM jobs WHERE id = ?'),
  findByUserId: db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'),
  findByProjectId: db.prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'),
  findActiveByProjectId: db.prepare("SELECT * FROM jobs WHERE project_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT 1"),
  findPending: db.prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?"),
  create: db.prepare("INSERT INTO jobs (id, user_id, project_id, status) VALUES (?, ?, ?, 'pending')"),
  updateStatus: db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?"),
  updateProgress: db.prepare("UPDATE jobs SET progress = ?, progress_message = ?, updated_at = datetime('now') WHERE id = ?"),
  complete: db.prepare("UPDATE jobs SET status = 'completed', progress = 100, result = ?, updated_at = datetime('now') WHERE id = ?"),
  fail: db.prepare("UPDATE jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?"),
  cancel: db.prepare("UPDATE jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"),
};

const getJobById = (jobId) => {
  return jobQueries.findById.get(jobId);
};

const getJobsByUserId = (userId, limit = 20) => {
  return jobQueries.findByUserId.all(userId, limit);
};

const getJobsByProjectId = (projectId, limit = 20) => {
  return jobQueries.findByProjectId.all(projectId, limit);
};

const getActiveJobByProjectId = (projectId) => {
  return jobQueries.findActiveByProjectId.get(projectId);
};

const getPendingJobs = (limit = 10) => {
  return jobQueries.findPending.all(limit);
};

const createJob = (userId, projectId) => {
  const id = uuidv4();
  jobQueries.create.run(id, userId, projectId);
  return jobQueries.findById.get(id);
};

const updateJobStatus = (jobId, status) => {
  jobQueries.updateStatus.run(status, jobId);
  return jobQueries.findById.get(jobId);
};

const updateJobProgress = (jobId, progress, message = null) => {
  jobQueries.updateProgress.run(progress, message, jobId);
  return jobQueries.findById.get(jobId);
};

const completeJob = (jobId, result = null) => {
  const resultJson = result ? JSON.stringify(result) : null;
  jobQueries.complete.run(resultJson, jobId);
  return jobQueries.findById.get(jobId);
};

const failJob = (jobId, error) => {
  jobQueries.fail.run(error, jobId);
  return jobQueries.findById.get(jobId);
};

const cancelJob = (jobId) => {
  jobQueries.cancel.run(jobId);
  return jobQueries.findById.get(jobId);
};

// ==================== Migration from JSON files ====================

const migrateFromJsonFiles = (usersDir) => {
  if (!fs.existsSync(usersDir)) {
    console.log('No users directory found, skipping migration');
    return { migrated: 0 };
  }

  let migratedUsers = 0;
  let migratedProjects = 0;
  let migratedMessages = 0;

  const visitorDirs = fs.readdirSync(usersDir).filter(f => {
    const stat = fs.statSync(path.join(usersDir, f));
    return stat.isDirectory() && f !== '.git';
  });

  for (const visitorId of visitorDirs) {
    const visitorDir = path.join(usersDir, visitorId);

    // Check if user already exists
    let user = getUserByVisitorId(visitorId);
    if (!user) {
      user = getOrCreateUser(visitorId);
      migratedUsers++;
    }

    // Read projects.json
    const projectsJsonPath = path.join(visitorDir, 'projects.json');
    if (fs.existsSync(projectsJsonPath)) {
      try {
        const projectsData = JSON.parse(fs.readFileSync(projectsJsonPath, 'utf-8'));

        for (const proj of projectsData.projects || []) {
          // Check if project already exists
          const existingProject = getProjectById(proj.id);
          if (existingProject) continue;

          // Create project with original ID
          db.prepare('INSERT OR IGNORE INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(proj.id, user.id, proj.name, proj.createdAt, proj.updatedAt);
          migratedProjects++;

          // Migrate chat history
          const chatHistoryPath = path.join(visitorDir, proj.id, 'chat-history.json');
          if (fs.existsSync(chatHistoryPath)) {
            try {
              const chatData = JSON.parse(fs.readFileSync(chatHistoryPath, 'utf-8'));
              for (const msg of chatData.messages || chatData || []) {
                addChatMessage(proj.id, msg.role, msg.content || msg.message);
                migratedMessages++;
              }
            } catch (e) {
              console.log(`Failed to migrate chat history for project ${proj.id}:`, e.message);
            }
          }
        }
      } catch (e) {
        console.log(`Failed to read projects.json for visitor ${visitorId}:`, e.message);
      }
    }
  }

  console.log(`Migration complete: ${migratedUsers} users, ${migratedProjects} projects, ${migratedMessages} messages`);
  return { migratedUsers, migratedProjects, migratedMessages };
};

// Export all functions
module.exports = {
  db,

  // User operations
  getOrCreateUser,
  getUserByVisitorId,
  getUserById,

  // Project operations
  getProjectsByUserId,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  setProjectPublic,
  getPublicProjects,
  touchProject,

  // Chat operations
  getChatHistory,
  addChatMessage,
  clearChatHistory,

  // Asset operations
  getAssetsByOwnerId,
  getAssetById,
  getAccessibleAssets,
  searchAssets,
  getPublicAssets,
  createAsset,
  deleteAsset,
  setAssetPublic,
  updateAssetMeta,

  // Job operations
  getJobById,
  getJobsByUserId,
  getJobsByProjectId,
  getActiveJobByProjectId,
  getPendingJobs,
  createJob,
  updateJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,

  // Migration
  migrateFromJsonFiles,
};
