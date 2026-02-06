/**
 * Notification Service for DreamCore V2
 * Creates in-app notifications and sends push notifications
 *
 * CRITICAL: All database operations use supabaseAdmin (service_role)
 */

const { supabaseAdmin } = require('./supabaseClient');
const pushService = require('./pushService');

/**
 * Check if user is allowed to receive push notifications
 * Used for E2E testing to limit notifications to specific users
 *
 * @param {Object} options
 * @param {string} [options.userId] - User ID to check
 * @param {string} [options.email] - User email to check
 * @returns {boolean} True if allowed, false if blocked
 */
function isAllowedPushUser({ userId, email } = {}) {
  const ids = (process.env.PUSH_ALLOWLIST_USER_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const emails = (process.env.PUSH_ALLOWLIST_EMAILS || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  // If allowlist is set, check membership
  if (ids.length && userId && ids.includes(userId)) return true;
  if (emails.length && email && emails.includes(email)) return true;

  // If no allowlist configured, allow everyone (production mode)
  if (!ids.length && !emails.length) return true;

  // Allowlist is set but user not in it
  return false;
}

/**
 * Create notification and optionally send push
 *
 * @param {Object} options
 * @param {string} options.userId - Target user ID
 * @param {string} options.type - Notification type: 'project', 'system', 'social'
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body
 * @param {string} [options.icon] - Icon type (default, success, warning, error)
 * @param {string} [options.projectId] - Related project ID
 * @param {string} [options.jobId] - Job ID for duplicate prevention
 * @param {boolean} [options.sendPush=true] - Whether to send push notification
 * @returns {Promise<Object|null>} Created notification or null on error
 */
async function createNotification(options) {
  const {
    userId,
    type,
    title,
    message,
    icon = 'default',
    projectId = null,
    jobId = null,
    sendPush = true
  } = options;

  if (!userId || !type || !title || !message) {
    console.error('[Notification] Missing required fields');
    return null;
  }

  // Check allowlist (for E2E testing)
  if (!isAllowedPushUser({ userId })) {
    console.log('[Notification] Skipped (user not in allowlist):', userId);
    return null;
  }

  // Validate type
  if (!['project', 'system', 'social'].includes(type)) {
    console.error('[Notification] Invalid type:', type);
    return null;
  }

  try {
    // Insert notification record
    // UNIQUE(user_id, job_id) prevents duplicate notifications for same job
    const { data: notification, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        icon,
        project_id: projectId,
        job_id: jobId
      })
      .select()
      .single();

    if (error) {
      // Check for duplicate (unique constraint violation)
      if (error.code === '23505') {
        console.log(`[Notification] Duplicate notification for job ${jobId?.slice(0, 8)}...`);
        return null;
      }
      console.error('[Notification] Create error:', error.message);
      return null;
    }

    console.log(`[Notification] Created for user ${userId.slice(0, 8)}...: ${title}`);

    // Send push notification
    if (sendPush && pushService.isPushEnabled()) {
      const url = projectId ? `/project/${projectId}` : '/notifications';
      console.log(`[Notification] Push URL: ${url}, projectId: ${projectId}`);
      await pushService.sendPushToUser(userId, {
        title,
        body: message,
        url,              // Primary: SW uses this URL
        projectId,        // Fallback: SW can generate URL from this
        type,             // 'project', 'system', 'social' (for future use)
        tag: `notification-${notification.id}`
      });
    }

    return notification;
  } catch (err) {
    console.error('[Notification] Create error:', err);
    return null;
  }
}

/**
 * Get notifications for a user with pagination
 *
 * @param {string} userId - User ID
 * @param {Object} [options]
 * @param {number} [options.limit=50] - Max notifications to return
 * @param {number} [options.offset=0] - Offset for pagination
 * @param {string} [options.type] - Filter by type
 * @returns {Promise<{notifications: Array, total: number, unreadCount: number}>}
 */
async function getNotifications(userId, options = {}) {
  const limit = Math.min(parseInt(options.limit) || 50, 100);
  const offset = parseInt(options.offset) || 0;
  const type = options.type;

  try {
    // Query notifications with pagination
    let query = supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type && ['project', 'system', 'social'].includes(type)) {
      query = query.eq('type', type);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[Notification] List error:', error.message);
      return { notifications: [], total: 0, unreadCount: 0 };
    }

    // Get total unread count (not just current page)
    const { count: unreadCount, error: unreadError } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (unreadError) {
      console.error('[Notification] Unread count error:', unreadError.message);
    }

    return {
      notifications: data || [],
      total: count || 0,
      unreadCount: unreadCount || 0
    };
  } catch (err) {
    console.error('[Notification] List error:', err);
    return { notifications: [], total: 0, unreadCount: 0 };
  }
}

/**
 * Mark notification as read
 * Sets read_at to server timestamp (not client-provided)
 *
 * @param {string} userId - User ID (for ownership check)
 * @param {string} notificationId - Notification ID
 * @returns {Promise<boolean>}
 */
async function markAsRead(userId, notificationId) {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()  // Server timestamp
      })
      .eq('id', notificationId)
      .eq('user_id', userId);  // Ownership check

    if (error) {
      console.error('[Notification] Mark read error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Notification] Mark read error:', err);
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 * Sets read_at to server timestamp
 *
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of notifications updated
 */
async function markAllAsRead(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('read', false)
      .select('id');

    if (error) {
      console.error('[Notification] Mark all read error:', error.message);
      return 0;
    }

    return data?.length || 0;
  } catch (err) {
    console.error('[Notification] Mark all read error:', err);
    return 0;
  }
}

/**
 * Get unread notification count for a user
 *
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
async function getUnreadCount(userId) {
  try {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.error('[Notification] Count error:', error.message);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('[Notification] Count error:', err);
    return 0;
  }
}

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  isAllowedPushUser
};
