/**
 * Asset access control middleware
 *
 * Middleware for checking asset ownership and access rights.
 * Used by asset API routes.
 */

const db = require('../database-supabase');
const { isValidUUID } = require('../config');

/**
 * Check asset ownership and attach to req (requires authentication)
 * - Validates asset ID format
 * - Checks asset exists
 * - Verifies req.user.id === asset.owner_id
 * - Attaches asset to req.asset
 */
const checkAssetOwnership = async (req, res, next) => {
  const assetId = req.params.id;
  if (!isValidUUID(assetId)) {
    return res.status(400).json({ error: 'Invalid asset ID' });
  }
  const asset = await db.getAssetById(req.supabase, assetId);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  if (asset.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  req.asset = asset;
  next();
};

/**
 * Check asset access for public/owner (optional auth)
 * - Uses admin client to bypass RLS for public asset check
 * - Allows access if: owner OR public/global
 * - Returns 404 for not found or access denied (security)
 * - Attaches asset to req.asset
 */
const checkAssetAccess = async (req, res, next) => {
  const assetId = req.params.id;
  if (!isValidUUID(assetId)) {
    return res.status(400).json({ error: 'Invalid asset ID' });
  }
  // Use admin client to bypass RLS for public asset check
  const asset = await db.getAssetByIdAdmin(assetId);
  if (!asset || asset.is_deleted) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  // Allow access if: owner OR public
  const isOwner = req.user?.id === asset.owner_id;
  const isPublic = asset.is_public || asset.is_global;
  if (!isOwner && !isPublic) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  req.asset = asset;
  next();
};

module.exports = {
  checkAssetOwnership,
  checkAssetAccess
};
