/**
 * Push Notification Service for DreamCore V2
 * Uses web-push library with VAPID authentication
 *
 * CRITICAL: All database operations use supabaseAdmin (service_role)
 * to bypass RLS. Never use user-scoped clients for push_subscriptions.
 */

const webpush = require('web-push');
const { supabaseAdmin } = require('./supabaseClient');

// Configure VAPID if keys are available
let pushConfigured = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@dreamcore.gg',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    pushConfigured = true;
    console.log('[Push] VAPID configured successfully');
  } catch (err) {
    console.error('[Push] Failed to configure VAPID:', err.message);
  }
} else {
  console.log('[Push] VAPID keys not configured - push notifications disabled');
}

/**
 * Check if push notifications are configured
 * @returns {boolean}
 */
function isPushEnabled() {
  return pushConfigured;
}

/**
 * Get VAPID public key for frontend subscription
 * @returns {string|null}
 */
function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Subscribe a user to push notifications
 * CRITICAL: Uses supabaseAdmin (service_role) - never use user-scoped client
 *
 * @param {string} userId - User ID
 * @param {Object} subscription - Push subscription data
 * @param {string} subscription.endpoint - Push service endpoint URL
 * @param {Object} subscription.keys - Subscription keys
 * @param {string} subscription.keys.p256dh - Client public key (base64)
 * @param {string} subscription.keys.auth - Auth secret (base64)
 * @param {string} [userAgent] - User agent string for debugging
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function subscribeUser(userId, subscription, userAgent = null) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { success: false, error: 'Invalid subscription data' };
  }

  try {
    // Upsert: update if endpoint exists, insert if not
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,endpoint'
      });

    if (error) {
      console.error('[Push] Subscribe error:', error.message);
      return { success: false, error: 'Failed to save subscription' };
    }

    console.log(`[Push] User ${userId.slice(0, 8)}... subscribed`);
    return { success: true };
  } catch (err) {
    console.error('[Push] Subscribe error:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Unsubscribe a user from push notifications
 * CRITICAL: Uses supabaseAdmin (service_role)
 *
 * @param {string} userId - User ID
 * @param {string} endpoint - Push endpoint to remove
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function unsubscribeUser(userId, endpoint) {
  if (!endpoint) {
    return { success: false, error: 'Endpoint required' };
  }

  try {
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[Push] Unsubscribe error:', error.message);
      return { success: false, error: 'Failed to remove subscription' };
    }

    console.log(`[Push] User ${userId.slice(0, 8)}... unsubscribed`);
    return { success: true };
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Send push notification to all user's subscribed devices
 * CRITICAL: Uses supabaseAdmin for all DB operations
 *
 * @param {string} userId - User ID
 * @param {Object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {string} [payload.icon] - Icon URL
 * @param {string} [payload.url] - Click action URL
 * @param {string} [payload.projectId] - Project ID for navigation
 * @param {string} [payload.tag] - Notification tag for grouping
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendPushToUser(userId, payload) {
  if (!isPushEnabled()) {
    console.log('[Push] Push not configured, skipping');
    return { sent: 0, failed: 0 };
  }

  // Get all subscriptions for user
  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) {
    console.error('[Push] Failed to get subscriptions:', error.message);
    return { sent: 0, failed: 0 };
  }

  if (!subscriptions?.length) {
    console.log(`[Push] No subscriptions for user ${userId.slice(0, 8)}...`);
    return { sent: 0, failed: 0 };
  }

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'dreamcore',
    data: {
      url: payload.url || '/notifications.html',
      projectId: payload.projectId || null,
      timestamp: Date.now()
    }
  });

  let sent = 0;
  let failed = 0;
  const expiredIds = [];

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };

    try {
      await webpush.sendNotification(pushSubscription, notification);
      sent++;

      // Update last_used_at on successful delivery
      await supabaseAdmin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id);
    } catch (err) {
      failed++;
      console.error(`[Push] Failed to send to endpoint:`, err.statusCode || err.message);

      // Remove expired/invalid subscriptions (410 Gone, 404 Not Found)
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredIds.push(sub.id);
      }
    }
  }

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('id', expiredIds);
    console.log(`[Push] Removed ${expiredIds.length} expired subscriptions`);
  }

  console.log(`[Push] User ${userId.slice(0, 8)}...: sent=${sent}, failed=${failed}`);
  return { sent, failed };
}

module.exports = {
  isPushEnabled,
  getVapidPublicKey,
  subscribeUser,
  unsubscribeUser,
  sendPushToUser
};
