/**
 * Supabase Client for DreamCore V2
 *
 * V2 uses Supabase Auth for user authentication (Google OAuth).
 * This file provides server-side Supabase client initialization.
 *
 * JWT verification is done locally using JWKS (no external API calls).
 */

const { createClient } = require('@supabase/supabase-js');
const { createRemoteJWKSet, jwtVerify } = require('jose');

// JWKS configuration for local JWT verification
let JWKS = null;
let jwksInitPromise = null;

// Supabase configuration from environment variables
// NOTE: Environment validation is done in config.js at startup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Public Supabase client (anon key)
 * Use for operations that should respect RLS policies
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Admin Supabase client (service role key)
 * Use for server-side operations that bypass RLS
 * WARNING: Only use on server-side, never expose to client
 */
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Create a Supabase client with a specific user's JWT
 * @param {string} accessToken - User's access token from Supabase Auth
 * @returns {SupabaseClient} Client authenticated as the user
 */
const createUserClient = (accessToken) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
};

/**
 * Initialize JWKS for local JWT verification
 * JWKS is cached automatically by jose library
 */
const initJWKS = async () => {
  if (JWKS) return JWKS;

  if (jwksInitPromise) return jwksInitPromise;

  jwksInitPromise = (async () => {
    try {
      const jwksUrl = new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
      JWKS = createRemoteJWKSet(jwksUrl);
      console.log('[Auth] JWKS initialized for local JWT verification');
      return JWKS;
    } catch (err) {
      console.error('[Auth] Failed to initialize JWKS:', err.message);
      jwksInitPromise = null;
      throw err;
    }
  })();

  return jwksInitPromise;
};

/**
 * Verify a JWT access token locally using JWKS (no external API calls)
 * Falls back to Supabase API only if JWKS initialization fails
 *
 * @param {string} accessToken - JWT access token
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
const verifyToken = async (accessToken) => {
  if (!accessToken || typeof accessToken !== 'string') {
    return { user: null, error: new Error('Invalid access token') };
  }

  try {
    // Initialize JWKS if not already done
    const jwks = await initJWKS();

    // Verify JWT locally (no network call - JWKS is cached)
    const { payload } = await jwtVerify(accessToken, jwks, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated'
    });

    // Convert JWT payload to user object (same structure as Supabase API)
    const user = {
      id: payload.sub,
      email: payload.email || null,
      email_confirmed_at: payload.email_verified ? new Date().toISOString() : null,
      user_metadata: payload.user_metadata || {},
      created_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      // Additional fields that may be in the payload
      role: payload.role || 'authenticated',
      aal: payload.aal,
      session_id: payload.session_id
    };

    return { user, error: null };
  } catch (err) {
    // Handle specific JWT errors
    if (err.code === 'ERR_JWT_EXPIRED') {
      console.warn('[Auth] Token expired (local verification)');
      return { user: null, error: new Error('Token expired') };
    }

    if (err.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
      console.warn('[Auth] Invalid signature (local verification)');
      return { user: null, error: new Error('Invalid token signature') };
    }

    if (err.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
      console.warn('[Auth] Claim validation failed:', err.message);
      return { user: null, error: new Error('Token validation failed') };
    }

    // JWKS fetch failure - fallback to Supabase API
    if (err.message?.includes('fetch') || err.code === 'ERR_JWKS_NO_MATCHING_KEY') {
      console.warn('[Auth] JWKS issue, falling back to Supabase API:', err.message);
      return verifyTokenFallback(accessToken);
    }

    console.error('[Auth] Unexpected verification error:', err.message);
    return { user: null, error: err };
  }
};

/**
 * Fallback: Verify token using Supabase API (only used if JWKS fails)
 * @param {string} accessToken
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
const verifyTokenFallback = async (accessToken) => {
  if (!supabaseAdmin) {
    console.error('[Auth] Fallback failed: Admin client not available');
    return { user: null, error: new Error('Server configuration error') };
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error) {
      console.warn('[Auth] Fallback verification failed:', error.message);
      return { user: null, error };
    }

    if (!user) {
      return { user: null, error: new Error('User not found') };
    }

    console.log('[Auth] Fallback verification succeeded');
    return { user, error: null };
  } catch (err) {
    console.error('[Auth] Fallback unexpected error:', err.message);
    return { user: null, error: err };
  }
};

/**
 * Check if admin client is available
 * @returns {boolean}
 */
const isAdminConfigured = () => {
  return !!supabaseAdmin;
};

module.exports = {
  supabase,
  supabaseAdmin,
  createUserClient,
  verifyToken,
  verifyTokenFallback,
  initJWKS,
  isAdminConfigured,
  SUPABASE_URL
};
