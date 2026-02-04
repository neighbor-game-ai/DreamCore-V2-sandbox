/**
 * Public Profile Routes
 *
 * Express routes for public profile pages (no authentication required).
 * Mounted at root level for /u/:id route.
 */

const express = require('express');
const path = require('path');
const router = express.Router();

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => UUID_REGEX.test(str);

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
