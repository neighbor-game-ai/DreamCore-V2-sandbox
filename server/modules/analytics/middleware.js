/**
 * Analytics Middleware
 *
 * Authentication and authorization for analytics endpoints.
 */

// Basic Auth credentials (REQUIRED - no fallback)
const ADMIN_BASIC_USER = process.env.ADMIN_BASIC_USER;
const ADMIN_BASIC_PASS = process.env.ADMIN_BASIC_PASS;

// Track if admin routes are enabled
const ADMIN_ROUTES_ENABLED = !!(ADMIN_BASIC_USER && ADMIN_BASIC_PASS);

if (!ADMIN_ROUTES_ENABLED) {
  console.warn('[Analytics] WARNING: ADMIN_BASIC_USER and ADMIN_BASIC_PASS not set - admin routes disabled');
}

// Admin emails (domain + allowlist)
const ADMIN_EMAILS = [
  // Add specific admin emails here if needed
];

/**
 * Basic Auth middleware for admin routes
 */
function basicAuthAdmin(req, res, next) {
  // If admin routes not configured, return 503
  if (!ADMIN_ROUTES_ENABLED) {
    return res.status(503).json({ error: 'Admin routes not configured' });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).json({ error: 'Basic authentication required' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  if (username !== ADMIN_BASIC_USER || password !== ADMIN_BASIC_PASS) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  next();
}

/**
 * Check if email is admin
 * @param {string} email
 * @returns {boolean}
 */
function isAdmin(email) {
  if (!email) return false;
  return email.endsWith('@neighbor.gg') || ADMIN_EMAILS.includes(email);
}

/**
 * Admin check middleware (requires authenticate to run first)
 */
function requireAdmin(req, res, next) {
  const userEmail = req.user?.email;
  if (!isAdmin(userEmail)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  basicAuthAdmin,
  isAdmin,
  requireAdmin,
};
