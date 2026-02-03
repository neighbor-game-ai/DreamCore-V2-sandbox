#!/usr/bin/env node
/**
 * Backfill user/global assets to R2 CDN.
 *
 * Usage:
 *   node scripts/backfill-assets-r2.js              # dry-run (default)
 *   node scripts/backfill-assets-r2.js --execute    # actually run
 *   node scripts/backfill-assets-r2.js --limit=10   # process 10 assets
 *   node scripts/backfill-assets-r2.js --offset=50  # skip first 50
 *   node scripts/backfill-assets-r2.js --user-only  # only user assets
 *   node scripts/backfill-assets-r2.js --global-only # only global assets
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../server/supabaseClient');
const r2Client = require('../server/r2Client');
const assetPublisher = require('../server/assetPublisher');
const config = require('../server/config');

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const userOnly = args.includes('--user-only');
const globalOnly = args.includes('--global-only');
const limitArg = args.find(a => a.startsWith('--limit='));
const offsetArg = args.find(a => a.startsWith('--offset='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const offset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;

// Config
const RETRY_COUNT = 2;
const INTERVAL_MS = 100; // 100ms between uploads (10/sec)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchAssets = async () => {
  console.log('[Backfill] Fetching assets...');

  let query = supabaseAdmin
    .from('assets')
    .select('id, owner_id, alias, storage_path, is_global, category')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  // Filter by type
  if (userOnly) {
    query = query.eq('is_global', false);
  } else if (globalOnly) {
    query = query.eq('is_global', true);
  }

  // Apply pagination
  if (limit) {
    query = query.range(offset, offset + limit - 1);
  } else if (offset > 0) {
    query = query.range(offset, offset + 9999); // Max 10000
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch assets: ${error.message}`);
  }

  return data || [];
};

const resolveStoragePath = (asset) => {
  // The storage_path in DB might be from different environments
  // Try to find the file in multiple locations

  const originalPath = asset.storage_path;

  // 1. Direct path (works in local dev)
  if (fs.existsSync(originalPath)) {
    return originalPath;
  }

  // 2. Try sandbox path (DreamCore-V2-sandbox)
  if (originalPath.includes('/DreamCore-V2/')) {
    const sandboxPath = originalPath.replace('/DreamCore-V2/', '/DreamCore-V2-sandbox/');
    if (fs.existsSync(sandboxPath)) {
      return sandboxPath;
    }
  }

  // 3. Try constructing path from userId/alias
  if (!asset.is_global && asset.owner_id && asset.alias) {
    const userAssetsDir = config.getUserAssetsPath(asset.owner_id);
    // Try to find file with matching alias
    if (fs.existsSync(userAssetsDir)) {
      const files = fs.readdirSync(userAssetsDir);
      const matching = files.find(f => f.includes(asset.alias) || asset.alias.includes(f.replace(/^[a-f0-9]+_/, '')));
      if (matching) {
        return path.join(userAssetsDir, matching);
      }
    }
  }

  // 4. For global assets, try global assets dir
  if (asset.is_global && asset.category && asset.alias) {
    const globalDir = config.getGlobalAssetsPath(asset.category);
    const globalPath = path.join(globalDir, asset.alias);
    if (fs.existsSync(globalPath)) {
      return globalPath;
    }
  }

  return null;
};

const processAsset = async (asset, index, total) => {
  const typeLabel = asset.is_global ? 'global' : 'user';
  const identifier = asset.is_global
    ? `${asset.category}/${asset.alias}`
    : `${asset.owner_id}/${asset.alias}`;

  const label = `[${index + 1}/${total}] ${typeLabel}: ${identifier}`;

  console.log(`\n${label}`);

  if (isDryRun) {
    const storagePath = resolveStoragePath(asset);
    if (storagePath) {
      console.log(`  [DRY-RUN] Would upload from: ${storagePath}`);
      return { status: 'skipped', reason: 'dry-run' };
    } else {
      console.log(`  [DRY-RUN] File not found (original: ${asset.storage_path})`);
      return { status: 'not_found', reason: 'file-not-found' };
    }
  }

  // Find actual file
  const storagePath = resolveStoragePath(asset);
  if (!storagePath) {
    console.log(`  ✗ File not found: ${asset.storage_path}`);
    return { status: 'not_found', reason: 'file-not-found' };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= RETRY_COUNT + 1; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`  Retry ${attempt - 1}/${RETRY_COUNT}...`);
      }

      let cdnUrl;
      if (asset.is_global) {
        cdnUrl = await assetPublisher.uploadGlobalAssetToR2(asset.category, asset.alias, storagePath);
      } else {
        cdnUrl = await assetPublisher.uploadUserAssetToR2(asset.owner_id, asset.alias, storagePath);
      }

      console.log(`  ✓ Uploaded: ${cdnUrl}`);
      return { status: 'success', url: cdnUrl };

    } catch (err) {
      lastError = err;
      console.error(`  ✗ Error: ${err.message}`);

      if (attempt <= RETRY_COUNT) {
        await sleep(INTERVAL_MS * 10); // Longer wait on retry
      }
    }
  }

  return { status: 'failed', error: lastError?.message };
};

const run = async () => {
  console.log('='.repeat(60));
  console.log('Asset R2 Backfill Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (use --execute to run)' : 'EXECUTE'}`);
  console.log(`Filter: ${userOnly ? 'USER ONLY' : globalOnly ? 'GLOBAL ONLY' : 'ALL'}`);
  console.log(`Limit: ${limit || 'none'}`);
  console.log(`Offset: ${offset}`);
  console.log(`Retry: ${RETRY_COUNT}`);
  console.log(`Interval: ${INTERVAL_MS}ms`);
  console.log('');

  if (!r2Client.isR2Enabled()) {
    console.error('ERROR: R2 is not configured. Check R2_* environment variables.');
    process.exit(1);
  }

  const assets = await fetchAssets();
  console.log(`Found ${assets.length} assets`);

  if (assets.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  const results = {
    success: 0,
    failed: 0,
    not_found: 0,
    skipped: 0
  };

  for (let i = 0; i < assets.length; i++) {
    const result = await processAsset(assets[i], i, assets.length);
    results[result.status]++;

    // Wait between requests (except after last)
    if (!isDryRun && i < assets.length - 1) {
      await sleep(INTERVAL_MS);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total:     ${assets.length}`);
  console.log(`Success:   ${results.success}`);
  console.log(`Failed:    ${results.failed}`);
  console.log(`Not Found: ${results.not_found}`);
  console.log(`Skipped:   ${results.skipped}`);

  if (isDryRun) {
    console.log('\n[DRY-RUN] No changes made. Use --execute to run.');
  }
};

run().catch(err => {
  console.error('\n[Fatal]', err.message);
  process.exit(1);
});
