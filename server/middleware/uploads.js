/**
 * Multer upload configuration
 *
 * Shared between:
 * - Asset uploads (/api/assets/upload)
 * - Thumbnail uploads (/api/projects/:projectId/upload-thumbnail)
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Temporary upload directory (files are moved to user-specific directories after processing)
const UPLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'uploads_temp');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// Allowed types for general asset uploads
const allowedTypes = /jpeg|jpg|png|gif|webp|svg|mp3|wav|ogg|json/;

const fileFilter = (req, file, cb) => {
  const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mime = allowedTypes.test(file.mimetype.split('/')[1]);
  // 拡張子とMIMEタイプの両方が一致する場合のみ許可（偽装防止）
  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

// Default upload (1MB limit, all allowed types)
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  fileFilter
});

// Thumbnail upload (5MB limit, images only)
const thumbnailFileFilter = (req, file, cb) => {
  const imageTypes = /jpeg|jpg|png|webp/;
  const ext = imageTypes.test(path.extname(file.originalname).toLowerCase());
  const mime = imageTypes.test(file.mimetype.split('/')[1]);
  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error('Invalid image type'));
  }
};

const thumbnailUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: thumbnailFileFilter
});

module.exports = upload;
module.exports.thumbnail = thumbnailUpload;
module.exports.UPLOAD_TEMP_DIR = UPLOAD_TEMP_DIR;
