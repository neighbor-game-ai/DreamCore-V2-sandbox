/**
 * Authentication Middleware for DreamCore V2
 *
 * Handles JWT verification for Supabase Auth.
 * Supports both REST API and WebSocket authentication.
 */

const { verifyToken, isConfigured } = require('./supabaseClient');

/**
 * Extract access token from request
 * Supports multiple methods:
 * 1. Authorization header (Bearer token)
 * 2. Cookie (sb-access-token)
 * 3. Query parameter (access_token) - for WebSocket connections
 *
 * @param {Request} req - Express request object
 * @returns {string|null} Access token or null
 */
const extractToken = (req) => {
  // 1. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 2. Cookie
  const cookies = req.cookies || {};
  if (cookies['sb-access-token']) {
    return cookies['sb-access-token'];
  }

  // 3. Query parameter (for WebSocket upgrade)
  if (req.query && req.query.access_token) {
    return req.query.access_token;
  }

  return null;
};

/**
 * Authentication middleware for Express routes
 * Verifies JWT and attaches user to request
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 */
const authenticate = async (req, res, next) => {
  // Skip auth if Supabase is not configured (development mode)
  if (!isConfigured()) {
    console.warn('[Auth] Supabase not configured, using fallback auth');
    // Fallback: use visitorId from query/body for backwards compatibility
    const visitorId = req.query.visitorId || req.body?.visitorId;
    if (visitorId) {
      req.user = {
        id: visitorId,
        isLegacy: true
      };
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  const { user, error } = await verifyToken(token);

  if (error || !user) {
    console.error('[Auth] Token verification failed:', error?.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user to request
  req.user = {
    id: user.id,              // UUID from Supabase Auth
    email: user.email,
    emailVerified: user.email_confirmed_at != null,
    metadata: user.user_metadata || {},
    createdAt: user.created_at
  };

  next();
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't block if not
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 */
const optionalAuth = async (req, res, next) => {
  if (!isConfigured()) {
    // Fallback: use visitorId from query/body
    const visitorId = req.query.visitorId || req.body?.visitorId;
    if (visitorId) {
      req.user = {
        id: visitorId,
        isLegacy: true
      };
    }
    return next();
  }

  const token = extractToken(req);

  if (!token) {
    return next();
  }

  const { user, error } = await verifyToken(token);

  if (!error && user) {
    req.user = {
      id: user.id,
      email: user.email,
      emailVerified: user.email_confirmed_at != null,
      metadata: user.user_metadata || {},
      createdAt: user.created_at
    };
  }

  next();
};

/**
 * Verify WebSocket authentication
 * For use in WebSocket connection handler
 *
 * @param {string} token - Access token
 * @returns {Promise<{user: Object|null, error: string|null}>}
 */
const verifyWebSocketAuth = async (token) => {
  if (!isConfigured()) {
    // Return a mock user for development
    return {
      user: { id: token, isLegacy: true },
      error: null
    };
  }

  if (!token) {
    return { user: null, error: 'No access token provided' };
  }

  const { user, error } = await verifyToken(token);

  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid token' };
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      metadata: user.user_metadata || {}
    },
    error: null
  };
};

/**
 * Check if user owns a resource
 * @param {string} userId - ID of the user making the request
 * @param {string} ownerId - ID of the resource owner
 * @returns {boolean}
 */
const isOwner = (userId, ownerId) => {
  return userId === ownerId;
};

/**
 * Middleware to check resource ownership
 * Requires authenticate middleware to run first
 *
 * @param {Function} getOwnerId - Async function to get owner ID from request
 * @returns {Function} Express middleware
 */
const requireOwnership = (getOwnerId) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const ownerId = await getOwnerId(req);

      if (!ownerId) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      if (!isOwner(req.user.id, ownerId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      next();
    } catch (error) {
      console.error('[Auth] Ownership check failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = {
  extractToken,
  authenticate,
  optionalAuth,
  verifyWebSocketAuth,
  isOwner,
  requireOwnership
};
