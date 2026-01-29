/**
 * ウェイトリスト/アクセス管理モジュール
 *
 * V2 初期リリース用。承認されたユーザーのみアプリ利用可能。
 *
 * 無効化方法: index.js で waitlist 関連の行をコメントアウト
 * 完全削除: このファイルと public/waitlist.html を削除
 *
 * ドキュメント: docs/WAITLIST.md
 */

const { supabaseAdmin } = require('./supabaseClient');

/**
 * ユーザーのアクセス権を確認
 * @param {string} email - ユーザーのメールアドレス
 * @returns {Promise<{allowed: boolean, status: string|null}>}
 */
async function checkUserAccess(email) {
  if (!email) {
    return { allowed: false, status: null };
  }

  const { data, error } = await supabaseAdmin
    .from('user_access')
    .select('status')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !data) {
    // テーブルに存在しない = 未登録
    return { allowed: false, status: null };
  }

  return {
    allowed: data.status === 'approved',
    status: data.status
  };
}

/**
 * ウェイトリストに登録
 * @param {object} userInfo - ユーザー情報
 * @param {string} userInfo.email - メールアドレス
 * @param {string} userInfo.displayName - 表示名
 * @param {string} userInfo.avatarUrl - アバターURL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function registerToWaitlist(userInfo) {
  const { email, displayName, avatarUrl } = userInfo;

  if (!email) {
    return { success: false, error: 'Email is required' };
  }

  const { error } = await supabaseAdmin
    .from('user_access')
    .upsert({
      email: email.toLowerCase(),
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      status: 'pending',
      requested_at: new Date().toISOString()
    }, {
      onConflict: 'email',
      ignoreDuplicates: true  // 既に存在する場合は更新しない
    });

  if (error) {
    console.error('[Waitlist] Registration error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Express ルーターをセットアップ
 * @param {Express} app - Express アプリ
 */
function setupRoutes(app) {
  /**
   * GET /api/check-access
   * ユーザーのアクセス権を確認
   *
   * Headers: Authorization: Bearer <access_token>
   * Response: { allowed: boolean, status: 'pending'|'approved'|null }
   */
  app.get('/api/check-access', async (req, res) => {
    console.log('[Waitlist] /api/check-access called');

    // Authorization ヘッダーからトークンを取得
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[Waitlist] No auth header');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    try {
      // トークンからユーザー情報を取得
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        console.log('[Waitlist] Invalid token:', error?.message);
        return res.status(401).json({ error: 'Invalid token' });
      }

      console.log('[Waitlist] User:', user.email);
      const result = await checkUserAccess(user.email);
      console.log('[Waitlist] Result:', result);
      res.json(result);
    } catch (err) {
      console.error('[Waitlist] Check access error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/waitlist/register
   * ウェイトリストに登録
   *
   * Headers: Authorization: Bearer <access_token>
   * Response: { success: boolean, error?: string }
   */
  app.post('/api/waitlist/register', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const result = await registerToWaitlist({
        email: user.email,
        displayName: user.user_metadata?.full_name || user.user_metadata?.name,
        avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture
      });

      res.json(result);
    } catch (err) {
      console.error('[Waitlist] Register error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = {
  checkUserAccess,
  registerToWaitlist,
  setupRoutes
};
