/**
 * アップロード処理・検証
 *
 * セキュリティ要件:
 * - index.html 必須
 * - Zip Slip 防止
 * - 拡張子制限
 * - ファイルサイズ制限
 */

const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { getSupabaseCli } = require('./supabase');

// 許可する拡張子
const ALLOWED_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp3', '.ogg', '.wav', '.m4a',
  '.woff', '.woff2', '.ttf', '.eot',
  '.txt', '.md', '.xml',
  '.glb', '.gltf', '.bin', '.obj', '.mtl'
]);

// 最大ファイルサイズ（50MB）
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// 最大合計サイズ（100MB）
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

// 最大ファイル数
const MAX_FILE_COUNT = 500;

// 禁止ディレクトリ（これらで始まるパスは拒否）
const FORBIDDEN_DIRECTORIES = [
  'node_modules/',
  '.git/',
  '.svn/',
  '.hg/',
  '__pycache__/',
  '.vscode/',
  '.idea/',
  '.DS_Store'
];

// public_id 形式: g_ + 10文字の英数字
const PUBLIC_ID_REGEX = /^g_[A-Za-z0-9]{10}$/;

/**
 * public_id を検証
 */
function isValidPublicId(id) {
  return PUBLIC_ID_REGEX.test(id) && !id.includes('..');
}

/**
 * public_id を生成
 */
function generatePublicId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'g_';
  for (let i = 0; i < 10; i++) {
    id += chars[crypto.randomInt(chars.length)];
  }
  return id;
}

/**
 * ファイルパスを検証（Zip Slip 防止）
 */
function isPathSafe(filePath, baseDir = '') {
  // 正規化してから検証
  const normalized = path.normalize(filePath);

  // 絶対パスチェック
  if (path.isAbsolute(normalized)) {
    return false;
  }

  // 親ディレクトリへの参照チェック
  if (normalized.startsWith('..') || normalized.includes('/..') || normalized.includes('\\..')) {
    return false;
  }

  // ベースディレクトリが指定されている場合、その中に収まっているか確認
  if (baseDir) {
    const fullPath = path.join(baseDir, normalized);
    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(fullPath);

    if (!resolvedPath.startsWith(resolvedBase)) {
      return false;
    }
  }

  return true;
}

/**
 * 拡張子を検証
 */
function isAllowedExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * 禁止ディレクトリかチェック
 */
function isForbiddenPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const forbidden of FORBIDDEN_DIRECTORIES) {
    if (normalized.startsWith(forbidden) || normalized.includes('/' + forbidden)) {
      return true;
    }
  }
  // ファイル名自体が禁止されている場合（.DS_Store など）
  const fileName = path.basename(filePath);
  return FORBIDDEN_DIRECTORIES.includes(fileName);
}

/**
 * シンボリックリンクかチェック（ZIP エントリ）
 */
function isSymbolicLink(entry) {
  // Unix シンボリックリンクは attr の上位ビットで判定
  // 0xA0000000 = シンボリックリンク
  const attr = entry.header.attr;
  if (attr) {
    const unixMode = (attr >>> 16) & 0xFFFF;
    // S_IFLNK = 0xA000 (シンボリックリンク)
    return (unixMode & 0xF000) === 0xA000;
  }
  return false;
}

/**
 * ZIP ファイルを検証
 */
function validateZip(zipBuffer) {
  const errors = [];
  const files = [];
  let totalSize = 0;
  let hasIndexHtml = false;
  let fileCount = 0;

  try {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // ファイル数の事前チェック（メモリ保護）
    const fileEntries = entries.filter(e => !e.isDirectory);
    if (fileEntries.length > MAX_FILE_COUNT) {
      errors.push(`Too many files: ${fileEntries.length} > ${MAX_FILE_COUNT}`);
      return { valid: false, errors, files: [], totalSize: 0 };
    }

    for (const entry of entries) {
      // ディレクトリはスキップ
      if (entry.isDirectory) continue;

      const filePath = entry.entryName;
      const fileSize = entry.header.size;
      fileCount++;

      // シンボリックリンクチェック
      if (isSymbolicLink(entry)) {
        errors.push(`Symbolic links not allowed: ${filePath}`);
        continue;
      }

      // パス安全性チェック
      if (!isPathSafe(filePath)) {
        errors.push(`Unsafe path detected: ${filePath}`);
        continue;
      }

      // 禁止ディレクトリチェック
      if (isForbiddenPath(filePath)) {
        errors.push(`Forbidden path: ${filePath}`);
        continue;
      }

      // 拡張子チェック
      if (!isAllowedExtension(filePath)) {
        errors.push(`File type not allowed: ${filePath}`);
        continue;
      }

      // ファイルサイズチェック
      if (fileSize > MAX_FILE_SIZE) {
        errors.push(`File too large: ${filePath} (${Math.round(fileSize / 1024 / 1024)}MB > ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
        continue;
      }

      totalSize += fileSize;

      // index.html チェック
      if (filePath === 'index.html' || filePath.endsWith('/index.html')) {
        if (filePath === 'index.html') {
          hasIndexHtml = true;
        }
      }

      files.push({
        path: filePath,
        size: fileSize,
        content: entry.getData()
      });
    }

    // 合計サイズチェック
    if (totalSize > MAX_TOTAL_SIZE) {
      errors.push(`Total size too large: ${Math.round(totalSize / 1024 / 1024)}MB > ${MAX_TOTAL_SIZE / 1024 / 1024}MB`);
    }

    // index.html 必須チェック
    if (!hasIndexHtml) {
      errors.push('index.html is required at the root of the archive');
    }

  } catch (err) {
    errors.push(`Invalid ZIP file: ${err.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    files,
    totalSize
  };
}

/**
 * dreamcore.json を解析
 */
function parseDreamcoreJson(files) {
  const jsonFile = files.find(f => f.path === 'dreamcore.json');
  if (!jsonFile) {
    return null;
  }

  try {
    const content = jsonFile.content.toString('utf-8');
    const json = JSON.parse(content);

    // 必須フィールドの検証
    if (!json.title || typeof json.title !== 'string') {
      return { error: 'title is required in dreamcore.json' };
    }

    // id があれば検証
    if (json.id && !isValidPublicId(json.id)) {
      return { error: 'Invalid id format in dreamcore.json (expected: g_XXXXXXXXXX)' };
    }

    return {
      id: json.id || null,
      title: json.title,
      description: json.description || null
    };
  } catch (err) {
    return { error: `Invalid dreamcore.json: ${err.message}` };
  }
}

/**
 * ファイルを Storage にアップロード
 */
async function uploadToStorage(publicId, files) {
  const supabase = getSupabaseCli();
  const results = [];

  for (const file of files) {
    const storagePath = `${publicId}/${file.path}`;

    // Content-Type を推定
    const ext = path.extname(file.path).toLowerCase();
    const contentType = getContentType(ext);

    const { error } = await supabase.storage
      .from('games')
      .upload(storagePath, file.content, {
        contentType,
        upsert: true
      });

    if (error) {
      results.push({ path: file.path, success: false, error: error.message });
    } else {
      results.push({ path: file.path, success: true });
    }
  }

  return results;
}

/**
 * Storage から既存ファイルを再帰的に削除
 */
async function deleteFromStorage(publicId) {
  const supabase = getSupabaseCli();
  const allFiles = [];

  // 再帰的にファイルを列挙
  async function listRecursive(prefix) {
    const { data: items, error } = await supabase.storage
      .from('games')
      .list(prefix, { limit: 1000 });

    if (error || !items) return;

    for (const item of items) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.id === null) {
        // ディレクトリ（id が null）の場合は再帰
        await listRecursive(itemPath);
      } else {
        // ファイルの場合はリストに追加
        allFiles.push(itemPath);
      }
    }
  }

  await listRecursive(publicId);

  if (allFiles.length === 0) {
    return true; // 何もなければ成功扱い
  }

  // Supabase Storage は一度に最大 1000 ファイル削除可能
  // バッチで削除
  const batchSize = 100;
  for (let i = 0; i < allFiles.length; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize);
    const { error: deleteError } = await supabase.storage
      .from('games')
      .remove(batch);

    if (deleteError) {
      console.error('Failed to delete batch:', deleteError);
      return false;
    }
  }

  return true;
}

/**
 * 拡張子から Content-Type を取得
 */
function getContentType(ext) {
  const types = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.xml': 'application/xml',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.obj': 'text/plain',
    '.mtl': 'text/plain'
  };

  return types[ext] || 'application/octet-stream';
}

module.exports = {
  isValidPublicId,
  generatePublicId,
  isPathSafe,
  isAllowedExtension,
  isForbiddenPath,
  isSymbolicLink,
  validateZip,
  parseDreamcoreJson,
  uploadToStorage,
  deleteFromStorage,
  ALLOWED_EXTENSIONS,
  FORBIDDEN_DIRECTORIES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FILE_COUNT,
  PUBLIC_ID_REGEX
};
