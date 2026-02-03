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
 * @returns {object|null} ゲーム情報（Play の published_games と同じ形式）
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
        title,
        description,
        how_to_play,
        thumbnail_url,
        tags,
        visibility,
        allow_remix,
        play_count,
        like_count,
        published_at,
        updated_at,
        cli_projects (
          id,
          name,
          user_id,
          game_type
        )
      `)
      .eq('public_id', publicId)
      .single();

    if (error || !data) return null;

    // Play の published_games と同じ形式で返す
    return {
      id: data.id,
      public_id: data.public_id,
      project_id: data.cli_projects?.id,
      user_id: data.cli_projects?.user_id,
      title: data.title || data.cli_projects?.name || 'Untitled',
      description: data.description,
      how_to_play: data.how_to_play,
      thumbnail_url: data.thumbnail_url,
      tags: data.tags || [],
      visibility: data.visibility || 'public',
      allow_remix: data.allow_remix,
      play_count: data.play_count || 0,
      like_count: data.like_count || 0,
      published_at: data.published_at,
      updated_at: data.updated_at,
      game_type: data.cli_projects?.game_type || '2d',
      // CLI ゲームを識別するフラグとドメイン
      is_cli_game: true,
      play_domain: process.env.CLI_GAMES_DOMAIN || 'cli.dreamcore.gg'
    };
  } catch (err) {
    console.error('[CLI] getCliPublishedGame error:', err);
    return null;
  }
}

/**
 * ユーザーのCLI公開ゲーム一覧を取得
 * @param {string} userId - ユーザーID (UUID)
 * @returns {array} ゲーム一覧（Play の published_games と同じ形式）
 */
async function getCliPublishedGamesByUserId(userId) {
  if (!isCliDeployEnabled()) return [];

  try {
    const supabase = getSupabaseCli();
    const { data, error } = await supabase
      .from('cli_published_games')
      .select(`
        id,
        public_id,
        url,
        title,
        description,
        how_to_play,
        thumbnail_url,
        tags,
        visibility,
        allow_remix,
        play_count,
        like_count,
        published_at,
        updated_at,
        cli_projects (
          id,
          name,
          user_id,
          game_type
        )
      `)
      .eq('user_id', userId)
      .order('published_at', { ascending: false });

    if (error) {
      console.error('[CLI] getCliPublishedGamesByUserId error:', error);
      return [];
    }

    // Play の published_games と同じ形式で返す
    return (data || []).map(game => ({
      id: game.id,
      public_id: game.public_id,
      project_id: game.cli_projects?.id,
      user_id: game.cli_projects?.user_id,
      title: game.title || game.cli_projects?.name || 'Untitled',
      description: game.description,
      how_to_play: game.how_to_play,
      thumbnail_url: game.thumbnail_url,
      tags: game.tags || [],
      visibility: game.visibility || 'public',
      allow_remix: game.allow_remix,
      play_count: game.play_count || 0,
      like_count: game.like_count || 0,
      published_at: game.published_at,
      updated_at: game.updated_at,
      game_type: game.cli_projects?.game_type || '2d',
      // CLI ゲームを識別するフラグとドメイン
      is_cli_game: true,
      play_domain: process.env.CLI_GAMES_DOMAIN || 'cli.dreamcore.gg'
    }));
  } catch (err) {
    console.error('[CLI] getCliPublishedGamesByUserId error:', err);
    return [];
  }
}

/**
 * CLI公開ゲームのプレイカウントをインクリメント
 * @param {string} gameId - ゲームID (UUID)
 * @returns {boolean} 成功/失敗
 */
async function incrementCliPlayCount(gameId) {
  if (!isCliDeployEnabled()) return false;

  try {
    const supabase = getSupabaseCli();

    // Get current play count
    const { data: game } = await supabase
      .from('cli_published_games')
      .select('play_count')
      .eq('id', gameId)
      .single();

    if (game) {
      await supabase
        .from('cli_published_games')
        .update({ play_count: (game.play_count || 0) + 1 })
        .eq('id', gameId);
    }
    return true;
  } catch (err) {
    console.error('[CLI] incrementCliPlayCount error:', err);
    return false;
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
  getCliPublishedGame,
  getCliPublishedGamesByUserId,
  incrementCliPlayCount
};
