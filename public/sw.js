/**
 * DreamCore Service Worker
 * - Minimal caching (icons and manifest only)
 * - Push notification handling
 */

const SW_VERSION = '2026.02.05.k';
const CACHE_NAME = 'dreamcore-v10';

console.log('[SW] Version:', SW_VERSION);
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Install - precache minimal assets only
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Don't fail install if icons don't exist yet
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Some assets failed to cache:', err);
        });
      })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - cache-first for precached assets only, network-first for everything else
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  // Only cache icons and manifest
  const isCacheable = url.pathname.startsWith('/icons/') ||
                      url.pathname === '/manifest.json';

  if (isCacheable) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // For all other requests, use network only (no caching)
  // This prevents issues with auth pages and dynamic content
});

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push received, version:', SW_VERSION);

  let data = {
    title: 'DreamCore',
    body: 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/notifications.html' }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('[SW] Push payload:', JSON.stringify(payload));
      data = { ...data, ...payload };
      console.log('[SW] Merged data:', JSON.stringify(data));
      console.log('[SW] data.data:', JSON.stringify(data.data));
    } catch (e) {
      console.error('[SW] Failed to parse push data:', e);
    }
  }

  // Handle both payload formats:
  // Format A: { data: { url, projectId, type } }  - nested (current server format)
  // Format B: { url, projectId, type }            - top-level (fallback)
  const notificationData = data.data || {
    url: data.url || '/notifications.html',
    projectId: data.projectId || null,
    type: data.type || 'system'
  };

  // Ensure url exists even if data.data was present but incomplete
  if (!notificationData.url) {
    notificationData.url = data.url || '/notifications.html';
  }
  if (!notificationData.projectId && data.projectId) {
    notificationData.projectId = data.projectId;
  }

  console.log('[SW] Final notificationData:', JSON.stringify(notificationData));

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag || 'dreamcore-notification',
    renotify: true,
    data: notificationData,
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click, version:', SW_VERSION, 'action:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Determine URL based on notification data
  // Priority: 1. url (explicit), 2. projectId (generate URL), 3. fallback
  const notificationData = event.notification.data || {};
  let targetUrl = '/notifications.html';  // Default fallback

  if (notificationData.url) {
    // Primary: Use explicit URL from notification payload
    targetUrl = notificationData.url;
  } else if (notificationData.projectId) {
    // Fallback: Generate URL from projectId
    targetUrl = `/create.html?project=${notificationData.projectId}`;
  }

  // Convert to absolute URL for PWA scope matching
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  // Debug: Send all computed values to server
  fetch('/api/push/debug-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: SW_VERSION,
      rawDataUrl: notificationData.url,
      rawDataProjectId: notificationData.projectId,
      targetUrl: targetUrl,
      absoluteUrl: absoluteUrl,
      origin: self.location.origin
    })
  }).catch(() => {});

  // iOS PWA has issues with client.navigate() - it resolves but doesn't actually navigate.
  // Solution: Always use clients.openWindow() which reliably opens the correct URL.
  event.waitUntil(
    (async () => {
      try {
        if (clients.openWindow) {
          const windowClient = await clients.openWindow(absoluteUrl);
          fetch('/api/push/debug-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phase: 'openWindow_result',
              url: absoluteUrl,
              success: !!windowClient,
              clientUrl: windowClient?.url || null
            })
          }).catch(() => {});
        } else {
          fetch('/api/push/debug-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'no_openWindow_method' })
          }).catch(() => {});
        }
      } catch (err) {
        fetch('/api/push/debug-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'openWindow_error', error: err.message })
        }).catch(() => {});
      }
    })()
  );
});
