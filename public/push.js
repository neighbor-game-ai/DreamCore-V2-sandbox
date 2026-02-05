/**
 * DreamCore Push Notification Subscription Manager
 *
 * Usage:
 *   await DreamCorePush.subscribe();   // Subscribe user to push notifications
 *   await DreamCorePush.unsubscribe(); // Unsubscribe
 *   await DreamCorePush.isSubscribed(); // Check subscription status
 */

const DreamCorePush = {
  /**
   * Check if push notifications are supported
   * @returns {boolean}
   */
  isSupported() {
    return 'serviceWorker' in navigator &&
           'PushManager' in window &&
           'Notification' in window;
  },

  /**
   * Get current notification permission status
   * @returns {'granted'|'denied'|'default'}
   */
  getPermission() {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
  },

  /**
   * Register service worker if not already registered
   * @returns {Promise<ServiceWorkerRegistration>}
   */
  async ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported');
    }

    // Check if already registered
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (registration) {
      return registration;
    }

    // Register new
    return navigator.serviceWorker.register('/sw.js');
  },

  /**
   * Get VAPID public key from server
   * @returns {Promise<string>}
   */
  async getVapidKey() {
    const response = await fetch('/api/push/vapid-key');
    if (!response.ok) {
      throw new Error('Push notifications not available');
    }
    const { publicKey } = await response.json();
    return publicKey;
  },

  /**
   * Convert base64 VAPID key to Uint8Array
   * @param {string} base64String
   * @returns {Uint8Array}
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  /**
   * Subscribe to push notifications
   * Requires notification permission to be granted first
   * @returns {Promise<PushSubscription>}
   */
  async subscribe() {
    if (!this.isSupported()) {
      throw new Error('Push notifications not supported');
    }

    // Request permission if not granted
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }
    } else if (Notification.permission === 'denied') {
      throw new Error('Notification permission denied');
    }

    // Ensure service worker is registered
    const registration = await this.ensureServiceWorker();
    await navigator.serviceWorker.ready;

    // Get VAPID key
    const vapidKey = await this.getVapidKey();

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(vapidKey)
    });

    // Send subscription to server
    const p256dhKey = subscription.getKey('p256dh');
    const authKey = subscription.getKey('auth');

    const response = await DreamCoreAuth.authFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dhKey))),
          auth: btoa(String.fromCharCode(...new Uint8Array(authKey)))
        },
        userAgent: navigator.userAgent
      })
    });

    if (!response.ok) {
      // Unsubscribe locally if server save failed
      await subscription.unsubscribe();
      throw new Error('Failed to save subscription');
    }

    console.log('[Push] Subscribed successfully');
    return subscription;
  },

  /**
   * Unsubscribe from push notifications
   * @returns {Promise<void>}
   */
  async unsubscribe() {
    if (!this.isSupported()) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Remove from server first
      try {
        await DreamCoreAuth.authFetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint
          })
        });
      } catch (err) {
        console.warn('[Push] Failed to remove subscription from server:', err);
      }

      // Unsubscribe locally
      await subscription.unsubscribe();
      console.log('[Push] Unsubscribed');
    }
  },

  /**
   * Check if currently subscribed to push
   * @returns {Promise<boolean>}
   */
  async isSubscribed() {
    if (!this.isSupported()) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return !!subscription;
    } catch {
      return false;
    }
  },

  /**
   * Check if running in standalone mode (PWA)
   * Required for iOS push notifications
   * @returns {boolean}
   */
  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  },

  /**
   * Check if iOS Safari
   * @returns {boolean}
   */
  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  },

  /**
   * Get push status info for UI
   * @returns {Promise<{supported: boolean, permission: string, subscribed: boolean, standalone: boolean, ios: boolean}>}
   */
  async getStatus() {
    return {
      supported: this.isSupported(),
      permission: this.getPermission(),
      subscribed: await this.isSubscribed(),
      standalone: this.isStandalone(),
      ios: this.isIOS()
    };
  }
};

// Export to window
window.DreamCorePush = DreamCorePush;
