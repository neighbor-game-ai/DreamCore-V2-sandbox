/**
 * Profile Validators
 *
 * Validation and normalization functions for user profile data.
 * Normalizes URLs and validates social_links structure.
 */

const PLATFORMS = ['x', 'youtube', 'github', 'tiktok', 'instagram'];
const HTTPS_REGEX = /^https:\/\/.+/;

/**
 * Normalize a social URL
 * - Rejects dangerous schemes (javascript:, data:, vbscript:, etc.)
 * - Adds https:// if missing
 * - Converts http:// to https://
 * - Removes trailing slashes
 * @param {string|null|undefined} url - URL to normalize
 * @returns {string|null} Normalized URL or null
 */
function normalizeSocialUrl(url) {
  if (!url || typeof url !== 'string') return null;
  url = url.trim();
  if (!url) return null;

  // Reject dangerous schemes (XSS prevention)
  const lowerUrl = url.toLowerCase();
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:'];
  if (dangerousSchemes.some(scheme => lowerUrl.startsWith(scheme))) {
    return null;
  }

  // Add https:// if no protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Force https
  url = url.replace(/^http:\/\//, 'https://');

  // Remove trailing slashes
  return url.replace(/\/+$/, '');
}

/**
 * Normalize entire social_links object
 * - Normalizes all platform URLs
 * - Filters empty custom links
 * - Returns null if no links set
 * @param {Object|null|undefined} links - Social links object
 * @returns {Object|null} Normalized links or null
 */
function normalizeSocialLinks(links) {
  if (!links) return null;

  // Type check: must be a plain object
  if (typeof links !== 'object' || Array.isArray(links)) {
    return null;
  }

  const result = {};

  // Normalize platform URLs
  for (const p of PLATFORMS) {
    result[p] = normalizeSocialUrl(links[p]);
  }

  // Normalize custom links
  if (links.custom && Array.isArray(links.custom)) {
    result.custom = links.custom
      .map(item => ({
        label: item.label?.trim() || '',
        url: normalizeSocialUrl(item.url)
      }))
      .filter(item => item.label && item.url);
  }

  // Return null if empty (no links set)
  const hasAnyLink = PLATFORMS.some(p => result[p]) ||
                     (result.custom && result.custom.length > 0);
  return hasAnyLink ? result : null;
}

/**
 * Validate social_links object (run after normalization)
 * @param {Object|null} links - Normalized social links
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSocialLinks(links) {
  if (!links) return { valid: true };

  if (typeof links !== 'object' || Array.isArray(links)) {
    return { valid: false, error: 'social_links must be an object' };
  }

  // Validate platform URLs
  for (const platform of PLATFORMS) {
    const url = links[platform];
    if (url && !HTTPS_REGEX.test(url)) {
      return { valid: false, error: `${platform} must start with https://` };
    }
  }

  // Validate custom links
  if (links.custom) {
    if (!Array.isArray(links.custom)) {
      return { valid: false, error: 'custom must be an array' };
    }
    if (links.custom.length > 5) {
      return { valid: false, error: 'Maximum 5 custom links allowed' };
    }
    for (const item of links.custom) {
      if (!item.label || typeof item.label !== 'string') {
        return { valid: false, error: 'Custom link label required' };
      }
      if (item.label.length > 30) {
        return { valid: false, error: 'Custom link label max 30 chars' };
      }
      if (!item.url || !HTTPS_REGEX.test(item.url)) {
        return { valid: false, error: 'Custom link must have valid https:// URL' };
      }
    }
  }

  return { valid: true };
}

module.exports = {
  PLATFORMS,
  normalizeSocialUrl,
  normalizeSocialLinks,
  validateSocialLinks
};
