#!/usr/bin/env node
/**
 * Re-upload published games to R2 with correct ASSET_BASE_URL.
 *
 * This script fixes games that were uploaded with empty ASSET_BASE_URL
 * by re-uploading them from Modal/local storage.
 *
 * Usage:
 *   node scripts/reupload-games-r2.js              # dry-run (default)
 *   node scripts/reupload-games-r2.js --execute    # actually run
 *   node scripts/reupload-games-r2.js --limit=5    # process 5 games
 */

require('dotenv').config();

const { supabaseAdmin } = require('../server/supabaseClient');
const r2Publisher = require('../server/r2Publisher');
const r2Client = require('../server/r2Client');
const config = require('../server/config');
const userManager = require('../server/userManager');

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

// Config
const INTERVAL_MS = 2000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchGames = async () => {
  console.log('[Reupload] Fetching published games...');

  let query = supabaseAdmin
    .from('published_games')
    .select(`
      id,
      public_id,
      project_id,
      user_id,
      title
    `)
    .order('published_at', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch games: ${error.message}`);
  }

  return data || [];
};

const processGame = async (game, index, total) => {
  const label = `[${index + 1}/${total}] ${game.public_id} "${game.title}"`;

  console.log(`\n${label}`);

  if (isDryRun) {
    console.log(`  [DRY-RUN] Would re-upload to R2`);
    return { status: 'skipped', reason: 'dry-run' };
  }

  try {
    // Sync from Modal if needed
    if (config.USE_MODAL) {
      console.log(`  Syncing from Modal...`);
      await userManager.syncFromModal(game.user_id, game.project_id);
    }

    // Re-upload to R2
    console.log(`  Uploading to R2...`);
    const result = await r2Publisher.uploadProjectToR2({
      projectId: game.project_id,
      publicId: game.public_id,
      userId: game.user_id
    });

    console.log(`  ✓ Uploaded ${result.uploadedCount} files`);
    console.log(`  ✓ ASSET_BASE_URL: ${result.assetBaseUrl}`);

    return { status: 'success', files: result.uploadedCount };
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    return { status: 'failed', error: err.message };
  }
};

const run = async () => {
  console.log('='.repeat(60));
  console.log('Game R2 Re-upload Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (use --execute to run)' : 'EXECUTE'}`);
  console.log(`Limit: ${limit || 'all'}`);
  console.log(`Interval: ${INTERVAL_MS}ms`);
  console.log('');

  if (!r2Client.isR2Enabled()) {
    console.error('ERROR: R2 is not configured. Check R2_* environment variables.');
    process.exit(1);
  }

  // Show current ASSET_BASE_URL
  const testBaseUrl = r2Publisher.uploadProjectToR2 ? 'checking...' : 'N/A';
  console.log(`R2_PUBLIC_BASE_URL: ${config.R2_PUBLIC_BASE_URL}`);
  console.log('');

  const games = await fetchGames();
  console.log(`Found ${games.length} published games`);

  if (games.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  const results = {
    success: 0,
    failed: 0,
    skipped: 0
  };

  for (let i = 0; i < games.length; i++) {
    const result = await processGame(games[i], i, games.length);
    results[result.status]++;

    // Wait between requests (except after last)
    if (!isDryRun && i < games.length - 1) {
      await sleep(INTERVAL_MS);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total:   ${games.length}`);
  console.log(`Success: ${results.success}`);
  console.log(`Failed:  ${results.failed}`);
  console.log(`Skipped: ${results.skipped}`);

  if (isDryRun) {
    console.log('\n[DRY-RUN] No changes made. Use --execute to run.');
  }
};

run().catch(err => {
  console.error('\n[Fatal]', err.message);
  process.exit(1);
});
