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
const { isCliDeployEnabled } = require('./supabase');
const { authenticateToken } = require('./tokenManager');
const { createDeviceCode, authorizeUserCode, pollForToken } = require('./deviceAuth');

module.exports = {
  router,
  isCliDeployEnabled,

  // トークン管理
  authenticateToken,

  // デバイスフロー
  createDeviceCode,
  authorizeUserCode,
  pollForToken
};
