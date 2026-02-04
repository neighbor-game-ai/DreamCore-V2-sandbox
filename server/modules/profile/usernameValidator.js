/**
 * Username Validation (共通モジュール)
 *
 * routes.js と publicRoutes.js で共有。
 * 予約語リストを一箇所で管理。
 */

// Username format: 3-20 chars, lowercase a-z, 0-9, underscore
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

// Reserved usernames (system routes, brand protection, etc.)
const RESERVED_USERNAMES = new Set([
  // System routes
  'api', 'admin', 'game', 'create', 'discover', 'notifications',
  'play', 'project', 'u', 'g', 'p', 'assets', 'login', 'signup',
  'settings', 'auth', 'callback', 'waitlist', 'mypage', 'profile',
  // Common reserved
  'help', 'support', 'about', 'terms', 'privacy', 'contact',
  'blog', 'news', 'status', 'docs', 'developer', 'developers',
  'app', 'apps', 'games', 'user', 'users', 'home', 'index',
  // Brand protection
  'dreamcore', 'official', 'system', 'mod', 'moderator', 'staff',
  'null', 'undefined', 'anonymous', 'guest', 'test', 'demo'
]);

/**
 * Validate username format and check reserved words
 * @param {string} username - Raw username input
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }

  // Normalize to lowercase
  const normalized = username.toLowerCase().trim();

  // Check format
  if (!USERNAME_REGEX.test(normalized)) {
    return { valid: false, error: 'Username must be 3-20 characters, lowercase letters, numbers, and underscores only' };
  }

  // Check reserved words
  if (RESERVED_USERNAMES.has(normalized)) {
    return { valid: false, error: 'This username is reserved' };
  }

  return { valid: true, normalized };
};

/**
 * Check if username is valid format (without reserved word check)
 * Used for URL validation where we just need format check
 * @param {string} username
 * @returns {boolean}
 */
const isValidUsernameFormat = (username) => {
  if (!username || typeof username !== 'string') return false;
  return USERNAME_REGEX.test(username.toLowerCase());
};

/**
 * Check if username is reserved
 * @param {string} username
 * @returns {boolean}
 */
const isReservedUsername = (username) => {
  if (!username || typeof username !== 'string') return false;
  return RESERVED_USERNAMES.has(username.toLowerCase());
};

module.exports = {
  USERNAME_REGEX,
  RESERVED_USERNAMES,
  validateUsername,
  isValidUsernameFormat,
  isReservedUsername
};
