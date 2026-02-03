const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getProjectPath } = require('./config');
const { injectPublicGameHtml, rewriteUserAssets } = require('./gameHtmlUtils');
const { putObject, getPublicUrl, isR2Enabled, objectExists } = require('./r2Client');
const userManager = require('./userManager');

const CONTENT_TYPES = {
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

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.json']);

const getAssetBaseUrl = () => {
  if (config.ASSET_BASE_URL) {
    return config.ASSET_BASE_URL.replace(/\/+$/, '');
  }
  return config.V2_DOMAIN ? config.V2_DOMAIN.replace(/\/+$/, '') : '';
};

const shouldSkipRootJson = (relativePath) => {
  return !relativePath.includes('/') && relativePath.endsWith('.json');
};

const walkProjectFiles = (projectDir) => {
  const results = [];

  const walk = (dir, relPrefix = '') => {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;

      const absPath = path.join(dir, entry);
      const relPath = relPrefix ? `${relPrefix}/${entry}` : entry;
      const stat = fs.statSync(absPath);

      if (stat.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }

      if (stat.isFile()) {
        if (shouldSkipRootJson(relPath)) continue;
        results.push(relPath);
      }
    }
  };

  walk(projectDir);
  return results;
};

const getCacheControl = (relativePath) => {
  if (relativePath === 'index.html') {
    return 'public, max-age=300';
  }
  if (relativePath.startsWith('thumbnail.')) {
    return 'public, max-age=86400';
  }
  return 'public, max-age=31536000, immutable';
};

const preprocessTextAsset = (relativePath, content, assetBaseUrl) => {
  if (relativePath === 'index.html') {
    return injectPublicGameHtml(content, assetBaseUrl);
  }
  return rewriteUserAssets(content, assetBaseUrl);
};

const uploadProjectToR2 = async ({ projectId, publicId, userId }) => {
  if (!isR2Enabled()) {
    throw new Error('R2 is not configured');
  }

  if (config.USE_MODAL) {
    await userManager.syncFromModal(userId, projectId);
  }

  const projectDir = getProjectPath(userId, projectId);
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory not found: ${projectDir}`);
  }

  const assetBaseUrl = getAssetBaseUrl();
  const files = walkProjectFiles(projectDir);

  for (const relPath of files) {
    const absPath = path.join(projectDir, relPath);
    const ext = path.extname(relPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const cacheControl = getCacheControl(relPath);
    const key = `g/${publicId}/${relPath.split(path.sep).join('/')}`;

    if (TEXT_EXTENSIONS.has(ext)) {
      const rawContent = fs.readFileSync(absPath, 'utf-8');
      const processed = preprocessTextAsset(relPath, rawContent, assetBaseUrl);
      await putObject({
        key,
        body: processed,
        contentType,
        cacheControl
      });
    } else {
      const stream = fs.createReadStream(absPath);
      await putObject({
        key,
        body: stream,
        contentType,
        cacheControl
      });
    }
  }

  // Determine thumbnail URL
  const thumbnailWebp = path.join(projectDir, 'thumbnail.webp');
  const thumbnailPng = path.join(projectDir, 'thumbnail.png');
  let thumbnailUrl = null;

  if (fs.existsSync(thumbnailWebp)) {
    thumbnailUrl = getPublicUrl(`g/${publicId}/thumbnail.webp`);
  } else if (fs.existsSync(thumbnailPng)) {
    thumbnailUrl = getPublicUrl(`g/${publicId}/thumbnail.png`);
  }

  return {
    publicId,
    uploadedCount: files.length,
    thumbnailUrl,
    assetBaseUrl
  };
};

/**
 * Ensure thumbnail exists on R2 for a published game.
 * If not present, sync from Modal (if enabled) and upload.
 * Returns the R2 public URL or null if no thumbnail available.
 */
const ensureThumbnailOnR2 = async ({ projectId, publicId, userId }) => {
  if (!isR2Enabled()) {
    return null;
  }

  // Check both possible extensions
  const webpKey = `g/${publicId}/thumbnail.webp`;
  const pngKey = `g/${publicId}/thumbnail.png`;

  // Check if already exists on R2
  if (await objectExists(webpKey)) {
    return getPublicUrl(webpKey);
  }
  if (await objectExists(pngKey)) {
    return getPublicUrl(pngKey);
  }

  // Not on R2 - try to upload from local/Modal
  if (config.USE_MODAL) {
    await userManager.syncFromModal(userId, projectId);
  }

  const projectDir = getProjectPath(userId, projectId);
  const webpPath = path.join(projectDir, 'thumbnail.webp');
  const pngPath = path.join(projectDir, 'thumbnail.png');

  let localPath = null;
  let key = null;
  let contentType = null;

  if (fs.existsSync(webpPath)) {
    localPath = webpPath;
    key = webpKey;
    contentType = 'image/webp';
  } else if (fs.existsSync(pngPath)) {
    localPath = pngPath;
    key = pngKey;
    contentType = 'image/png';
  }

  if (!localPath) {
    // No thumbnail available locally
    return null;
  }

  // Upload to R2
  await putObject({
    key,
    body: fs.createReadStream(localPath),
    contentType,
    cacheControl: 'public, max-age=86400'
  });

  return getPublicUrl(key);
};

module.exports = {
  uploadProjectToR2,
  ensureThumbnailOnR2,
  uploadThumbnailToR2: async ({ projectId, publicId, userId }) => {
    if (!isR2Enabled()) {
      throw new Error('R2 is not configured');
    }

    if (config.USE_MODAL) {
      await userManager.syncFromModal(userId, projectId);
    }

    const projectDir = getProjectPath(userId, projectId);
    const webpPath = path.join(projectDir, 'thumbnail.webp');
    const pngPath = path.join(projectDir, 'thumbnail.png');

    let localPath = null;
    let key = null;
    let contentType = null;

    if (fs.existsSync(webpPath)) {
      localPath = webpPath;
      key = `g/${publicId}/thumbnail.webp`;
      contentType = 'image/webp';
    } else if (fs.existsSync(pngPath)) {
      localPath = pngPath;
      key = `g/${publicId}/thumbnail.png`;
      contentType = 'image/png';
    }

    if (!localPath) {
      return { thumbnailUrl: null };
    }

    await putObject({
      key,
      body: fs.createReadStream(localPath),
      contentType,
      cacheControl: 'public, max-age=86400'
    });

    return { thumbnailUrl: getPublicUrl(key) };
  }
};
