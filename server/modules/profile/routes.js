/**
 * Profile Routes
 *
 * Express routes for user profile management.
 * Mounted at /api/users
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const os = require('os');
const { authenticate } = require('../../authMiddleware');
const db = require('../../database-supabase');
const { validateSocialLinks, normalizeSocialLinks } = require('./validators');
const { processAvatar } = require('./service');
const r2Client = require('../../r2Client');

// Temp file storage in os.tmpdir()
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// JSON body size limit (64KB)
const jsonLimit = express.json({ limit: '64kb' });

/**
 * GET /api/users/me
 * Get current user's full profile (private fields included)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.getCurrentUser(req.supabase, req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/users/me
 * Update current user's profile
 */
router.patch('/me', authenticate, jsonLimit, async (req, res) => {
  try {
    let { display_name, bio, social_links } = req.body;

    // Normalize empty strings to null
    display_name = display_name?.trim() || null;
    bio = bio?.trim() || null;

    // Validate display_name length
    if (display_name && display_name.length > 50) {
      return res.status(400).json({ error: 'display_name max 50 chars' });
    }

    // Validate bio length (TikTok/X style: 160 chars max)
    if (bio && bio.length > 160) {
      return res.status(400).json({ error: 'bio max 160 chars' });
    }

    // Normalize then validate social_links
    let normalizedLinks = null;
    if (social_links) {
      normalizedLinks = normalizeSocialLinks(social_links);
      const validation = validateSocialLinks(normalizedLinks);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
    }

    const updated = await db.updateUserProfile(req.supabase, req.user.id, {
      display_name,
      bio,
      social_links: normalizedLinks
    });

    if (!updated) {
      return res.status(500).json({ error: 'Update failed' });
    }

    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/users/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/users/me/avatar
 * Upload and update avatar image
 */
router.post('/me/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Check if R2 is enabled
  if (!r2Client.isR2Enabled()) {
    // Clean up temp file
    const fs = require('fs');
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(503).json({ error: 'Avatar upload not available (R2 not configured)' });
  }

  try {
    const avatarUrl = await processAvatar(req.file.path, req.user.id);

    // Update user profile with new avatar URL
    const updated = await db.updateUserProfile(req.supabase, req.user.id, {
      avatar_url: avatarUrl
    });

    if (!updated) {
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('POST /api/users/me/avatar error:', err);
    res.status(400).json({ error: err.message });
  }
});

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => UUID_REGEX.test(str);

// CLI Deploy (conditional load)
const cliDeploy = process.env.SUPABASE_CLI_URL ? require('../../../cli-deploy/server') : null;

/**
 * GET /api/users/:id/games
 * Get user's public games for profile page
 * CRITICAL: Returns only visibility='public' games
 * Note: Rate limiting is handled by /api middleware (publicRateLimiter)
 */
router.get('/:id/games', async (req, res) => {
  try {
    const { id } = req.params;

    const isUUID = isValidUUID(id);
    const isPublicId = /^u_[A-Za-z0-9]{10}$/.test(id);

    if (!isUUID && !isPublicId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Resolve public_id to UUID if needed
    let userId = id;
    if (isPublicId) {
      const user = await db.getUserByPublicId(id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      userId = user.id;
    }

    // Get Play games (visibility='public' enforced in DB function)
    const playGames = await db.getPublishedGamesByUserIdPublic(userId);

    // Get CLI games (filter visibility='public')
    let cliGames = [];
    if (cliDeploy) {
      try {
        const allCliGames = await cliDeploy.getCliPublishedGamesByUserId(userId);
        // CRITICAL: Filter visibility='public' for CLI games
        cliGames = (allCliGames || []).filter(g => g.visibility === 'public');
      } catch (e) {
        console.error('[Profile] CLI games fetch error:', e.message);
        // Continue with Play games only
      }
    }

    // Merge and sort by published_at
    const games = [
      ...playGames.map(g => ({
        id: g.id,
        public_id: g.public_id,
        project_id: g.project_id,
        title: g.title,
        description: g.description,
        thumbnail_url: g.thumbnail_url,
        published_at: g.published_at,
        play_count: g.play_count || 0,
        like_count: g.like_count || 0,
        is_cli_game: false,
      })),
      ...cliGames.map(g => ({
        id: g.id,
        public_id: g.public_id,
        project_id: g.project_id,
        title: g.title,
        description: g.description,
        thumbnail_url: g.thumbnail_url,
        published_at: g.published_at,
        play_count: g.play_count || 0,
        like_count: g.like_count || 0,
        is_cli_game: true,
      })),
    ].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    res.json({ games });
  } catch (err) {
    console.error('GET /api/users/:id/games error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:id/public
 * Get user's public profile
 * Supports both UUID and public_id (u_XXXXXXXXXX)
 */
router.get('/:id/public', async (req, res) => {
  try {
    const { id } = req.params;

    const isUUID = isValidUUID(id);
    const isPublicId = /^u_[A-Za-z0-9]{10}$/.test(id);

    if (!isUUID && !isPublicId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    let user;
    if (isPublicId) {
      user = await db.getUserByPublicId(id);
    } else {
      user = await db.getUserPublicProfile(id);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('GET /api/users/:id/public error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
