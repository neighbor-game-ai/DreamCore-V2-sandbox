/**
 * CLI トークン管理
 *
 * 2段階ハッシュ方式:
 * - token_lookup: HMAC-SHA256（検索用、pepper使用）
 * - token_verify: bcrypt（検証用）
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getSupabaseCli } = require('./supabase');

const TOKEN_PREFIX = 'dc_';
const BCRYPT_ROUNDS = 10;

/**
 * TOKEN_PEPPER を取得
 */
function getPepper() {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('TOKEN_PEPPER must be at least 32 characters');
  }
  return pepper;
}

/**
 * ランダムトークンを生成
 * 形式: dc_[32文字のbase62]
 */
function generateToken() {
  const randomBytes = crypto.randomBytes(24);
  const base62 = randomBytes.toString('base64url').replace(/[-_]/g, '').slice(0, 32);
  return `${TOKEN_PREFIX}${base62}`;
}

/**
 * トークンから lookup hash を生成（HMAC-SHA256）
 */
function createLookupHash(token) {
  const pepper = getPepper();
  return crypto.createHmac('sha256', pepper).update(token).digest('hex');
}

/**
 * トークンから verify hash を生成（bcrypt）
 */
async function createVerifyHash(token) {
  return bcrypt.hash(token, BCRYPT_ROUNDS);
}

/**
 * トークンを検証
 */
async function verifyToken(token, verifyHash) {
  return bcrypt.compare(token, verifyHash);
}

/**
 * 新しいトークンを作成してDBに保存
 */
async function createToken(userId, name = null) {
  const supabase = getSupabaseCli();
  const token = generateToken();
  const lookupHash = createLookupHash(token);
  const verifyHash = await createVerifyHash(token);

  const { data, error } = await supabase
    .from('cli_tokens')
    .insert({
      user_id: userId,
      token_lookup: lookupHash,
      token_verify: verifyHash,
      name: name
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create token: ${error.message}`);
  }

  return {
    token,
    tokenId: data.id
  };
}

/**
 * トークンを検証してユーザー情報を取得
 */
async function authenticateToken(token) {
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const supabase = getSupabaseCli();
  const lookupHash = createLookupHash(token);

  // lookup hash で検索
  const { data, error } = await supabase
    .from('cli_tokens')
    .select('id, user_id, token_verify, revoked_at')
    .eq('token_lookup', lookupHash)
    .single();

  if (error || !data) {
    return null;
  }

  // 失効チェック
  if (data.revoked_at) {
    return null;
  }

  // bcrypt で検証
  const isValid = await verifyToken(token, data.token_verify);
  if (!isValid) {
    return null;
  }

  // last_used_at を更新
  await supabase
    .from('cli_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    tokenId: data.id,
    userId: data.user_id
  };
}

/**
 * トークンを失効させる
 */
async function revokeToken(tokenId, userId) {
  const supabase = getSupabaseCli();

  const { error } = await supabase
    .from('cli_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('user_id', userId);

  return !error;
}

/**
 * ユーザーの全トークンを取得
 */
async function listTokens(userId) {
  const supabase = getSupabaseCli();

  const { data, error } = await supabase
    .from('cli_tokens')
    .select('id, name, created_at, last_used_at, revoked_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list tokens: ${error.message}`);
  }

  return data;
}

module.exports = {
  generateToken,
  createLookupHash,
  createVerifyHash,
  verifyToken,
  createToken,
  authenticateToken,
  revokeToken,
  listTokens,
  TOKEN_PREFIX
};
