/**
 * Asset Publisher - Upload user/global assets to R2 CDN
 *
 * Key structure:
 * - user-assets/{userId}/{alias}
 * - global-assets/{category}/{alias}
 *
 * Cache-Control: public, max-age=86400 (1 day)
 * User assets may be replaced, so no immutable.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { putObject, getPublicUrl, isR2Enabled, objectExists } = require('./r2Client');

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json'
};

const CACHE_CONTROL = 'public, max-age=86400';

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
};

/**
 * Upload a user asset to R2
 * @param {string} userId - User ID (UUID)
 * @param {string} alias - Asset alias (filename)
 * @param {string} storagePath - Local file path
 * @returns {string} CDN public URL
 */
const uploadUserAssetToR2 = async (userId, alias, storagePath) => {
  if (!isR2Enabled()) {
    throw new Error('R2 is not configured');
  }

  const key = `user-assets/${userId}/${alias}`;
  const contentType = getContentType(storagePath);

  await putObject({
    key,
    body: fs.createReadStream(storagePath),
    contentType,
    cacheControl: CACHE_CONTROL
  });

  return getPublicUrl(key);
};

/**
 * Upload a global asset to R2
 * @param {string} category - Asset category
 * @param {string} alias - Asset alias (filename)
 * @param {string} storagePath - Local file path
 * @returns {string} CDN public URL
 */
const uploadGlobalAssetToR2 = async (category, alias, storagePath) => {
  if (!isR2Enabled()) {
    throw new Error('R2 is not configured');
  }

  const key = `global-assets/${category}/${alias}`;
  const contentType = getContentType(storagePath);

  await putObject({
    key,
    body: fs.createReadStream(storagePath),
    contentType,
    cacheControl: CACHE_CONTROL
  });

  return getPublicUrl(key);
};

/**
 * Ensure user asset exists on R2, upload if not present
 * @param {string} userId - User ID
 * @param {string} alias - Asset alias
 * @param {string} storagePath - Local file path
 * @returns {string|null} CDN public URL, or null if upload failed
 */
const ensureUserAssetOnR2 = async (userId, alias, storagePath) => {
  if (!isR2Enabled()) {
    return null;
  }

  const key = `user-assets/${userId}/${alias}`;

  // Check if already on R2
  if (await objectExists(key)) {
    return getPublicUrl(key);
  }

  // Check if local file exists
  if (!fs.existsSync(storagePath)) {
    console.warn(`[assetPublisher] Local file not found: ${storagePath}`);
    return null;
  }

  // Upload to R2
  try {
    const contentType = getContentType(storagePath);
    await putObject({
      key,
      body: fs.createReadStream(storagePath),
      contentType,
      cacheControl: CACHE_CONTROL
    });
    console.log(`[assetPublisher] Uploaded user asset: ${key}`);
    return getPublicUrl(key);
  } catch (err) {
    console.error(`[assetPublisher] Upload failed for ${key}:`, err.message);
    return null;
  }
};

/**
 * Ensure global asset exists on R2, upload if not present
 * @param {string} category - Asset category
 * @param {string} alias - Asset alias
 * @param {string} storagePath - Local file path
 * @returns {string|null} CDN public URL, or null if upload failed
 */
const ensureGlobalAssetOnR2 = async (category, alias, storagePath) => {
  if (!isR2Enabled()) {
    return null;
  }

  const key = `global-assets/${category}/${alias}`;

  // Check if already on R2
  if (await objectExists(key)) {
    return getPublicUrl(key);
  }

  // Check if local file exists
  if (!fs.existsSync(storagePath)) {
    console.warn(`[assetPublisher] Local file not found: ${storagePath}`);
    return null;
  }

  // Upload to R2
  try {
    const contentType = getContentType(storagePath);
    await putObject({
      key,
      body: fs.createReadStream(storagePath),
      contentType,
      cacheControl: CACHE_CONTROL
    });
    console.log(`[assetPublisher] Uploaded global asset: ${key}`);
    return getPublicUrl(key);
  } catch (err) {
    console.error(`[assetPublisher] Upload failed for ${key}:`, err.message);
    return null;
  }
};

/**
 * Get CDN URL for a user asset (without checking existence)
 * @param {string} userId - User ID
 * @param {string} alias - Asset alias
 * @returns {string} CDN public URL
 */
const getUserAssetCdnUrl = (userId, alias) => {
  return getPublicUrl(`user-assets/${userId}/${alias}`);
};

/**
 * Get CDN URL for a global asset (without checking existence)
 * @param {string} category - Asset category
 * @param {string} alias - Asset alias
 * @returns {string} CDN public URL
 */
const getGlobalAssetCdnUrl = (category, alias) => {
  return getPublicUrl(`global-assets/${category}/${alias}`);
};

module.exports = {
  uploadUserAssetToR2,
  uploadGlobalAssetToR2,
  ensureUserAssetOnR2,
  ensureGlobalAssetOnR2,
  getUserAssetCdnUrl,
  getGlobalAssetCdnUrl,
  getContentType
};
