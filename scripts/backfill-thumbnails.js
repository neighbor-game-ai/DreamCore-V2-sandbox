#!/usr/bin/env node
/**
 * Backfill thumbnails for published games with legacy thumbnail_url format.
 *
 * Usage:
 *   node scripts/backfill-thumbnails.js              # dry-run (default)
 *   node scripts/backfill-thumbnails.js --execute    # actually run
 *   node scripts/backfill-thumbnails.js --limit=5    # process 5 games
 *   node scripts/backfill-thumbnails.js --offset=10  # skip first 10
 *   node scripts/backfill-thumbnails.js --execute --limit=5
 */

require('dotenv').config();

const { supabaseAdmin } = require('../server/supabaseClient');
const thumbnailGenerator = require('../server/thumbnailGenerator');
const r2Client = require('../server/r2Client');
const { getProjectPath } = require('../server/config');
const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const limitArg = args.find(a => a.startsWith('--limit='));
const offsetArg = args.find(a => a.startsWith('--offset='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const offset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;

// Config
const RETRY_COUNT = 2;
const INTERVAL_MS = 3000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchTargetGames = async () => {
  console.log('[Backfill] Fetching games with legacy thumbnail_url...');

  let query = supabaseAdmin
    .from('published_games')
    .select(`
      id,
      public_id,
      project_id,
      user_id,
      title,
      thumbnail_url,
      projects!inner(name)
    `)
    .like('thumbnail_url', '/api/projects/%')
    .order('published_at', { ascending: false });

  if (limit) {
    query = query.range(offset, offset + limit - 1);
  } else if (offset > 0) {
    query = query.range(offset, offset + 999); // Max 1000
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch games: ${error.message}`);
  }

  return data || [];
};

const readSpecContent = (userId, projectId) => {
  const projectDir = getProjectPath(userId, projectId);
  const specPaths = [
    path.join(projectDir, 'specs', 'game.md'),
    path.join(projectDir, 'spec.md')
  ];

  for (const specPath of specPaths) {
    if (fs.existsSync(specPath)) {
      return fs.readFileSync(specPath, 'utf-8');
    }
  }

  return '';
};

const processGame = async (game, index, total) => {
  const label = `[${index + 1}/${total}] ${game.public_id} "${game.title}"`;

  console.log(`\n${label}`);
  console.log(`  Current: ${game.thumbnail_url}`);

  if (isDryRun) {
    console.log(`  [DRY-RUN] Would generate thumbnail`);
    return { status: 'skipped', reason: 'dry-run' };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= RETRY_COUNT + 1; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`  Retry ${attempt - 1}/${RETRY_COUNT}...`);
      }

      const specContent = readSpecContent(game.user_id, game.project_id);

      await thumbnailGenerator.generateThumbnailAsync({
        projectId: game.project_id,
        publicId: game.public_id,
        userId: game.user_id,
        title: game.title,
        specContent
      });

      // Verify update
      const { data: updated } = await supabaseAdmin
        .from('published_games')
        .select('thumbnail_url')
        .eq('id', game.id)
        .single();

      if (updated?.thumbnail_url?.startsWith('https://')) {
        console.log(`  ✓ Updated: ${updated.thumbnail_url}`);
        return { status: 'success', url: updated.thumbnail_url };
      } else {
        console.log(`  ⚠ Generated but URL not updated`);
        return { status: 'partial', url: updated?.thumbnail_url };
      }

    } catch (err) {
      lastError = err;
      console.error(`  ✗ Error: ${err.message}`);

      if (attempt <= RETRY_COUNT) {
        await sleep(INTERVAL_MS);
      }
    }
  }

  return { status: 'failed', error: lastError?.message };
};

const run = async () => {
  console.log('='.repeat(60));
  console.log('Thumbnail Backfill Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (use --execute to run)' : 'EXECUTE'}`);
  console.log(`Limit: ${limit || 'none'}`);
  console.log(`Offset: ${offset}`);
  console.log(`Retry: ${RETRY_COUNT}`);
  console.log(`Interval: ${INTERVAL_MS}ms`);
  console.log('');

  if (!r2Client.isR2Enabled()) {
    console.error('ERROR: R2 is not configured. Check R2_* environment variables.');
    process.exit(1);
  }

  const games = await fetchTargetGames();
  console.log(`Found ${games.length} games with legacy thumbnail_url`);

  if (games.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  const results = {
    success: 0,
    partial: 0,
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
  console.log(`Partial: ${results.partial}`);
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
