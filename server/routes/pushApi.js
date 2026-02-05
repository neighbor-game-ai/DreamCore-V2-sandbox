/**
 * Push Notification API Routes
 *
 * CRITICAL: All push_subscriptions operations use supabaseAdmin (service_role)
 * Never use req.supabase (user-scoped client) for this table.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../authMiddleware');
const pushService = require('../pushService');

/**
 * GET /api/push/vapid-key
 * Returns VAPID public key for frontend subscription
 * No authentication required (public endpoint)
 */
router.get('/vapid-key', (req, res) => {
  const key = pushService.getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: key });
});

/**
 * POST /api/push/subscribe
 * Store push subscription for authenticated user
 * Uses service_role internally (never user-scoped client)
 */
router.post('/subscribe', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { endpoint, keys, userAgent } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription data' });
  }

  const result = await pushService.subscribeUser(
    userId,
    { endpoint, keys },
    userAgent || req.headers['user-agent']
  );

  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ success: true });
});

/**
 * DELETE /api/push/unsubscribe
 * Remove push subscription for authenticated user
 */
router.delete('/unsubscribe', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { endpoint } = req.body;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required' });
  }

  const result = await pushService.unsubscribeUser(userId, endpoint);

  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ success: true });
});

/**
 * GET /api/push/status
 * Check if push is enabled and if user is subscribed
 */
router.get('/status', authenticate, async (req, res) => {
  const userId = req.user.id;

  res.json({
    enabled: pushService.isPushEnabled(),
    // Subscription status could be added here if needed
  });
});

module.exports = router;
