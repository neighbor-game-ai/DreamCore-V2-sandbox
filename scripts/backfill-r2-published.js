require('dotenv').config();

const { supabaseAdmin } = require('../server/supabaseClient');
const r2Publisher = require('../server/r2Publisher');
const r2Client = require('../server/r2Client');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const PAGE_SIZE = 100;

const fetchPublishedGames = async () => {
  const results = [];
  let offset = 0;

  while (true) {
    let query = supabaseAdmin
      .from('published_games')
      .select('id, public_id, project_id, user_id, thumbnail_url')
      .order('published_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch published_games: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    results.push(...data);

    if (limit && results.length >= limit) {
      return results.slice(0, limit);
    }

    offset += PAGE_SIZE;
  }

  return results;
};

const updateThumbnailUrl = async (gameId, thumbnailUrl) => {
  const { error } = await supabaseAdmin
    .from('published_games')
    .update({ thumbnail_url: thumbnailUrl, updated_at: new Date().toISOString() })
    .eq('id', gameId);

  if (error) {
    throw new Error(`Failed to update thumbnail_url for ${gameId}: ${error.message}`);
  }
};

const run = async () => {
  if (!r2Client.isR2Enabled()) {
    throw new Error('R2 is not configured. Check R2_* environment variables.');
  }

  const games = await fetchPublishedGames();
  console.log(`[Backfill] Found ${games.length} published games.`);

  let success = 0;
  let failed = 0;

  for (const game of games) {
    const label = `${game.public_id} (project ${game.project_id})`;
    try {
      console.log(`[Backfill] Uploading ${label}...`);
      if (!isDryRun) {
        const result = await r2Publisher.uploadProjectToR2({
          projectId: game.project_id,
          publicId: game.public_id,
          userId: game.user_id
        });

        if (result.thumbnailUrl && result.thumbnailUrl !== game.thumbnail_url) {
          await updateThumbnailUrl(game.id, result.thumbnailUrl);
          console.log(`[Backfill] Updated thumbnail_url for ${game.public_id}`);
        }
      }
      success += 1;
    } catch (err) {
      failed += 1;
      console.error(`[Backfill] Failed ${label}:`, err.message);
    }
  }

  console.log(`[Backfill] Done. success=${success}, failed=${failed}, dryRun=${isDryRun}`);
};

run().catch(err => {
  console.error('[Backfill] Fatal:', err.message);
  process.exit(1);
});
