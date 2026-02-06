// server/engine-v2/index.js
// Engine V2 entry point — orchestrates DAG-based game creation
'use strict';

const { shouldUseV2, isShadowMode, ENGINE_V2_ENABLED, ENGINE_V2_MODE } = require('./featureFlag');
const db = require('./db');
const { buildDag, DEFAULT_WORKFLOW } = require('./dagBuilder');
const { runWorkflow } = require('./scheduler');
const { createTaskExecutor } = require('./taskRunner');
const { createStagingDir, cleanupStagingDir, applyToProduction } = require('./stagingManager');
const { validateOutput, toV1Response } = require('./output');
const modalClient = require('../modalClient');

/**
 * Run the v2 engine for a game creation job.
 *
 * @param {string} userId - JWT-verified user ID
 * @param {string} projectId - Target project ID
 * @param {string} userMessage - User's message
 * @param {object} options
 * @param {string} options.jobId - Job ID from jobManager
 * @param {string} options.prompt - Built prompt
 * @param {string[]} options.detectedSkills - Skills detected in message
 * @param {function} options.onEvent - Callback for progress events (uses jobManager.notifySubscribers)
 * @returns {Promise<void>}
 */
async function run(userId, projectId, userMessage, options) {
  const { jobId, prompt, detectedSkills, onEvent } = options;
  const stagingDir = await createStagingDir(jobId);

  try {
    // Record v2 job run
    await db.query(
      `INSERT INTO engine_v2.job_runs (job_id, user_id, project_id, engine_version, scheduler_version)
       VALUES ($1, $2, $3, 'v2', '1.0')`,
      [jobId, userId, projectId]
    );

    // Build the task DAG
    const taskMap = await buildDag(db, jobId, DEFAULT_WORKFLOW);

    // Create task executor (handles Modal API calls)
    const executeTask = createTaskExecutor(modalClient, {
      db,
      userId,
      projectId,
      userMessage,
      prompt,
      detectedSkills,
    });

    // Run the DAG workflow
    await runWorkflow(db, jobId, executeTask, onEvent);

    // Collect final result from publish_prep task output
    const { rows } = await db.query(
      `SELECT output FROM engine_v2.job_tasks
       WHERE job_id = $1 AND task_key = 'publish_prep' AND status = 'succeeded'`,
      [jobId]
    );

    if (!rows.length) {
      throw new Error('v2_no_publish_prep');
    }

    // Assemble V2Result from task outputs
    const v2Result = await assembleResult(db, jobId);

    if (!validateOutput(v2Result)) {
      throw new Error('v2_output_invalid');
    }

    // Apply to production (atomic rename swap with advisory lock)
    await applyToProduction(db, userId, projectId, stagingDir);

    // Mark v2 job as succeeded
    await db.query(
      `UPDATE engine_v2.job_runs SET status = 'succeeded', finished_at = now()
       WHERE job_id = $1`,
      [jobId]
    );

    // Send result via WebSocket in v1-compatible format
    const v1Response = toV1Response(v2Result);
    onEvent(v1Response);

  } catch (err) {
    // Mark v2 job as failed
    await db.query(
      `UPDATE engine_v2.job_runs
       SET status = 'failed', error_code = $2, finished_at = now(), fallback_triggered = true
       WHERE job_id = $1`,
      [jobId, err.message || 'v2_unknown']
    ).catch(() => {});

    throw err; // Re-throw for v1 fallback in claudeRunner
  } finally {
    cleanupStagingDir(jobId);
  }
}

/**
 * Assemble the V2Result from completed task outputs.
 */
async function assembleResult(db, jobId) {
  const { rows: tasks } = await db.query(
    `SELECT task_key, output FROM engine_v2.job_tasks
     WHERE job_id = $1 AND status IN ('succeeded', 'skipped')
     ORDER BY created_at`,
    [jobId]
  );

  const taskOutputs = {};
  for (const t of tasks) {
    taskOutputs[t.task_key] = t.output || {};
  }

  return {
    files: taskOutputs.fix?.files || taskOutputs.codegen?.files || [],
    images: taskOutputs.asset?.images || [],
    summary: taskOutputs.codegen?.summary || '',
    qa: taskOutputs.qa_review || { issues: 0, findings: [] },
  };
}

/**
 * Log a v2 fallback event for monitoring.
 */
async function logFallback(jobId, err) {
  try {
    await db.query(
      `INSERT INTO engine_v2.job_task_events (job_id, event_type, data)
       VALUES ($1, 'v2_fallback', $2)`,
      [jobId, JSON.stringify({ error: err.message, stack: err.stack })]
    );
  } catch (logErr) {
    console.error('[EngineV2] Failed to log fallback:', logErr.message);
  }
}

/**
 * Run v2 engine in shadow mode (measurement only).
 *
 * - Runs the full v2 pipeline in the background
 * - Never throws (all errors are caught and recorded)
 * - Never sends results to the user (no onEvent calls for game output)
 * - Records metrics to engine_v2.job_runs for analysis
 *
 * @param {string} userId
 * @param {string} projectId
 * @param {string} userMessage
 * @param {object} options - same as run(), but onEvent is replaced with a no-op
 */
async function runShadow(userId, projectId, userMessage, options) {
  const { jobId, prompt, detectedSkills } = options;
  const startTime = Date.now();

  try {
    // Record shadow run
    await db.query(
      `INSERT INTO engine_v2.job_runs
         (job_id, user_id, project_id, engine_version, scheduler_version, mode)
       VALUES ($1, $2, $3, 'v2', '1.0', 'shadow')`,
      [jobId, userId, projectId]
    );

    // Build the task DAG
    await buildDag(db, jobId, DEFAULT_WORKFLOW);

    // Create task executor
    const executeTask = createTaskExecutor(modalClient, {
      db,
      userId,
      projectId,
      userMessage,
      prompt,
      detectedSkills,
    });

    // Run workflow with a metrics-only event handler (no WebSocket output)
    const shadowOnEvent = (eventName, data) => {
      // Log for debugging, but never send to user
      console.log(`[EngineV2:shadow] ${eventName}`, data?.task?.task_key || '');
    };

    await runWorkflow(db, jobId, executeTask, shadowOnEvent);

    const elapsedMs = Date.now() - startTime;

    // Mark shadow run as succeeded
    await db.query(
      `UPDATE engine_v2.job_runs
       SET status = 'succeeded', finished_at = now()
       WHERE job_id = $1`,
      [jobId]
    );

    console.log(`[EngineV2:shadow] Completed in ${elapsedMs}ms: ${jobId}`);
  } catch (err) {
    const elapsedMs = Date.now() - startTime;

    // Record shadow failure (never propagate to caller)
    await db.query(
      `UPDATE engine_v2.job_runs
       SET status = 'failed', error_code = $2, finished_at = now()
       WHERE job_id = $1`,
      [jobId, err.message || 'v2_shadow_unknown']
    ).catch(() => {});

    console.warn(`[EngineV2:shadow] Failed in ${elapsedMs}ms: ${err.message}`);
  }
  // No finally cleanup needed — shadow mode doesn't use staging dir
}

module.exports = {
  run,
  runShadow,
  shouldUseV2,
  isShadowMode,
  logFallback,
  ENGINE_V2_ENABLED,
  ENGINE_V2_MODE,
};
