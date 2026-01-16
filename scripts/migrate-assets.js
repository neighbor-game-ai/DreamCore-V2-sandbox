#!/usr/bin/env node
/**
 * Asset Migration Script
 *
 * Migrates existing project assets from:
 *   users/{userId}/{projectId}/assets/
 * To reference-based structure:
 *   assets/{userId}/{assetId}.ext
 *
 * Also updates HTML references from:
 *   assets/player.png
 * To:
 *   /api/assets/{assetId}
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Database
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '..', 'data', 'gamecreator.db');
const db = new Database(DB_PATH);

// Directories
const USERS_DIR = path.join(__dirname, '..', 'users');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Ensure assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Stats
let stats = {
  projectsScanned: 0,
  assetsFound: 0,
  assetsMigrated: 0,
  htmlUpdated: 0,
  errors: []
};

// MIME type mapping
const mimeTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

// Get user ID from visitor ID
function getUserId(visitorId) {
  const stmt = db.prepare('SELECT id FROM users WHERE visitor_id = ?');
  const user = stmt.get(visitorId);
  return user ? user.id : null;
}

// Create asset record
function createAssetRecord(userId, filename, originalName, storagePath, mimeType, size) {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO assets (id, owner_id, filename, original_name, storage_path, mime_type, size, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);
  stmt.run(id, userId, filename, originalName, storagePath, mimeType, size);
  return id;
}

// Link asset to project
function linkAssetToProject(projectId, assetId) {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO project_assets (id, project_id, asset_id, usage_type)
    VALUES (?, ?, ?, 'image')
  `);
  stmt.run(id, projectId, assetId);
}

// Migrate a single asset
function migrateAsset(visitorId, projectId, userId, assetFilename, assetPath) {
  try {
    // Read the asset
    const buffer = fs.readFileSync(assetPath);
    const ext = path.extname(assetFilename).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // Generate new asset ID and path
    const assetId = uuidv4();
    const storageName = `${assetId}${ext}`;

    // Ensure user's assets directory exists
    const userAssetsDir = path.join(ASSETS_DIR, visitorId);
    if (!fs.existsSync(userAssetsDir)) {
      fs.mkdirSync(userAssetsDir, { recursive: true });
    }

    const newPath = path.join(userAssetsDir, storageName);

    // Copy file to new location
    fs.writeFileSync(newPath, buffer);

    // Create database record
    const dbAssetId = createAssetRecord(
      userId,
      storageName,
      assetFilename,
      newPath,
      mimeType,
      buffer.length
    );

    // Link to project
    linkAssetToProject(projectId, dbAssetId);

    console.log(`  Migrated: ${assetFilename} -> /api/assets/${dbAssetId}`);

    return {
      originalName: assetFilename,
      assetId: dbAssetId,
      apiPath: `/api/assets/${dbAssetId}`
    };
  } catch (err) {
    stats.errors.push(`Failed to migrate ${assetPath}: ${err.message}`);
    return null;
  }
}

// Update HTML references
function updateHtmlReferences(htmlPath, assetMapping) {
  try {
    let html = fs.readFileSync(htmlPath, 'utf-8');
    let updated = false;

    for (const mapping of assetMapping) {
      // Match various ways assets might be referenced
      const patterns = [
        `assets/${mapping.originalName}`,
        `./assets/${mapping.originalName}`,
        `"assets/${mapping.originalName}"`,
        `'assets/${mapping.originalName}'`
      ];

      for (const pattern of patterns) {
        if (html.includes(pattern)) {
          // Replace with API path, preserving quotes if present
          const replacement = pattern.startsWith('"') || pattern.startsWith("'")
            ? pattern[0] + mapping.apiPath + pattern[0]
            : mapping.apiPath;

          html = html.split(pattern).join(replacement);
          updated = true;
        }
      }
    }

    if (updated) {
      fs.writeFileSync(htmlPath, html, 'utf-8');
      stats.htmlUpdated++;
      console.log(`  Updated HTML references in ${path.basename(htmlPath)}`);
    }

    return updated;
  } catch (err) {
    stats.errors.push(`Failed to update HTML ${htmlPath}: ${err.message}`);
    return false;
  }
}

// Process a single project
function processProject(visitorId, projectId, projectDir) {
  const assetsDir = path.join(projectDir, 'assets');

  if (!fs.existsSync(assetsDir)) {
    return; // No assets to migrate
  }

  const userId = getUserId(visitorId);
  if (!userId) {
    stats.errors.push(`User not found for visitorId: ${visitorId}`);
    return;
  }

  console.log(`\nProcessing project: ${projectId}`);

  // Get all asset files
  const assets = fs.readdirSync(assetsDir).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
  });

  if (assets.length === 0) {
    return;
  }

  stats.assetsFound += assets.length;
  console.log(`  Found ${assets.length} asset(s)`);

  // Migrate each asset
  const assetMapping = [];
  for (const assetFile of assets) {
    const assetPath = path.join(assetsDir, assetFile);
    const result = migrateAsset(visitorId, projectId, userId, assetFile, assetPath);
    if (result) {
      assetMapping.push(result);
      stats.assetsMigrated++;
    }
  }

  // Update HTML references
  const htmlPath = path.join(projectDir, 'index.html');
  if (fs.existsSync(htmlPath) && assetMapping.length > 0) {
    updateHtmlReferences(htmlPath, assetMapping);
  }
}

// Main migration function
function migrate() {
  console.log('='.repeat(60));
  console.log('Asset Migration Script');
  console.log('='.repeat(60));
  console.log(`\nUsers directory: ${USERS_DIR}`);
  console.log(`Assets directory: ${ASSETS_DIR}\n`);

  // Check if migration is needed
  if (!fs.existsSync(USERS_DIR)) {
    console.log('No users directory found. Nothing to migrate.');
    return;
  }

  // Get all user directories
  const userDirs = fs.readdirSync(USERS_DIR).filter(f => {
    const fullPath = path.join(USERS_DIR, f);
    return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
  });

  console.log(`Found ${userDirs.length} user directories\n`);

  // Process each user
  for (const visitorId of userDirs) {
    const userDir = path.join(USERS_DIR, visitorId);

    // Get all project directories for this user
    const projectDirs = fs.readdirSync(userDir).filter(f => {
      const fullPath = path.join(userDir, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
    });

    for (const projectId of projectDirs) {
      const projectDir = path.join(userDir, projectId);
      stats.projectsScanned++;
      processProject(visitorId, projectId, projectDir);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Migration Complete');
  console.log('='.repeat(60));
  console.log(`Projects scanned: ${stats.projectsScanned}`);
  console.log(`Assets found: ${stats.assetsFound}`);
  console.log(`Assets migrated: ${stats.assetsMigrated}`);
  console.log(`HTML files updated: ${stats.htmlUpdated}`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }

  console.log('\nDone!');
}

// Run migration
migrate();
