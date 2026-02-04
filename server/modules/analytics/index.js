/**
 * Analytics Routes
 *
 * Express routes for event tracking.
 * Mounted at /api/analytics
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../../authMiddleware');
const { enrichEventData } = require('./enrichment');
const {
  isValidEventType,
  createSession,
  insertEvents,
  upsertDevice,
  linkUserToSession,
  endSession,
  getSession,
} = require('./ingest');

// JSON body size limit (64KB for batch events)
const jsonLimit = express.json({ limit: '64kb' });

// UUID validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => str && UUID_REGEX.test(str);

/**
 * POST /api/analytics/session
 * Start a new session
 *
 * Body:
 * {
 *   device_id: string,
 *   first_path: string,
 *   referrer?: string,
 *   utm_source?: string,
 *   utm_medium?: string,
 *   utm_campaign?: string,
 *   utm_term?: string,
 *   utm_content?: string,
 *   timezone?: string,
 *   screen?: string
 * }
 *
 * Response: { session_id: string }
 */
router.post('/session', optionalAuth, jsonLimit, async (req, res) => {
  try {
    const {
      device_id,
      first_path,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      timezone,
      screen,
    } = req.body;

    // Validate device_id
    if (!device_id || typeof device_id !== 'string') {
      return res.status(400).json({ error: 'device_id is required' });
    }

    // Get user_id if authenticated
    const userId = req.user?.id || null;

    // Enrich with country from headers
    const enriched = enrichEventData(req, {});

    // Create session
    const session = await createSession({
      device_id,
      user_id: userId,
      first_path: first_path || '/',
      referrer: referrer || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null,
      country: enriched.country,
      timezone: timezone || null,
    });

    // Upsert device (async, don't wait)
    upsertDevice({
      device_id,
      user_id: userId,
      os: enriched.os,
      browser: enriched.browser,
      screen: screen || null,
    }).catch(() => {}); // Ignore errors

    res.json({ session_id: session.id });
  } catch (err) {
    console.error('POST /api/analytics/session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/session/:id/end
 * End a session
 */
router.post('/session/:id/end', jsonLimit, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid session_id' });
    }

    await endSession(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/analytics/session/:id/end error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/track
 * Track events (batch)
 *
 * Body:
 * {
 *   device_id: string,
 *   session_id: string,
 *   events: [
 *     {
 *       event_type: string,
 *       event_ts?: string (ISO),
 *       path?: string,
 *       properties?: object
 *     }
 *   ]
 * }
 *
 * Response: { ok: true, count: number }
 */
router.post('/track', optionalAuth, jsonLimit, async (req, res) => {
  try {
    const { device_id, session_id, events } = req.body;

    // Validate required fields
    if (!device_id || typeof device_id !== 'string') {
      return res.status(400).json({ error: 'device_id is required' });
    }

    if (!session_id || !isValidUUID(session_id)) {
      return res.status(400).json({ error: 'Valid session_id is required' });
    }

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required' });
    }

    // Limit batch size
    if (events.length > 100) {
      return res.status(400).json({ error: 'Max 100 events per batch' });
    }

    // Validate event types
    const invalidTypes = events
      .filter(e => !isValidEventType(e.event_type))
      .map(e => e.event_type);

    if (invalidTypes.length > 0) {
      return res.status(400).json({
        error: `Invalid event_type: ${invalidTypes.join(', ')}`,
      });
    }

    // Get user_id if authenticated
    const userId = req.user?.id || null;

    // Insert events
    const count = await insertEvents(events, session_id, userId);

    // Update device last_seen (async)
    const enriched = enrichEventData(req, {});
    upsertDevice({
      device_id,
      user_id: userId,
      os: enriched.os,
      browser: enriched.browser,
    }).catch(() => {});

    res.json({ ok: true, count });
  } catch (err) {
    console.error('POST /api/analytics/track error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/link
 * Link user to session after login
 *
 * Body:
 * {
 *   session_id: string,
 *   device_id: string
 * }
 */
router.post('/link', optionalAuth, jsonLimit, async (req, res) => {
  try {
    const { session_id, device_id } = req.body;

    // Must be authenticated
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!session_id || !isValidUUID(session_id)) {
      return res.status(400).json({ error: 'Valid session_id is required' });
    }

    if (!device_id) {
      return res.status(400).json({ error: 'device_id is required' });
    }

    await linkUserToSession(req.user.id, session_id, device_id);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/analytics/link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
