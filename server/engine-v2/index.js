// server/engine-v2/index.js
// Engine V2 entry point — orchestrates DAG-based game creation
'use strict';

const { shouldUseV2, ENGINE_V2_ENABLED } = require('./featureFlag');
const db = require('./db');
const { buildDag, DEFAULT_WORKFLOW } = require('./dagBuilder');
const { runWorkflow } = require('./scheduler');
const { createTaskExecutor } = require('./taskRunner');
const { createStagingDir, cleanupStagingDir, applyToProduction } = require('./stagingManager');
const { validateOutput, toV1Response } = require('./output');

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
    const executeTask = createTaskExecutor(null, {
      userId,
      projectId,
      userMessage,
      prompt,
      detectedSkills,
      stagingDir,
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

module.exports = {
  run,
  shouldUseV2,
  logFallback,
  ENGINE_V2_ENABLED,
};
