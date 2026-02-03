/**
 * cli.dreamcore.gg Cloudflare Worker
 *
 * Supabase Storage から UGC を配信するプロキシ
 *
 * URL マッピング:
 *   cli.dreamcore.gg/{public_id}/*
 *   → https://dgusszutzzoeadmpyira.supabase.co/storage/v1/object/public/games/{public_id}/*
 */

const SUPABASE_STORAGE_URL = 'https://dgusszutzzoeadmpyira.supabase.co/storage/v1/object/public/games';

// public_id の形式: g_ + 10文字の英数字
const PUBLIC_ID_REGEX = /^\/g_[A-Za-z0-9]{10}(\/|$)/;

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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ルートへのアクセスはリダイレクト
    if (pathname === '/' || pathname === '') {
      return Response.redirect('https://v2.dreamcore.gg', 302);
    }

    // public_id 形式の検証
    if (!PUBLIC_ID_REGEX.test(pathname)) {
      return new Response('Not Found', { status: 404 });
    }

    // パストラバーサル防止
    if (pathname.includes('..')) {
      return new Response('Bad Request', { status: 400 });
    }

    // デフォルトで index.html を追加
    let storagePath = pathname;
    if (storagePath.endsWith('/')) {
      storagePath += 'index.html';
    }

    // Supabase Storage にプロキシ
    const storageUrl = SUPABASE_STORAGE_URL + storagePath;

    const response = await fetch(storageUrl, {
      method: request.method,
      headers: {
        'User-Agent': 'cli.dreamcore.gg Worker',
      },
    });

    // レスポンスヘッダーを調整
    const headers = new Headers(response.headers);

    // Supabase Storage の厳格な CSP を削除（UGC 実行に必要）
    // Supabase は `default-src 'none'; sandbox` を返すが、これはゲーム実行をブロックする
    headers.delete('Content-Security-Policy');
    headers.delete('Content-Security-Policy-Report-Only');

    // 拡張子から Content-Type を設定（Supabase が text/plain を返すことがあるため）
    const ext = storagePath.substring(storagePath.lastIndexOf('.')).toLowerCase();
    const correctContentType = CONTENT_TYPES[ext];
    if (correctContentType) {
      headers.set('Content-Type', correctContentType);
    }

    // セキュリティヘッダー
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // キャッシュ設定
    const contentType = headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      // HTML は短めのキャッシュ（更新頻度が高い）
      headers.set('Cache-Control', 'public, max-age=300'); // 5分
    } else {
      // 静的アセットは長めのキャッシュ
      headers.set('Cache-Control', 'public, max-age=86400'); // 24時間
    }

    // CORS（必要に応じて）
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
