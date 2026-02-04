/**
 * Public Profile Routes
 *
 * Express routes for public profile pages (no authentication required).
 * Mounted at root level for /u/:id and /@/:username routes.
 */

const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../../database-supabase');
const { USERNAME_REGEX, isReservedUsername } = require('./usernameValidator');

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => UUID_REGEX.test(str);

/**
 * GET /@:username - Profile page by username (e.g., /@notef)
 * Serves profile page directly (no redirect)
 */
router.get('/@:username', async (req, res) => {
  const { username } = req.params;

  // Only serve on v2 domain (not play.dreamcore.gg)
  if (req.isPlayDomain) {
    return res.status(404).send('Not found');
  }

  // Validate username format and reserved words (return 404 - no info leak)
  const normalizedUsername = username.toLowerCase();
  if (!USERNAME_REGEX.test(normalizedUsername) || isReservedUsername(normalizedUsername)) {
    return res.status(404).send('User not found');
  }

  try {
    // Verify user exists
    const user = await db.getUserByUsername(normalizedUsername);

    if (!user) {
      return res.status(404).send('User not found');
    }

    // Serve user.html directly (frontend will fetch data via API)
    return res.sendFile(path.join(__dirname, '../../../public/user.html'));
  } catch (err) {
    console.error('GET /@:username error:', err);
    return res.status(500).send('Internal server error');
  }
});

/**
 * GET /u/:id - Public profile page
 * Supports both UUID and public_id (e.g., u_abc123XYZ0)
 */
router.get('/u/:id', (req, res) => {
  const { id } = req.params;

  // Only serve on v2 domain (not play.dreamcore.gg)
  if (req.isPlayDomain) {
    return res.status(404).send('Not found');
  }

  // Validate ID format
  const isUUID = isValidUUID(id);
  const isPublicId = /^u_[A-Za-z0-9]{10}$/.test(id);

  if (!isUUID && !isPublicId) {
    return res.status(400).send('Invalid user ID');
  }

  // Serve user.html - frontend will fetch data via API
  return res.sendFile(path.join(__dirname, '../../../public/user.html'));
});

module.exports = router;
