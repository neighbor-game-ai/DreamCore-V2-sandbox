/**
 * preauth.js - Early authentication check (runs synchronously in <head>)
 *
 * Checks sessionStorage cache and localStorage Supabase session before
 * any other JS loads. Redirects to /login if no valid session is found.
 * Must remain synchronous - no async/await.
 */
(function() {
  var LOGIN_URL = '/login';

  // Skip if OAuth callback (code parameter present)
  var search = window.location.search;
  var hash = window.location.hash;
  if ((hash && hash.includes('access_token')) ||
      (search && (search.includes('code=') || search.includes('error=')))) {
    return; // Let auth.js handle OAuth callback
  }

  // Check our session cache (sessionStorage) OR Supabase's session (localStorage)
  var cached = sessionStorage.getItem('dreamcore_session_cache');
  // Find Supabase session by pattern (sb-*-auth-token) to avoid hardcoding project ID
  var supabaseSession = null;
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
      supabaseSession = localStorage.getItem(key);
      break;
    }
  }

  if (!cached && !supabaseSession) {
    window.location.href = LOGIN_URL;
    return;
  }

  // If we have Supabase session but no cache, let auth.js handle session restoration
  if (!cached && supabaseSession) {
    return;
  }

  try {
    var data = JSON.parse(cached);
    // Check cache TTL (5 min)
    if (Date.now() - data.timestamp > 300000) {
      sessionStorage.removeItem('dreamcore_session_cache');
      if (supabaseSession) return; // localStorage has session, let auth.js handle
      window.location.href = LOGIN_URL;
      return;
    }
    // Check session token expiry
    var session = data.session;
    if (session && session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
      sessionStorage.removeItem('dreamcore_session_cache');
      if (supabaseSession) return; // localStorage has session, let auth.js handle
      window.location.href = LOGIN_URL;
      return;
    }
  } catch(e) {
    sessionStorage.removeItem('dreamcore_session_cache');
    if (supabaseSession) return; // localStorage has session, let auth.js handle
    window.location.href = LOGIN_URL;
  }
})();
