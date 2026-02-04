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

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => UUID_REGEX.test(str);

// Username validation regex
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

/**
 * GET /@/:username - Profile page by username
 * Redirects to /u/{public_id} for canonical URL
 */
router.get('/@/:username', async (req, res) => {
  const { username } = req.params;

  // Only serve on v2 domain (not play.dreamcore.gg)
  if (req.isPlayDomain) {
    return res.status(404).send('Not found');
  }

  // Validate username format (return 404 for invalid format - no info leak)
  const normalizedUsername = username.toLowerCase();
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return res.status(404).send('User not found');
  }

  try {
    // Look up user by username
    const user = await db.getUserByUsername(normalizedUsername);

    if (!user) {
      return res.status(404).send('User not found');
    }

    // Redirect to canonical URL with public_id
    const redirectUrl = `/u/${user.public_id}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    return res.redirect(301, redirectUrl);
  } catch (err) {
    console.error('GET /@/:username error:', err);
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
