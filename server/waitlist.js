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
 * IPアドレスから国コードを取得
 * @param {string} ip - IPアドレス
 * @returns {Promise<string|null>} 国コード (例: 'JP', 'US')
 */
async function getCountryFromIP(ip) {
  // ローカルIPやプライベートIPはスキップ
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }

  try {
    // ip-api.com (無料、レート制限あり: 45req/min)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    if (response.ok) {
      const data = await response.json();
      return data.countryCode || null;
    }
  } catch (e) {
    console.error('[Waitlist] IP Geolocation error:', e.message);
  }
  return null;
}

/**
 * リクエストからクライアントIPを取得
 * @param {Request} req - Express リクエスト
 * @returns {string|null}
 */
function getClientIP(req) {
  // プロキシ経由の場合
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // Cloudflare
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  // 直接接続
  return req.socket?.remoteAddress || null;
}

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
 * @param {object} userInfo.analytics - 分析用データ
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function registerToWaitlist(userInfo) {
  const { email, displayName, avatarUrl, analytics = {} } = userInfo;

  if (!email) {
    return { success: false, error: 'Email is required' };
  }

  // まず既存レコードを確認
  const { data: existing } = await supabaseAdmin
    .from('user_access')
    .select('status, language')
    .eq('email', email.toLowerCase())
    .single();

  if (existing) {
    // 既存ユーザー: analytics のみ更新（status は変更しない）
    // language が null の場合のみ更新（既存データを上書きしない）
    const updates = {};
    if (!existing.language && analytics.language) updates.language = analytics.language;
    if (analytics.country) updates.country = analytics.country;
    if (analytics.timezone) updates.timezone = analytics.timezone;
    if (analytics.referrer) updates.referrer = analytics.referrer;
    if (analytics.utmSource) updates.utm_source = analytics.utmSource;
    if (analytics.utmCampaign) updates.utm_campaign = analytics.utmCampaign;
    if (analytics.deviceType) updates.device_type = analytics.deviceType;
    if (analytics.screenResolution) updates.screen_resolution = analytics.screenResolution;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('user_access')
        .update(updates)
        .eq('email', email.toLowerCase());

      if (updateError) {
        console.error('[Waitlist] Analytics update error:', updateError.message);
      }
    }
    return { success: true, existing: true };
  }

  // 新規ユーザー: 全データを挿入
  const { error } = await supabaseAdmin
    .from('user_access')
    .insert({
      email: email.toLowerCase(),
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      status: 'pending',
      requested_at: new Date().toISOString(),
      // 分析用データ
      language: analytics.language || null,
      country: analytics.country || null,
      timezone: analytics.timezone || null,
      referrer: analytics.referrer || null,
      utm_source: analytics.utmSource || null,
      utm_campaign: analytics.utmCampaign || null,
      device_type: analytics.deviceType || null,
      screen_resolution: analytics.screenResolution || null
    });

  if (error) {
    console.error('[Waitlist] Registration error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * 招待コードを検証して適用
 * @param {string} code - 招待コード
 * @param {string} userId - ユーザーID
 * @param {string} userEmail - ユーザーのメールアドレス
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function redeemInvitationCode(code, userId, userEmail) {
  if (!code || typeof code !== 'string') {
    return { success: false, error: '招待コードを入力してください' };
  }

  const normalizedCode = code.trim().toUpperCase();

  // 1. コードの有効性チェック
  const { data: invitation, error: fetchError } = await supabaseAdmin
    .from('invitation_codes')
    .select('*')
    .eq('code', normalizedCode)
    .single();

  if (fetchError || !invitation) {
    return { success: false, error: '無効な招待コードです' };
  }

  if (!invitation.is_active) {
    return { success: false, error: 'この招待コードは無効化されています' };
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return { success: false, error: 'この招待コードは期限切れです' };
  }

  // 2. 既に使用済みかチェック
  const { data: existingUse } = await supabaseAdmin
    .from('invitation_code_uses')
    .select('id')
    .eq('code', normalizedCode)
    .eq('user_id', userId)
    .single();

  if (existingUse) {
    return { success: false, error: 'このコードは既に使用済みです' };
  }

  // 3. user_access を approved に更新（または作成）
  const { error: upsertError } = await supabaseAdmin
    .from('user_access')
    .upsert({
      user_id: userId,
      email: userEmail.toLowerCase(),
      status: 'approved',
      approved_at: new Date().toISOString(),
      invitation_code: normalizedCode
    }, {
      onConflict: 'user_id'
    });

  if (upsertError) {
    console.error('[Waitlist] Failed to update user_access:', upsertError);
    return { success: false, error: '承認処理に失敗しました' };
  }

  // 4. 使用履歴を記録
  const { error: useError } = await supabaseAdmin
    .from('invitation_code_uses')
    .insert({
      code: normalizedCode,
      user_id: userId
    });

  if (useError) {
    console.error('[Waitlist] Failed to record invitation use:', useError);
    // 使用履歴の記録失敗は致命的ではないので続行
  }

  console.log(`[Waitlist] Invitation code ${normalizedCode} redeemed by ${userEmail}`);
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
   * Body: { analytics?: { language, country, timezone, referrer, utmSource, utmCampaign, deviceType, screenResolution } }
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

      // リクエストボディから分析データを取得
      const analytics = req.body?.analytics || {};

      // IPアドレスから国を取得（フロントエンドで取得できないため）
      if (!analytics.country) {
        const clientIP = getClientIP(req);
        if (clientIP) {
          analytics.country = await getCountryFromIP(clientIP);
        }
      }

      const result = await registerToWaitlist({
        email: user.email,
        displayName: user.user_metadata?.full_name || user.user_metadata?.name,
        avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        analytics
      });

      res.json(result);
    } catch (err) {
      console.error('[Waitlist] Register error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/invitation/redeem
   * 招待コードを適用してアクセスを承認
   *
   * Headers: Authorization: Bearer <access_token>
   * Body: { code: string }
   * Response: { success: boolean, error?: string }
   */
  app.post('/api/invitation/redeem', async (req, res) => {
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

      const { code } = req.body;
      const result = await redeemInvitationCode(code, user.id, user.email);

      if (result.success) {
        res.json({ success: true, message: 'アクセスが承認されました' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err) {
      console.error('[Waitlist] Invitation redeem error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = {
  checkUserAccess,
  registerToWaitlist,
  redeemInvitationCode,
  setupRoutes
};
