/**
 * Supabase B クライアント（CLI Deploy専用）
 *
 * 注意: これは DreamCore 本体の Supabase A とは別プロジェクト
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase B（CLI Deploy専用）
const supabaseCliUrl = process.env.SUPABASE_CLI_URL;
const supabaseCliServiceRoleKey = process.env.SUPABASE_CLI_SERVICE_ROLE_KEY;

// Supabase A（認証検証用 - DreamCore本体と共有）
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseCli = null;
let supabaseAuth = null;

/**
 * Supabase B クライアントを取得（CLI テーブル操作用）
 */
function getSupabaseCli() {
  if (!supabaseCli) {
    if (!supabaseCliUrl || !supabaseCliServiceRoleKey) {
      throw new Error('SUPABASE_CLI_URL and SUPABASE_CLI_SERVICE_ROLE_KEY are required');
    }
    supabaseCli = createClient(supabaseCliUrl, supabaseCliServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseCli;
}

/**
 * Supabase A クライアントを取得（認証検証用）
 * auth.getUser() でトークン検証に使用
 */
function getSupabaseAuth() {
  if (!supabaseAuth) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for auth verification');
    }
    supabaseAuth = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseAuth;
}

/**
 * Supabase A のトークンを検証して user_id を取得
 */
async function verifySupabaseToken(token) {
  const supabase = getSupabaseAuth();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

/**
 * CLI Deploy が利用可能かチェック
 */
function isCliDeployEnabled() {
  return !!(supabaseCliUrl && supabaseCliServiceRoleKey);
}

module.exports = {
  getSupabaseCli,
  getSupabaseAuth,
  verifySupabaseToken,
  isCliDeployEnabled
};
