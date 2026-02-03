/**
 * cli.dreamcore.gg Cloudflare Worker
 *
 * Supabase Storage から UGC を配信するプロキシ
 * Play と同じ構造: users/{user_id}/projects/{public_id}/
 *
 * URL マッピング:
 *   cli.dreamcore.gg/g/{public_id}/*
 *   → DB lookup で user_id 取得
 *   → https://dgusszutzzoeadmpyira.supabase.co/storage/v1/object/public/games/users/{user_id}/projects/{public_id}/*
 */

// URL 形式: /g/{public_id}/ （play.dreamcore.gg と同じ構造）
// public_id の形式: g_ + 10文字の英数字
const PUBLIC_ID_REGEX = /^\/g\/(g_[A-Za-z0-9]{10})(\/|$)/;

// 拡張子 → Content-Type マッピング
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

// user_id キャッシュ（Worker インスタンス内、最大1000件）
const userIdCache = new Map();
const CACHE_MAX_SIZE = 1000;
const CACHE_TTL = 3600000; // 1時間

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ルートへのアクセスはリダイレクト
    if (pathname === '/' || pathname === '') {
      return Response.redirect('https://v2.dreamcore.gg', 302);
    }

    // public_id 形式の検証と抽出
    const match = pathname.match(PUBLIC_ID_REGEX);
    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    const publicId = match[1]; // g_xxxxxxxxxx
    const subPath = pathname.slice(`/g/${publicId}`.length) || '/';

    // パストラバーサル防止
    if (subPath.includes('..')) {
      return new Response('Bad Request', { status: 400 });
    }

    // user_id を取得（キャッシュ or DB）
    const userId = await getUserId(publicId, env);
    if (!userId) {
      return new Response('Game not found', { status: 404 });
    }

    // ファイルパスを構築
    let filePath = subPath;
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    // Storage パス: users/{user_id}/projects/{public_id}/{file}
    const storagePath = `users/${userId}/projects/${publicId}${filePath}`;
    const storageUrl = `${env.SUPABASE_STORAGE_URL}/${storagePath}`;

    const response = await fetch(storageUrl, {
      method: request.method,
      headers: {
        'User-Agent': 'cli.dreamcore.gg Worker',
      },
    });

    // レスポンスヘッダーを調整
    const headers = new Headers(response.headers);

    // Supabase Storage の厳格な CSP を削除（UGC 実行に必要）
    headers.delete('Content-Security-Policy');
    headers.delete('Content-Security-Policy-Report-Only');

    // 拡張子から Content-Type を設定
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const correctContentType = CONTENT_TYPES[ext];
    if (correctContentType) {
      headers.set('Content-Type', correctContentType);
    }

    // セキュリティヘッダー
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.delete('X-Frame-Options');
    headers.set('Content-Security-Policy', "frame-ancestors 'self' https://v2.dreamcore.gg https://dreamcore.gg");
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // キャッシュ設定
    const contentType = headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      headers.set('Cache-Control', 'public, max-age=300'); // 5分
    } else {
      headers.set('Cache-Control', 'public, max-age=86400'); // 24時間
    }

    // CORS
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

/**
 * public_id から user_id を取得（キャッシュ付き）
 */
async function getUserId(publicId, env) {
  // キャッシュチェック
  const cached = userIdCache.get(publicId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.userId;
  }

  // Supabase REST API で cli_projects を検索
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/cli_projects?public_id=eq.${publicId}&select=user_id`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!response.ok) {
      console.error('DB lookup failed:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      return null;
    }

    const userId = data[0].user_id;

    // キャッシュに保存（サイズ制限）
    if (userIdCache.size >= CACHE_MAX_SIZE) {
      // 古いエントリを削除
      const firstKey = userIdCache.keys().next().value;
      userIdCache.delete(firstKey);
    }
    userIdCache.set(publicId, { userId, timestamp: Date.now() });

    return userId;
  } catch (err) {
    console.error('getUserId error:', err);
    return null;
  }
}
