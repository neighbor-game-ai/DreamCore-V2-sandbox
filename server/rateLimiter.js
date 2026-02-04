/**
 * Rate Limiter モジュール
 *
 * server/index.js から共通化したレート制限ミドルウェア。
 * routes.js など他のモジュールからも利用可能。
 */

const rateLimit = require('express-rate-limit');
const config = require('./config');

/**
 * レート制限ミドルウェアを作成
 * @param {number} windowMs - ウィンドウサイズ（ミリ秒）
 * @param {number} max - 最大リクエスト数
 * @param {string} message - エラーメッセージ
 */
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
  // 認証済みはuserIdで、未認証はIPでレート制限
  keyGenerator: (req) => req.user?.id || req.ip,
  // カスタムkeyGeneratorのバリデーション警告を抑制
  validate: false,
});

// AI系API用（高コスト）: 5 req/min
const aiRateLimiter = createRateLimiter(
  60 * 1000,  // 1分
  5,
  'Too many AI requests. Please wait a minute before trying again.'
);

// 一般API用（認証済み）: 60 req/min
const apiRateLimiter = createRateLimiter(
  60 * 1000,  // 1分
  config.RATE_LIMIT.api.authenticated,
  'Too many requests. Please slow down.'
);

// 一般API用（未認証）: 60 req/min
const publicRateLimiter = createRateLimiter(
  60 * 1000,  // 1分
  config.RATE_LIMIT.api.anonymous,
  'Too many requests. Please slow down.'
);

module.exports = {
  createRateLimiter,
  aiRateLimiter,
  apiRateLimiter,
  publicRateLimiter,
};
