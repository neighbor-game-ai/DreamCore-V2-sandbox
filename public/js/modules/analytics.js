/**
 * DreamCore Analytics Module
 *
 * Client-side event tracking with batching and session management.
 */

(function (global) {
  'use strict';

  // ==================== Configuration ====================

  const CONFIG = {
    BATCH_SIZE: 25,           // Events per batch
    FLUSH_INTERVAL: 5000,     // Flush every 5 seconds
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    API_BASE: '/api/analytics',
    STORAGE_KEYS: {
      DEVICE_ID: 'dc_device_id',
      SESSION: 'dc_session',
      UTM: 'dc_utm',
    },
    UTM_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  };

  // ==================== State ====================

  let initialized = false;
  let eventBuffer = [];
  let flushTimer = null;
  let currentUserId = null;

  // ==================== Device ID ====================

  function getDeviceId() {
    let id = localStorage.getItem(CONFIG.STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CONFIG.STORAGE_KEYS.DEVICE_ID, id);
    }
    return id;
  }

  // ==================== Session Management ====================

  function getStoredSession() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(session));
  }

  function isSessionExpired(session) {
    if (!session || !session.lastActive) return true;
    return Date.now() - session.lastActive > CONFIG.SESSION_TIMEOUT;
  }

  function updateSessionActivity() {
    const session = getStoredSession();
    if (session) {
      session.lastActive = Date.now();
      saveSession(session);
    }
  }

  async function getOrCreateSession() {
    const stored = getStoredSession();

    if (stored && !isSessionExpired(stored)) {
      updateSessionActivity();
      return stored.id;
    }

    // Create new session
    const deviceId = getDeviceId();
    const utmData = getUtmData();
    const screen = `${window.screen.width}x${window.screen.height}`;

    try {
      const response = await fetch(`${CONFIG.API_BASE}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          device_id: deviceId,
          first_path: location.pathname,
          referrer: utmData?.referrer || document.referrer || null,
          utm_source: utmData?.utm_source || null,
          utm_medium: utmData?.utm_medium || null,
          utm_campaign: utmData?.utm_campaign || null,
          utm_term: utmData?.utm_term || null,
          utm_content: utmData?.utm_content || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen,
        }),
      });

      if (!response.ok) {
        console.error('[Analytics] Failed to create session');
        return null;
      }

      const { session_id } = await response.json();

      saveSession({
        id: session_id,
        startedAt: Date.now(),
        lastActive: Date.now(),
      });

      // Clear UTM data after use
      clearUtmData();

      return session_id;
    } catch (err) {
      console.error('[Analytics] Session creation error:', err);
      return null;
    }
  }

  function getSessionId() {
    const session = getStoredSession();
    return session?.id || null;
  }

  // ==================== UTM Data ====================

  function saveUtmData() {
    const params = new URLSearchParams(location.search);
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');
    const utmCampaign = params.get('utm_campaign');
    const utmTerm = params.get('utm_term');
    const utmContent = params.get('utm_content');
    const referrer = document.referrer;

    // Only save if there's UTM data or external referrer
    if (utmSource || (referrer && !referrer.includes(location.host))) {
      const data = {
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_term: utmTerm,
        utm_content: utmContent,
        referrer,
        expires_at: Date.now() + CONFIG.UTM_EXPIRY,
      };
      localStorage.setItem(CONFIG.STORAGE_KEYS.UTM, JSON.stringify(data));
    }
  }

  function getUtmData() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.UTM);
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      if (Date.now() > data.expires_at) {
        clearUtmData();
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function clearUtmData() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.UTM);
  }

  // ==================== Auth Headers ====================

  function getAuthHeaders() {
    // Get token from DreamCoreAuth if available
    if (typeof DreamCoreAuth !== 'undefined' && DreamCoreAuth.getSession) {
      const session = DreamCoreAuth.getSession();
      if (session?.access_token) {
        return { Authorization: `Bearer ${session.access_token}` };
      }
    }
    return {};
  }

  // ==================== Event Tracking ====================

  function track(eventType, properties = {}) {
    if (!initialized) {
      console.warn('[Analytics] Not initialized');
      return;
    }

    const event = {
      event_type: eventType,
      event_ts: new Date().toISOString(),
      path: location.pathname,
      properties: Object.keys(properties).length > 0 ? properties : null,
    };

    eventBuffer.push(event);

    // Flush if buffer is full
    if (eventBuffer.length >= CONFIG.BATCH_SIZE) {
      flush();
    }
  }

  async function flush() {
    if (eventBuffer.length === 0) return;

    const sessionId = getSessionId();
    if (!sessionId) {
      // Try to create session
      await getOrCreateSession();
      return;
    }

    const events = [...eventBuffer];
    eventBuffer = [];

    try {
      const response = await fetch(`${CONFIG.API_BASE}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          device_id: getDeviceId(),
          session_id: sessionId,
          events,
        }),
      });

      if (!response.ok) {
        console.error('[Analytics] Track failed, re-queuing events');
        eventBuffer = [...events, ...eventBuffer];
      }
    } catch (err) {
      console.error('[Analytics] Track error:', err);
      // Re-queue events on failure
      eventBuffer = [...events, ...eventBuffer];
    }
  }

  // ==================== User Linking ====================

  async function linkUser() {
    const sessionId = getSessionId();
    const deviceId = getDeviceId();

    if (!sessionId) return;

    try {
      await fetch(`${CONFIG.API_BASE}/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          session_id: sessionId,
          device_id: deviceId,
        }),
      });
    } catch (err) {
      console.error('[Analytics] Link user error:', err);
    }
  }

  function setUserId(userId) {
    const previousUserId = currentUserId;
    currentUserId = userId;

    // If user just logged in, link session
    if (!previousUserId && userId) {
      linkUser();
      track('login', { method: 'google' });
    }
  }

  // ==================== Session End ====================

  async function endSession() {
    // Flush remaining events
    await flush();

    const sessionId = getSessionId();
    if (!sessionId) return;

    try {
      // Use sendBeacon for reliability on page unload
      const data = JSON.stringify({});
      navigator.sendBeacon(`${CONFIG.API_BASE}/session/${sessionId}/end`, data);
    } catch {
      // Fallback to fetch
      fetch(`${CONFIG.API_BASE}/session/${sessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ==================== Auto-tracking ====================

  function setupAutoTracking() {
    // Track page views on navigation
    let lastPath = location.pathname;

    // History API tracking
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        track('page_view', { title: document.title });
        updateSessionActivity();
      }
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        track('page_view', { title: document.title });
        updateSessionActivity();
      }
    };

    window.addEventListener('popstate', () => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        track('page_view', { title: document.title });
        updateSessionActivity();
      }
    });

    // Session end on page unload
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush(); // Flush but don't end session - user might come back
      }
    });

    window.addEventListener('pagehide', endSession);

    // Error tracking
    window.addEventListener('error', (event) => {
      track('error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      track('error', {
        message: event.reason?.message || String(event.reason),
        type: 'unhandledrejection',
      });
    });
  }

  // ==================== Initialization ====================

  async function init(options = {}) {
    if (initialized) return;

    // Save UTM data on first load
    saveUtmData();

    // Create or restore session
    await getOrCreateSession();

    // Set up periodic flush
    flushTimer = setInterval(flush, CONFIG.FLUSH_INTERVAL);

    // Set up auto-tracking
    setupAutoTracking();

    // Set up auth integration if DreamCoreAuth is available
    setupAuthIntegration();

    initialized = true;

    // Track initial page view
    track('page_view', { title: document.title });

    console.log('[Analytics] Initialized');
  }

  function setupAuthIntegration() {
    // Check if DreamCoreAuth is available
    if (typeof DreamCoreAuth === 'undefined') {
      console.log('[Analytics] DreamCoreAuth not available, skipping auth integration');
      return;
    }

    // Set initial user if already logged in
    const session = DreamCoreAuth.getSessionSync?.() || DreamCoreAuth.getSession?.();
    if (session?.user?.id) {
      currentUserId = session.user.id;
    }

    // Listen for auth state changes
    if (DreamCoreAuth.onAuthStateChange) {
      DreamCoreAuth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          if (!currentUserId) {
            // User just logged in
            currentUserId = session.user.id;
            linkUser();
            track('login', { method: 'google' });
          } else {
            currentUserId = session.user.id;
          }
        } else if (event === 'SIGNED_OUT') {
          if (currentUserId) {
            track('logout');
            currentUserId = null;
          }
        }
      });
    }
  }

  // ==================== Public API ====================

  const Analytics = {
    init,
    track,
    flush,
    setUserId,
    linkUser,
    endSession,
    getSessionId,
    getDeviceId,
  };

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Analytics;
  } else {
    global.DreamCoreAnalytics = Analytics;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
