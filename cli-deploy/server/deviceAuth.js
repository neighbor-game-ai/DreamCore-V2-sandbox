/**
 * デバイスフロー認証
 *
 * OAuth 2.0 Device Authorization Grant (RFC 8628) に基づく実装
 */

const crypto = require('crypto');
const { getSupabaseCli } = require('./supabase');
const { createToken } = require('./tokenManager');

const DEVICE_CODE_EXPIRY_MINUTES = 15;
const POLLING_INTERVAL_SECONDS = 5;

/**
 * ユーザーコードを生成（XXXX-XXXX形式）
 * 紛らわしい文字（0, O, I, l）を除外
 */
function generateUserCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

/**
 * デバイスコードを発行
 */
async function createDeviceCode() {
  const supabase = getSupabaseCli();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_MINUTES * 60 * 1000);

  const { data, error } = await supabase
    .from('cli_device_codes')
    .insert({
      user_code: userCode,
      expires_at: expiresAt.toISOString()
    })
    .select('device_code, user_code, expires_at')
    .single();

  if (error) {
    // user_code 重複の場合はリトライ
    if (error.code === '23505') {
      return createDeviceCode();
    }
    throw new Error(`Failed to create device code: ${error.message}`);
  }

  const verificationUri = `${process.env.CLI_AUTH_BASE_URL || 'https://v2.dreamcore.gg'}/cli-auth/auth.html`;

  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?code=${data.user_code}`,
    expires_in: DEVICE_CODE_EXPIRY_MINUTES * 60,
    interval: POLLING_INTERVAL_SECONDS
  };
}

/**
 * ユーザーコードを認可（ブラウザから呼び出し）
 */
async function authorizeUserCode(userCode, userId) {
  const supabase = getSupabaseCli();

  // ユーザーコードを検索
  const { data, error } = await supabase
    .from('cli_device_codes')
    .select('id, status, expires_at')
    .eq('user_code', userCode.toUpperCase())
    .single();

  if (error || !data) {
    return { success: false, error: 'invalid_code', message: 'Invalid or expired code' };
  }

  // 期限切れチェック
  if (new Date(data.expires_at) < new Date()) {
    return { success: false, error: 'expired_code', message: 'Code has expired' };
  }

  // ステータスチェック
  if (data.status !== 'pending') {
    return { success: false, error: 'already_used', message: 'Code has already been used' };
  }

  // 認可を更新
  const { error: updateError } = await supabase
    .from('cli_device_codes')
    .update({
      user_id: userId,
      status: 'authorized'
    })
    .eq('id', data.id);

  if (updateError) {
    return { success: false, error: 'update_failed', message: 'Failed to authorize code' };
  }

  return { success: true };
}

/**
 * デバイスコードでトークンを取得（CLIからのポーリング）
 */
async function pollForToken(deviceCode) {
  const supabase = getSupabaseCli();

  // デバイスコードを検索
  const { data, error } = await supabase
    .from('cli_device_codes')
    .select('id, user_id, status, expires_at')
    .eq('device_code', deviceCode)
    .single();

  if (error || !data) {
    return { error: 'invalid_request', error_description: 'Invalid device code' };
  }

  // 期限切れチェック
  if (new Date(data.expires_at) < new Date()) {
    // ステータスを expired に更新
    await supabase
      .from('cli_device_codes')
      .update({ status: 'expired' })
      .eq('id', data.id);

    return { error: 'expired_token', error_description: 'Device code has expired' };
  }

  // last_polled_at を更新
  await supabase
    .from('cli_device_codes')
    .update({ last_polled_at: new Date().toISOString() })
    .eq('id', data.id);

  // ステータスに応じた応答
  switch (data.status) {
    case 'pending':
      return { error: 'authorization_pending', error_description: 'Waiting for user authorization' };

    case 'authorized':
      // トークンを発行
      const { token } = await createToken(data.user_id, 'CLI Token');

      // status を consumed に更新（ワンタイム）
      await supabase
        .from('cli_device_codes')
        .update({ status: 'consumed' })
        .eq('id', data.id);

      return {
        access_token: token,
        token_type: 'Bearer'
      };

    case 'denied':
      return { error: 'access_denied', error_description: 'User denied authorization' };

    case 'consumed':
      return { error: 'invalid_request', error_description: 'Token has already been issued' };

    default:
      return { error: 'server_error', error_description: 'Unknown status' };
  }
}

/**
 * ユーザーコードを拒否
 */
async function denyUserCode(userCode, userId) {
  const supabase = getSupabaseCli();

  // ユーザーコードを検索
  const { data, error } = await supabase
    .from('cli_device_codes')
    .select('id, status, expires_at')
    .eq('user_code', userCode.toUpperCase())
    .single();

  if (error || !data) {
    return { success: false, error: 'invalid_code', message: 'Invalid or expired code' };
  }

  // 期限切れチェック
  if (new Date(data.expires_at) < new Date()) {
    return { success: false, error: 'expired_code', message: 'Code has expired' };
  }

  // ステータスチェック
  if (data.status !== 'pending') {
    return { success: false, error: 'already_used', message: 'Code has already been used' };
  }

  // 拒否を更新
  const { error: updateError } = await supabase
    .from('cli_device_codes')
    .update({
      user_id: userId,
      status: 'denied'
    })
    .eq('id', data.id);

  if (updateError) {
    return { success: false, error: 'update_failed', message: 'Failed to deny code' };
  }

  return { success: true };
}

module.exports = {
  generateUserCode,
  createDeviceCode,
  authorizeUserCode,
  pollForToken,
  denyUserCode,
  DEVICE_CODE_EXPIRY_MINUTES,
  POLLING_INTERVAL_SECONDS
};
