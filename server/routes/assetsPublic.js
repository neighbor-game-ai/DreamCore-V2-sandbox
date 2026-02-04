/**
 * Public Asset Serving Routes
 *
 * Handles public asset serving endpoints (root-level URLs):
 * - GET /user-assets/:userId/:alias - Serve user assets by alias
 * - GET /global-assets/:category/:alias - Serve global assets by category and alias
 *
 * These routes support:
 * - R2 CDN redirect (302) when enabled
 * - Local file serving as fallback
 * - Access control (owner + public/global visibility)
 * - Availability period checks
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');

const db = require('../database-supabase');
const { isValidUUID } = require('../config');
const { optionalAuth } = require('../authMiddleware');
const r2Client = require('../r2Client');
const assetPublisher = require('../assetPublisher');

// Serve user assets by alias
// GET /user-assets/:userId/:alias
// With R2 enabled: 302 redirect to CDN (on-demand upload if needed)
router.get('/user-assets/:userId/:alias', optionalAuth, async (req, res) => {
  const { userId, alias } = req.params;

  // Validate userId format
  if (!isValidUUID(userId)) {
    return res.status(404).send('Not found');
  }

  // Get asset by alias (service_role, bypasses RLS)
  const asset = await db.getAssetByAliasAdmin(userId, alias);

  // Check: exists and not deleted
  if (!asset || asset.is_deleted) {
    return res.status(404).send('Not found');
  }

  // Check: availability period (for global assets)
  const now = new Date();
  if (asset.available_from && new Date(asset.available_from) > now) {
    return res.status(404).send('Not found');
  }
  if (asset.available_until && new Date(asset.available_until) < now) {
    return res.status(404).send('Not found');
  }

  // Check: authorization
  const isOwner = req.user?.id === userId;
  const isPublic = asset.is_public || asset.is_global;

  if (!isOwner && !isPublic) {
    return res.status(404).send('Not found');
  }

  // R2 redirect path: check/upload to R2, then 302
  if (r2Client.isR2Enabled()) {
    try {
      const cdnUrl = await assetPublisher.ensureUserAssetOnR2(userId, alias, asset.storage_path);
      if (cdnUrl) {
        return res.redirect(302, cdnUrl);
      }
      // Fall through to local serving if R2 upload failed
    } catch (err) {
      console.error(`[user-assets] R2 redirect failed for ${userId}/${alias}:`, err.message);
      // Fall through to local serving
    }
  }

  // Fallback: serve file locally
  const filePath = asset.storage_path;
  if (!fs.existsSync(filePath)) {
    console.error(`[user-assets] File not found: ${filePath}`);
    return res.status(404).send('Not found');
  }

  res.sendFile(filePath);
});

// Serve global assets by category and alias
// GET /global-assets/:category/:alias
// With R2 enabled: 302 redirect to CDN (on-demand upload if needed)
router.get('/global-assets/:category/:alias', async (req, res) => {
  const { category, alias } = req.params;

  // Get global asset (service_role)
  const asset = await db.getGlobalAssetAdmin(category, alias);

  // Check: exists and not deleted
  if (!asset || asset.is_deleted) {
    return res.status(404).send('Not found');
  }

  // Check: availability period
  const now = new Date();
  if (asset.available_from && new Date(asset.available_from) > now) {
    return res.status(404).send('Not found');
  }
  if (asset.available_until && new Date(asset.available_until) < now) {
    return res.status(404).send('Not found');
  }

  // R2 redirect path: check/upload to R2, then 302
  if (r2Client.isR2Enabled()) {
    try {
      const cdnUrl = await assetPublisher.ensureGlobalAssetOnR2(category, alias, asset.storage_path);
      if (cdnUrl) {
        return res.redirect(302, cdnUrl);
      }
      // Fall through to local serving if R2 upload failed
    } catch (err) {
      console.error(`[global-assets] R2 redirect failed for ${category}/${alias}:`, err.message);
      // Fall through to local serving
    }
  }

  // Fallback: serve file locally
  const filePath = asset.storage_path;
  if (!fs.existsSync(filePath)) {
    console.error(`[global-assets] File not found: ${filePath}`);
    return res.status(404).send('Not found');
  }

  res.sendFile(filePath);
});

module.exports = router;
