/**
 * CLI Deploy モジュール
 *
 * DreamCore 本体と完全に分離された CLI デプロイ機能
 *
 * 使用方法（server/index.js に追加）:
 *   if (process.env.SUPABASE_CLI_URL) {
 *     const cliDeploy = require('../cli-deploy/server');
 *     app.use('/api/cli', cliDeploy.router);
 *     app.use('/cli-auth', express.static(path.join(__dirname, '../cli-deploy/public')));
 *   }
 */

const router = require('./routes');
const { isCliDeployEnabled, getSupabaseCli } = require('./supabase');
const { authenticateToken } = require('./tokenManager');
const { createDeviceCode, authorizeUserCode, pollForToken } = require('./deviceAuth');

/**
 * CLI公開ゲームをpublic_idで取得
 * @param {string} publicId - g_XXXXXXXXXX 形式
 * @returns {object|null} ゲーム情報
 */
async function getCliPublishedGame(publicId) {
  if (!isCliDeployEnabled()) return null;

  try {
    const supabase = getSupabaseCli();
    const { data, error } = await supabase
      .from('cli_published_games')
      .select(`
        id,
        public_id,
        url,
        published_at,
        cli_projects (
          id,
          title,
          description,
          user_id
        )
      `)
      .eq('public_id', publicId)
      .single();

    if (error || !data) return null;

    // 通常のpublished_gamesと同じ形式で返す
    return {
      id: data.id,
      public_id: data.public_id,
      title: data.cli_projects?.title || 'Untitled',
      description: data.cli_projects?.description || null,
      user_id: data.cli_projects?.user_id,
      visibility: 'public',  // CLI games are always public
      published_at: data.published_at,
      play_count: 0,  // CLI games don't track play count yet
      // CLI ゲームを識別するフラグとドメイン
      is_cli_game: true,
      play_domain: process.env.CLI_GAMES_DOMAIN || 'cli.dreamcore.gg'
    };
  } catch (err) {
    console.error('[CLI] getCliPublishedGame error:', err);
    return null;
  }
}

module.exports = {
  router,
  isCliDeployEnabled,

  // トークン管理
  authenticateToken,

  // デバイスフロー
  createDeviceCode,
  authorizeUserCode,
  pollForToken,

  // ゲーム取得
  getCliPublishedGame
};
