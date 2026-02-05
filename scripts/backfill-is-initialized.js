#!/usr/bin/env node
/**
 * Backfill is_initialized flag for projects.
 *
 * This script determines the correct is_initialized value for each project
 * using a hierarchical judgment approach:
 *
 * 1. DB evidence (no Modal I/O needed):
 *    - published_games exists → true
 *    - activity_log has update/remix/restore → true
 *
 * 2. Modal evidence (only if DB cannot determine):
 *    - git commit count >= 2 → true
 *    - git commit count = 0 → false
 *    - git commit count = 1 → check index.html content
 *      - matches initial template → false
 *      - differs from template → true
 *
 * Usage:
 *   node scripts/backfill-is-initialized.js              # dry-run (default)
 *   node scripts/backfill-is-initialized.js --execute    # actually run
 *   node scripts/backfill-is-initialized.js --limit=10   # process 10 projects
 *   node scripts/backfill-is-initialized.js --offset=50  # skip first 50
 *   node scripts/backfill-is-initialized.js --batch-size=100  # DB batch size
 *   node scripts/backfill-is-initialized.js --concurrency=5   # Modal concurrency
 */

require('dotenv').config();

const crypto = require('crypto');
const { supabaseAdmin } = require('../server/supabaseClient');
const modalClient = require('../server/modalClient');
const config = require('../server/config');

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const limitArg = args.find(a => a.startsWith('--limit='));
const offsetArg = args.find(a => a.startsWith('--offset='));
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const concurrencyArg = args.find(a => a.startsWith('--concurrency='));

const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const OFFSET = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 100;
const MODAL_CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 5;

// ============================================================================
// Initial Template (must match userManager.js)
// ============================================================================

const INITIAL_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Game</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FAFAFA;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-font-smoothing: antialiased;
    }
    .welcome {
      text-align: center;
      padding: 40px;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #FF3B30 0%, #FF6B6B 100%);
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 32px;
      box-shadow: 0 8px 32px rgba(255, 59, 48, 0.3);
    }
    .icon svg {
      width: 40px;
      height: 40px;
      color: white;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      color: #171717;
      letter-spacing: -0.03em;
      margin-bottom: 12px;
    }
    p {
      font-size: 1rem;
      color: #525252;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="welcome">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
      </svg>
    </div>
    <h1>Welcome to Game Creator!</h1>
    <p>Send a message to start creating your game.</p>
  </div>
</body>
</html>`;

// Hash for quick comparison
const INITIAL_HTML_HASH = crypto.createHash('sha256').update(INITIAL_HTML_TEMPLATE).digest('hex');

// ============================================================================
// Statistics
// ============================================================================

const stats = {
  total: 0,
  dbDeterminedTrue: 0,
  modalTrue: 0,
  modalFalse: 0,
  updatedTrue: 0,
  updatedFalse: 0,
  errors: 0,
  skipped: 0,
};

// ============================================================================
// Health Check
// ============================================================================

async function healthCheck() {
  console.log('[Health Check] Verifying connections...');

  // Check Supabase
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id')
      .limit(1);
    if (error) throw error;
    console.log('  ✓ Supabase connected');
  } catch (err) {
    console.error('  ✗ Supabase connection failed:', err.message);
    return false;
  }

  // Check Modal (if USE_MODAL is enabled)
  if (config.USE_MODAL) {
    try {
      // Try to list files for a non-existent project (should return empty array)
      const files = await modalClient.listFiles('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
      console.log('  ✓ Modal connected');
    } catch (err) {
      console.error('  ✗ Modal connection failed:', err.message);
      return false;
    }
  } else {
    console.log('  ⚠ Modal disabled (USE_MODAL=false), skipping Modal checks');
  }

  return true;
}

// ============================================================================
// DB Evidence Check
// ============================================================================

async function getDbEvidence(projectIds) {
  // Get projects with published_games
  const { data: published, error: pubError } = await supabaseAdmin
    .from('published_games')
    .select('project_id')
    .in('project_id', projectIds);

  if (pubError) {
    console.error('[DB] published_games query error:', pubError.message);
  }

  const publishedSet = new Set((published || []).map(p => p.project_id));

  // Get projects with activity_log (update/remix/restore)
  // activity_log uses target_type='project' and target_id for project identification
  const { data: activities, error: actError } = await supabaseAdmin
    .from('activity_log')
    .select('target_id')
    .eq('target_type', 'project')
    .in('target_id', projectIds)
    .in('action', ['update', 'remix', 'restore']);

  if (actError) {
    console.error('[DB] activity_log query error:', actError.message);
  }

  const activitySet = new Set((activities || []).map(a => a.target_id));

  return { publishedSet, activitySet };
}

// ============================================================================
// Modal Evidence Check
// ============================================================================

async function checkModalEvidence(userId, projectId) {
  try {
    // Get git log
    const { commits } = await modalClient.gitLog(userId, projectId, 10);
    const commitCount = commits.length;

    if (commitCount >= 2) {
      return { initialized: true, reason: 'git_commits_2+' };
    }

    if (commitCount === 0) {
      return { initialized: false, reason: 'git_no_commits' };
    }

    // commitCount === 1: check index.html content
    const indexHtml = await modalClient.getFile(userId, projectId, 'index.html');

    if (!indexHtml) {
      return { initialized: false, reason: 'no_index_html' };
    }

    const contentHash = crypto.createHash('sha256').update(indexHtml).digest('hex');

    if (contentHash === INITIAL_HTML_HASH) {
      return { initialized: false, reason: 'initial_template' };
    }

    return { initialized: true, reason: 'modified_content' };

  } catch (err) {
    // If project doesn't exist on Modal, it's not initialized
    if (err.message.includes('404') || err.message.includes('not found')) {
      return { initialized: false, reason: 'not_on_modal' };
    }
    throw err;
  }
}

// ============================================================================
// Process Batch
// ============================================================================

async function processBatch(projects) {
  const projectIds = projects.map(p => p.id);

  // Get DB evidence for all projects in batch
  const { publishedSet, activitySet } = await getDbEvidence(projectIds);

  const results = [];

  // Separate into DB-determined and Modal-needed
  const dbDetermined = [];
  const modalNeeded = [];

  for (const project of projects) {
    if (publishedSet.has(project.id)) {
      dbDetermined.push({ project, initialized: true, reason: 'published_game' });
      stats.dbDeterminedTrue++;
    } else if (activitySet.has(project.id)) {
      dbDetermined.push({ project, initialized: true, reason: 'activity_log' });
      stats.dbDeterminedTrue++;
    } else {
      modalNeeded.push(project);
    }
  }

  results.push(...dbDetermined);

  // Process Modal-needed projects with concurrency limit
  if (config.USE_MODAL && modalNeeded.length > 0) {
    const chunks = [];
    for (let i = 0; i < modalNeeded.length; i += MODAL_CONCURRENCY) {
      chunks.push(modalNeeded.slice(i, i + MODAL_CONCURRENCY));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (project) => {
        try {
          const { initialized, reason } = await checkModalEvidence(
            project.user_id,
            project.id
          );

          if (initialized) {
            stats.modalTrue++;
          } else {
            stats.modalFalse++;
          }

          return { project, initialized, reason };
        } catch (err) {
          console.error(`  ✗ Error checking ${project.id}: ${err.message}`);
          stats.errors++;
          return { project, initialized: null, reason: 'error', error: err.message };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }
  } else if (!config.USE_MODAL && modalNeeded.length > 0) {
    // Modal disabled - mark as skipped
    for (const project of modalNeeded) {
      stats.skipped++;
      results.push({ project, initialized: null, reason: 'modal_disabled' });
    }
  }

  return results;
}

// ============================================================================
// Update Projects
// ============================================================================

async function updateProjects(results) {
  const updates = results.filter(r => r.initialized !== null);

  if (updates.length === 0) {
    return;
  }

  for (const { project, initialized, reason } of updates) {
    if (isDryRun) {
      console.log(`  [DRY-RUN] ${project.id}: ${initialized} (${reason})`);
      if (initialized) {
        stats.updatedTrue++;
      } else {
        stats.updatedFalse++;
      }
    } else {
      const { error } = await supabaseAdmin
        .from('projects')
        .update({ is_initialized: initialized })
        .eq('id', project.id);

      if (error) {
        console.error(`  ✗ Update failed for ${project.id}: ${error.message}`);
        stats.errors++;
      } else {
        console.log(`  ✓ ${project.id}: ${initialized} (${reason})`);
        if (initialized) {
          stats.updatedTrue++;
        } else {
          stats.updatedFalse++;
        }
      }
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function run() {
  console.log('='.repeat(60));
  console.log('Backfill is_initialized Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (use --execute to run)' : 'EXECUTE'}`);
  console.log(`Limit: ${LIMIT || 'none'}`);
  console.log(`Offset: ${OFFSET}`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`Modal Concurrency: ${MODAL_CONCURRENCY}`);
  console.log(`USE_MODAL: ${config.USE_MODAL}`);
  console.log('');

  // Health check
  const healthy = await healthCheck();
  if (!healthy) {
    console.error('\n[Fatal] Health check failed. Aborting.');
    process.exit(1);
  }
  console.log('');

  // Modal client is already initialized as singleton

  // Count total projects
  const { count, error: countError } = await supabaseAdmin
    .from('projects')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    console.error('[Fatal] Failed to count projects:', countError.message);
    process.exit(1);
  }

  const totalToProcess = LIMIT ? Math.min(LIMIT, count - OFFSET) : count - OFFSET;
  console.log(`[Info] Total projects in DB: ${count}`);
  console.log(`[Info] Projects to process: ${totalToProcess}`);
  console.log('');

  // Process in batches
  let processed = 0;
  let currentOffset = OFFSET;

  while (processed < totalToProcess) {
    const batchLimit = Math.min(BATCH_SIZE, totalToProcess - processed);

    console.log(`[Batch] Processing ${processed + 1}-${processed + batchLimit} of ${totalToProcess}...`);

    const { data: projects, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id')
      .order('created_at', { ascending: true })
      .range(currentOffset, currentOffset + batchLimit - 1);

    if (fetchError) {
      console.error('[Fatal] Failed to fetch projects:', fetchError.message);
      process.exit(1);
    }

    if (!projects || projects.length === 0) {
      break;
    }

    stats.total += projects.length;

    const results = await processBatch(projects);
    await updateProjects(results);

    processed += projects.length;
    currentOffset += projects.length;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total processed:     ${stats.total}`);
  console.log(`DB determined true:  ${stats.dbDeterminedTrue}`);
  console.log(`Modal true:          ${stats.modalTrue}`);
  console.log(`Modal false:         ${stats.modalFalse}`);
  console.log(`Updated true:        ${stats.updatedTrue}`);
  console.log(`Updated false:       ${stats.updatedFalse}`);
  console.log(`Skipped:             ${stats.skipped}`);
  console.log(`Errors:              ${stats.errors}`);

  if (isDryRun) {
    console.log('\n[DRY-RUN] No changes made. Use --execute to run.');
  }

  if (stats.errors > 0) {
    console.log('\n[Warning] Some projects had errors. Review logs above.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('\n[Fatal]', err.message);
  process.exit(1);
});
