/**
 * Profile Service
 *
 * Business logic for user profile operations.
 * Handles avatar image processing and R2 upload.
 */

const sharp = require('sharp');
const fs = require('fs');
const r2Client = require('../../r2Client');

// CDN base URL - configurable via environment variable
const CDN_BASE = process.env.CDN_BASE_URL || 'https://cdn.dreamcore.gg';

// UUID format validation (prevents path injection)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Process and upload avatar image
 * - Validates pixel dimensions (max 4096x4096)
 * - Resizes to 256x256 WebP
 * - Uploads to R2
 * - Always cleans up temp file
 *
 * @param {string} filePath - Path to temporary uploaded file
 * @param {string} userId - User ID for R2 key
 * @returns {Promise<string>} CDN URL of uploaded avatar
 * @throws {Error} If image too large or processing fails
 */
async function processAvatar(filePath, userId) {
  // Validate userId format (path injection prevention)
  if (!userId || !UUID_REGEX.test(userId)) {
    throw new Error('Invalid userId format');
  }

  try {
    // Validate pixel dimensions
    const metadata = await sharp(filePath).metadata();
    if (metadata.width > 4096 || metadata.height > 4096) {
      throw new Error('画像が大きすぎます（最大 4096x4096）');
    }

    // Convert to 256x256 WebP
    const webpBuffer = await sharp(filePath)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    // Upload to R2
    const r2Key = `avatars/${userId}/avatar.webp`;
    await r2Client.putObject({
      key: r2Key,
      body: webpBuffer,
      contentType: 'image/webp',
      cacheControl: 'public, max-age=86400'
    });

    return r2Client.getPublicUrl(r2Key);
  } finally {
    // Always clean up temp file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = {
  processAvatar,
  CDN_BASE
};
