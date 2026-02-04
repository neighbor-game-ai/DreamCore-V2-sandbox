/**
 * Analytics Ingest
 *
 * Event ingestion and storage logic.
 */

const { supabaseAdmin } = require('../../supabaseClient');

// Valid event types (matches DB constraint)
const VALID_EVENT_TYPES = new Set([
  // Initial release
  'page_view', 'login', 'logout',
  'game_play', 'game_create', 'game_publish',
  'error',
  // Future expansion
  'button_click', 'form_submit', 'scroll_depth',
  // AI generation metrics
  'ai_request', 'ai_response',
  'suggestion_shown', 'suggestion_click',
]);

// Max properties size (4KB)
const MAX_PROPERTIES_SIZE = 4096;

/**
 * Validate event type
 * @param {string} eventType
 * @returns {boolean}
 */
function isValidEventType(eventType) {
  return VALID_EVENT_TYPES.has(eventType);
}

/**
 * Validate properties size
 * @param {object} properties
 * @returns {boolean}
 */
function isValidPropertiesSize(properties) {
  if (!properties) return true;
  const size = JSON.stringify(properties).length;
  return size <= MAX_PROPERTIES_SIZE;
}

/**
 * Create a new session
 * @param {object} data - Session data
 * @returns {Promise<object>} - Created session
 */
async function createSession(data) {
  const {
    device_id,
    user_id,
    first_path,
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    country,
    timezone,
  } = data;

  const { data: session, error } = await supabaseAdmin
    .from('user_sessions')
    .insert({
      device_id,
      user_id: user_id || null,
      first_path,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      country,
      timezone,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Analytics] createSession error:', error.message);
    throw error;
  }

  return session;
}

/**
 * Insert events in batch
 * @param {Array} events - Array of event objects
 * @param {string} sessionId - Session ID
 * @param {string|null} userId - User ID (can be null for pre-login)
 * @returns {Promise<number>} - Number of events inserted
 */
async function insertEvents(events, sessionId, userId = null) {
  if (!events || events.length === 0) return 0;

  // Validate and prepare events
  const validEvents = [];
  for (const event of events) {
    // Validate event type
    if (!isValidEventType(event.event_type)) {
      console.warn(`[Analytics] Invalid event_type: ${event.event_type}`);
      continue;
    }

    // Validate properties size
    if (!isValidPropertiesSize(event.properties)) {
      console.warn(`[Analytics] Properties too large for event: ${event.event_type}`);
      continue;
    }

    validEvents.push({
      user_id: userId,
      session_id: sessionId,
      event_type: event.event_type,
      event_ts: event.event_ts || new Date().toISOString(),
      path: event.path || null,
      properties: event.properties || null,
    });
  }

  if (validEvents.length === 0) return 0;

  const { error } = await supabaseAdmin
    .from('user_events')
    .insert(validEvents);

  if (error) {
    console.error('[Analytics] insertEvents error:', error.message);
    throw error;
  }

  return validEvents.length;
}

/**
 * Upsert device information
 * @param {object} data - Device data
 * @returns {Promise<void>}
 */
async function upsertDevice(data) {
  const { device_id, user_id, os, browser, screen } = data;

  const { error } = await supabaseAdmin.rpc('upsert_device', {
    p_device_id: device_id,
    p_user_id: user_id || null,
    p_os: os || null,
    p_browser: browser || null,
    p_screen: screen || null,
  });

  if (error) {
    console.error('[Analytics] upsertDevice error:', error.message);
    // Don't throw - device upsert failure shouldn't block event tracking
  }
}

/**
 * Link user to session after login
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
async function linkUserToSession(userId, sessionId, deviceId) {
  const { error } = await supabaseAdmin.rpc('link_user_to_session', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_device_id: deviceId,
  });

  if (error) {
    console.error('[Analytics] linkUserToSession error:', error.message);
    throw error;
  }
}

/**
 * End a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
async function endSession(sessionId) {
  const { error } = await supabaseAdmin.rpc('end_session', {
    p_session_id: sessionId,
  });

  if (error) {
    console.error('[Analytics] endSession error:', error.message);
    // Don't throw - session end failure shouldn't block anything
  }
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>}
 */
async function getSession(sessionId) {
  const { data, error } = await supabaseAdmin
    .from('user_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[Analytics] getSession error:', error.message);
    return null;
  }

  return data;
}

module.exports = {
  VALID_EVENT_TYPES,
  isValidEventType,
  isValidPropertiesSize,
  createSession,
  insertEvents,
  upsertDevice,
  linkUserToSession,
  endSession,
  getSession,
};
