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
