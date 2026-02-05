/**
 * DreamCore Service Worker
 * - Minimal caching (icons and manifest only)
 * - Push notification handling
 */

const CACHE_NAME = 'dreamcore-v2';
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Install - precache minimal assets only
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
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
  console.log('[SW] Push received:', event);

  let data = {
    title: 'DreamCore',
    body: 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/notifications.html' }
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.error('[SW] Failed to parse push data:', e);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag || 'dreamcore-notification',
    renotify: true,
    data: data.data || { url: '/notifications.html' },
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
  console.log('[SW] Notification click:', event.action);
  console.log('[SW] Notification data:', JSON.stringify(event.notification.data));
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Determine URL based on notification data
  // Priority: 1. url (explicit), 2. projectId (generate URL), 3. fallback
  const notificationData = event.notification.data || {};
  console.log('[SW] notificationData.url:', notificationData.url);
  console.log('[SW] notificationData.projectId:', notificationData.projectId);
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

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Try to find an existing PWA/browser window to focus
        for (const client of windowClients) {
          // Check if client is from our origin
          if (new URL(client.url).origin === self.location.origin) {
            // Focus existing window and navigate to target
            return client.focus().then(() => {
              // Navigate if possible (not supported in all browsers)
              if ('navigate' in client) {
                return client.navigate(absoluteUrl);
              }
              // Fallback: post message to let the page handle navigation
              client.postMessage({
                type: 'NOTIFICATION_CLICK',
                url: absoluteUrl
              });
            });
          }
        }
        // No existing window - open new one
        // Using absolute URL helps PWA scope matching
        if (clients.openWindow) {
          return clients.openWindow(absoluteUrl);
        }
      })
  );
});
