/**
 * Supabase Auth Client for DreamCore V2
 *
 * Provides authentication utilities using Supabase Auth with Google OAuth.
 * Optimized with localStorage caching to minimize Supabase API calls.
 */

// Global auth state
let supabaseClient = null;
let currentSession = null;
let authStateListeners = [];
let sessionPromise = null; // Prevent duplicate getSession calls

// Session cache config
const SESSION_CACHE_KEY = 'dreamcore_session_cache';
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached session from localStorage
 * @returns {Object|null} Cached session or null if expired/missing
 */
function getCachedSession() {
  try {
    const cached = localStorage.getItem(SESSION_CACHE_KEY);
    if (!cached) return null;

    const { session, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > SESSION_CACHE_TTL) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

/**
 * Save session to localStorage cache
 * @param {Object|null} session - Session to cache
 */
function setCachedSession(session) {
  try {
    if (session) {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
        session,
        timestamp: Date.now()
      }));
    } else {
      localStorage.removeItem(SESSION_CACHE_KEY);
    }
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Initialize Supabase client
 * Must be called before any auth operations
 *
 * Optimization: Uses inline config (window.__SUPABASE__) when available
 * Session is loaded from cache first, then validated in background
 */
async function initAuth() {
  if (supabaseClient) return supabaseClient;

  // Require Supabase SDK to be loaded via static script tag
  if (!window.supabase) {
    throw new Error('[Auth] Supabase SDK not loaded. Please include the Supabase script tag before auth.js');
  }

  // Get config: prefer inline, fallback to API
  let config;
  if (window.__SUPABASE__) {
    config = window.__SUPABASE__;
  } else {
    // Fallback: fetch from API (slower path)
    const response = await fetch('/api/config');
    const data = await response.json();
    config = { url: data.supabaseUrl, anonKey: data.supabaseAnonKey };
  }

  supabaseClient = window.supabase.createClient(config.url, config.anonKey);

  // Load cached session immediately (no network)
  const cachedSession = getCachedSession();
  if (cachedSession) {
    currentSession = cachedSession;
  }

  // Listen for auth state changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('[Auth] State changed:', event);
    currentSession = session;
    setCachedSession(session);
    authStateListeners.forEach(listener => listener(event, session));
  });

  // If no cached session, fetch from Supabase (this is slow)
  if (!currentSession) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    setCachedSession(session);
  }

  return supabaseClient;
}

/**
 * Sign in with Google OAuth
 */
async function signInWithGoogle() {
  if (!supabaseClient) await initAuth();

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/create.html'
    }
  });

  if (error) {
    console.error('[Auth] Google sign-in error:', error);
    throw error;
  }

  return data;
}

/**
 * Sign out
 */
async function signOut() {
  if (!supabaseClient) await initAuth();

  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error('[Auth] Sign out error:', error);
    throw error;
  }

  // Clear all caches
  currentSession = null;
  setCachedSession(null);
  localStorage.removeItem('visitorId');
  localStorage.removeItem('sessionId');

  // Redirect to login
  window.location.href = '/';
}

/**
 * Get current session
 * Optimized: Uses memory cache, then localStorage cache, then Supabase
 * @returns {Object|null} Current session or null if not authenticated
 */
async function getSession() {
  // Return memory cache if available
  if (currentSession) return currentSession;

  // Check localStorage cache before initializing
  const cachedSession = getCachedSession();
  if (cachedSession) {
    currentSession = cachedSession;
    // Initialize in background if not done yet
    if (!supabaseClient) {
      initAuth().catch(console.error);
    }
    return cachedSession;
  }

  // No cache - need full initialization
  if (!supabaseClient) await initAuth();

  // If still no session after init, return null
  return currentSession;
}

/**
 * Get current user
 * @returns {Object|null} Current user or null if not authenticated
 */
async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Get access token for API calls
 * @returns {string|null} Access token or null if not authenticated
 */
async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if authenticated
 */
async function isAuthenticated() {
  const session = await getSession();
  return !!session;
}

/**
 * Add auth state change listener
 * @param {Function} listener - Callback function (event, session)
 */
function onAuthStateChange(listener) {
  authStateListeners.push(listener);
}

/**
 * Remove auth state change listener
 * @param {Function} listener - Callback function to remove
 */
function offAuthStateChange(listener) {
  authStateListeners = authStateListeners.filter(l => l !== listener);
}

/**
 * Authenticated fetch wrapper
 * Automatically adds Authorization header
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function authFetch(url, options = {}) {
  const token = await getAccessToken();

  const headers = {
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers
  });
}

/**
 * Require authentication - redirect to login if not authenticated
 * Call this at the start of protected pages
 */
async function requireAuth() {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    window.location.href = '/';
    return false;
  }
  return true;
}

// Export for use in other scripts
window.DreamCoreAuth = {
  initAuth,
  signInWithGoogle,
  signOut,
  getSession,
  getUser,
  getAccessToken,
  isAuthenticated,
  onAuthStateChange,
  offAuthStateChange,
  authFetch,
  requireAuth
};
