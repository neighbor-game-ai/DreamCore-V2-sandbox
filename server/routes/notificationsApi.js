/**
 * Notifications API Routes
 * In-app notification history and management
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../authMiddleware');
const notificationService = require('../notificationService');

/**
 * GET /api/notifications
 * Get user's notification history with pagination
 *
 * Query params:
 * - limit: max notifications (default 50, max 100)
 * - offset: pagination offset (default 0)
 * - type: filter by type (project, system, social)
 */
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { limit, offset, type } = req.query;

  const result = await notificationService.getNotifications(userId, {
    limit,
    offset,
    type
  });

  res.json(result);
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', authenticate, async (req, res) => {
  const userId = req.user.id;
  const count = await notificationService.getUnreadCount(userId);
  res.json({ count });
});

/**
 * POST /api/notifications/:id/read
 * Mark single notification as read
 * read_at is set server-side (not client-provided)
 */
router.post('/:id/read', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  // Validate UUID format
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  const success = await notificationService.markAsRead(userId, id);

  if (!success) {
    return res.status(500).json({ error: 'Failed to mark as read' });
  }

  res.json({ success: true });
});

/**
 * POST /api/notifications/read-all
 * Mark all user's notifications as read
 * read_at is set server-side for all updated notifications
 */
router.post('/read-all', authenticate, async (req, res) => {
  const userId = req.user.id;
  const count = await notificationService.markAllAsRead(userId);
  res.json({ success: true, count });
});

module.exports = router;
