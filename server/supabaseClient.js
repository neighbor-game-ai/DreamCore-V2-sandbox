/**
 * Supabase Client for DreamCore V2
 *
 * V2 uses Supabase Auth for user authentication (Google OAuth).
 * This file provides server-side Supabase client initialization.
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase configuration from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!SUPABASE_URL) {
  console.warn('Warning: SUPABASE_URL not set. Supabase features will be disabled.');
}

/**
 * Public Supabase client (anon key)
 * Use for operations that should respect RLS policies
 */
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * Admin Supabase client (service role key)
 * Use for server-side operations that bypass RLS
 * WARNING: Only use on server-side, never expose to client
 */
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
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
 * Verify a JWT access token and return user info
 * @param {string} accessToken - JWT access token
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
const verifyToken = async (accessToken) => {
  if (!supabaseAdmin) {
    return { user: null, error: new Error('Supabase not configured') };
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error) {
      return { user: null, error };
    }

    return { user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
};

/**
 * Check if Supabase is configured and available
 * @returns {boolean}
 */
const isConfigured = () => {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
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
  isConfigured,
  isAdminConfigured,
  SUPABASE_URL
};
