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
 * SYNC: Check if user has a valid cached session (no async, no SDK needed)
 * Use this for instant UI decisions before SDK loads
 * @returns {boolean} True if cached session exists and not expired
 */
function hasSessionSync() {
  return getCachedSession() !== null;
}

/**
 * SYNC: Get cached session synchronously (no async, no SDK needed)
 * Use this for instant UI rendering before SDK loads
 * @returns {Object|null} Cached session or null
 */
function getSessionSync() {
  return getCachedSession();
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
 * SDK is lazy-loaded on first use (not at page load)
 */
async function initAuth() {
  if (supabaseClient) return supabaseClient;

  // Lazy load Supabase SDK if not already loaded
  if (!window.supabase) {
    if (window.__loadSupabase) {
      await window.__loadSupabase();
    } else {
      throw new Error('[Auth] Supabase SDK not loaded and no loader available');
    }
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

  // Listen for auth state changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('[Auth] State changed:', event);
    currentSession = session;
    setCachedSession(session);
    authStateListeners.forEach(listener => listener(event, session));
  });

  // Handle OAuth callback: exchange code for session
  const url = new URL(window.location.href);
  if (url.searchParams.has('code')) {
    console.log('[Auth] OAuth callback detected, exchanging code for session');
    try {
      const { data, error } = await supabaseClient.auth.exchangeCodeForSession(url.toString());
      if (error) {
        console.error('[Auth] Code exchange error:', error.message);
        // Code might already be exchanged by onAuthStateChange, try getSession
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          console.log('[Auth] Got session from getSession after code exchange error');
          currentSession = session;
          setCachedSession(session);
        }
      } else if (data.session) {
        console.log('[Auth] Code exchange successful');
        currentSession = data.session;
        setCachedSession(data.session);
      }
    } catch (e) {
      console.error('[Auth] Code exchange exception:', e);
    }
    // Clean up URL (remove code parameter) regardless of result
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url.pathname + url.search);
    if (currentSession) {
      return supabaseClient;
    }
  }

  // Load cached session immediately (no network)
  const cachedSession = getCachedSession();
  if (cachedSession) {
    currentSession = cachedSession;
  }

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
  localStorage.removeItem('visitorId');  // Legacy cleanup
  localStorage.removeItem('gameCreatorVisitorId');  // Legacy cleanup
  localStorage.removeItem('gameCreatorUserId');
  localStorage.removeItem('sessionId');

  // Redirect to login
  window.location.href = '/';
}

/**
 * Check if a JWT token is expired or about to expire
 * @param {Object} session - Session object with expires_at
 * @returns {boolean} True if expired or expiring within 60 seconds
 */
function isSessionExpired(session) {
  if (!session?.expires_at) return true;
  // expires_at is Unix timestamp in seconds
  const expiresAt = session.expires_at * 1000;
  const now = Date.now();
  const bufferMs = 60 * 1000; // 60 seconds buffer
  return now >= (expiresAt - bufferMs);
}

/**
 * Get a fresh session, refreshing if expired
 * Use this for reconnection scenarios where a valid token is required
 * @returns {Object|null} Fresh session or null if unable to refresh
 */
async function getFreshSession() {
  if (!supabaseClient) await initAuth();

  // If current session is valid, return it
  if (currentSession && !isSessionExpired(currentSession)) {
    console.log('[Auth] Current session is valid');
    return currentSession;
  }

  console.log('[Auth] Session expired or missing, attempting refresh...');

  // Try to refresh the session
  try {
    const { data, error } = await supabaseClient.auth.refreshSession();
    if (data?.session) {
      console.log('[Auth] Session refreshed successfully');
      currentSession = data.session;
      setCachedSession(data.session);
      return data.session;
    }
    if (error) {
      console.log('[Auth] Refresh failed:', error.message);
    }
  } catch (e) {
    console.error('[Auth] Refresh exception:', e);
  }

  // Fallback: try getSession (might return a valid session from Supabase)
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && !isSessionExpired(session)) {
      console.log('[Auth] Got valid session from getSession');
      currentSession = session;
      setCachedSession(session);
      return session;
    }
  } catch (e) {
    console.error('[Auth] getSession exception:', e);
  }

  // Unable to get a valid session
  console.log('[Auth] Unable to get fresh session');
  currentSession = null;
  setCachedSession(null);
  return null;
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
 * Check if user has access (waitlist/approval system)
 * V2 初期リリース用。承認されたユーザーのみ利用可能。
 *
 * @returns {Object} { allowed: boolean, status: 'pending'|'approved'|null }
 */
async function checkAccess() {
  const token = await getAccessToken();
  if (!token) {
    // No token = auth error, should go to login
    return { allowed: false, status: null, authError: true };
  }

  try {
    const response = await fetch('/api/check-access', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      // Token expired/invalid = auth error, should go to login
      return { allowed: false, status: null, authError: true };
    }

    if (!response.ok) {
      // Other errors = treat as auth error to be safe
      return { allowed: false, status: null, authError: true };
    }

    return await response.json();
  } catch (e) {
    console.error('[Auth] Access check error:', e);
    // Network error = treat as auth error
    return { allowed: false, status: null, authError: true };
  }
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

/**
 * Require authentication AND access approval
 * Redirects to waitlist page if not approved
 * Call this at the start of protected pages that require approval
 */
async function requireAuthAndAccess() {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    window.location.href = '/';
    return false;
  }

  const { allowed } = await checkAccess();
  if (!allowed) {
    window.location.href = '/waitlist.html';
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
  getFreshSession,   // For reconnection: always returns fresh token
  getSessionSync,    // SYNC: instant session check (no SDK)
  hasSessionSync,    // SYNC: instant boolean check (no SDK)
  getUser,
  getAccessToken,
  isAuthenticated,
  onAuthStateChange,
  offAuthStateChange,
  authFetch,
  requireAuth,
  checkAccess,           // V2 waitlist: check access status
  requireAuthAndAccess   // V2 waitlist: require auth + approval
};
