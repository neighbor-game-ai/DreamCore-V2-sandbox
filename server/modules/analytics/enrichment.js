/**
 * Analytics Enrichment
 *
 * User-Agent parsing and geolocation from headers.
 * IP addresses are NOT stored - only derived country.
 */

/**
 * Parse User-Agent string to extract OS and browser
 * @param {string} ua - User-Agent string
 * @returns {{ os: string, browser: string }}
 */
function parseUserAgent(ua) {
  if (!ua) return { os: null, browser: null };

  let os = null;
  let browser = null;

  // OS detection
  if (/Windows NT 10/.test(ua)) os = 'Windows 10';
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.2/.test(ua)) os = 'Windows 8';
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X 10[._](\d+)/.test(ua)) {
    const match = ua.match(/Mac OS X 10[._](\d+)/);
    os = `macOS 10.${match[1]}`;
  } else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/iPhone|iPad|iPod/.test(ua)) {
    const match = ua.match(/OS (\d+)[._](\d+)/);
    os = match ? `iOS ${match[1]}.${match[2]}` : 'iOS';
  } else if (/Android (\d+(?:\.\d+)?)/.test(ua)) {
    const match = ua.match(/Android (\d+(?:\.\d+)?)/);
    os = `Android ${match[1]}`;
  } else if (/Android/.test(ua)) os = 'Android';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/CrOS/.test(ua)) os = 'Chrome OS';

  // Browser detection (order matters - check specific first)
  if (/Edg\//.test(ua)) {
    const match = ua.match(/Edg\/(\d+)/);
    browser = match ? `Edge ${match[1]}` : 'Edge';
  } else if (/OPR\//.test(ua) || /Opera/.test(ua)) {
    const match = ua.match(/OPR\/(\d+)/);
    browser = match ? `Opera ${match[1]}` : 'Opera';
  } else if (/Chrome\/(\d+)/.test(ua) && !/Chromium/.test(ua)) {
    const match = ua.match(/Chrome\/(\d+)/);
    browser = `Chrome ${match[1]}`;
  } else if (/Safari\//.test(ua) && /Version\/(\d+)/.test(ua)) {
    const match = ua.match(/Version\/(\d+)/);
    browser = `Safari ${match[1]}`;
  } else if (/Firefox\/(\d+)/.test(ua)) {
    const match = ua.match(/Firefox\/(\d+)/);
    browser = `Firefox ${match[1]}`;
  } else if (/MSIE|Trident/.test(ua)) {
    browser = 'IE';
  }

  return { os, browser };
}

/**
 * Get country code from request headers
 * Cloudflare provides CF-IPCountry header
 * @param {object} headers - Request headers
 * @returns {string|null} - ISO country code (e.g., 'JP', 'US')
 */
function getCountryFromHeaders(headers) {
  // Cloudflare header (most reliable)
  const cfCountry = headers['cf-ipcountry'];
  if (cfCountry && cfCountry !== 'XX') {
    return cfCountry.toUpperCase();
  }

  // Fallback: X-Country header (some proxies)
  const xCountry = headers['x-country'];
  if (xCountry) {
    return xCountry.toUpperCase();
  }

  return null;
}

/**
 * Enrich event data with derived fields
 * @param {object} req - Express request object
 * @param {object} data - Event data
 * @returns {object} - Enriched data
 */
function enrichEventData(req, data) {
  const ua = req.headers['user-agent'];
  const { os, browser } = parseUserAgent(ua);
  const country = getCountryFromHeaders(req.headers);

  return {
    ...data,
    os,
    browser,
    country,
  };
}

module.exports = {
  parseUserAgent,
  getCountryFromHeaders,
  enrichEventData,
};
