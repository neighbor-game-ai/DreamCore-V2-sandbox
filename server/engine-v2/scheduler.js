// server/engine-v2/scheduler.js
'use strict';

const { handleConditionalSkip, emitEvent } = require('./taskRunner');

const WORKER_COUNT = 3;
const POLL_INTERVAL_MS = 300;

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

class DagDeadlockError extends Error {
  constructor(jobId, stuckCount) {
    super(`DAG deadlock: job ${jobId} has ${stuckCount} stuck task(s)`);
    this.name = 'DagDeadlockError';
    this.jobId = jobId;
    this.stuckCount = stuckCount;
  }
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

/**
 * Promote all pending tasks whose predecessors have all succeeded/skipped.
 * @param {object} db - db module with query(text, params)
 * @param {string} jobId
 * @returns {Promise<object[]>} newly promoted tasks
 */
async function promoteReadyTasks(db, jobId) {
  const { rows } = await db.query(
    `UPDATE engine_v2.job_tasks t
     SET status = 'ready'
     WHERE t.job_id = $1::uuid
       AND t.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM engine_v2.job_task_dependencies d
         JOIN engine_v2.job_tasks pred ON pred.id = d.predecessor_task_id
         WHERE d.successor_task_id = t.id
           AND pred.status NOT IN ('succeeded', 'skipped')
       )
     RETURNING *`,
    [jobId]
  );
  return rows;
}

/**
 * Atomically claim the oldest ready task for a job.
 * Uses FOR UPDATE SKIP LOCKED so multiple workers don't collide.
 * @param {object} db
 * @param {string} jobId
 * @returns {Promise<object|null>} claimed task row or null
 */
async function claimNextTask(db, jobId) {
  const { rows } = await db.query(
    `UPDATE engine_v2.job_tasks
     SET status = 'running',
         started_at = now(),
         attempt_count = attempt_count + 1
     WHERE id = (
       SELECT id FROM engine_v2.job_tasks
       WHERE job_id = $1::uuid AND status = 'ready'
       ORDER BY created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [jobId]
  );
  return rows[0] || null;
}

/**
 * Check whether any tasks are still actively being processed (ready or running).
 * Excludes 'pending' — those are waiting on predecessors.
 */
async function hasActiveTasks(db, jobId) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM engine_v2.job_tasks
       WHERE job_id = $1::uuid AND status IN ('ready', 'running')
     ) AS active`,
    [jobId]
  );
  return rows[0].active;
}

/**
 * Count tasks that are stuck (pending/blocked but should not be if DAG is healthy).
 */
async function countStuckTasks(db, jobId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS cnt FROM engine_v2.job_tasks
     WHERE job_id = $1::uuid AND status IN ('pending', 'blocked')`,
    [jobId]
  );
  return rows[0].cnt;
}

/**
 * Update a task's status and optional extra fields.
 * @param {object} db
 * @param {string} taskId
 * @param {string} status
 * @param {object} extra - optional: error_code, error_message, output, finished_at
 */
async function markTaskStatus(db, taskId, status, extra = {}) {
  const setClauses = ['status = $2::text'];
  const params = [taskId, status];
  let idx = 3;

  // Type cast map for known columns
  const typeCasts = {
    error_code: 'text',
    error_message: 'text',
    output: 'jsonb',
    finished_at: 'timestamptz',
  };

  for (const [key, value] of Object.entries(extra)) {
    const cast = typeCasts[key] ? `::${typeCasts[key]}` : '';
    setClauses.push(`${key} = $${idx}${cast}`);
    params.push(value);
    idx++;
  }

  await db.query(
    `UPDATE engine_v2.job_tasks SET ${setClauses.join(', ')} WHERE id = $1::uuid`,
    params
  );
}

/**
 * Recursively cancel all downstream tasks of a failed task.
 */
async function propagateFailure(db, jobId, failedTaskId) {
  await db.query(
    `WITH RECURSIVE downstream AS (
       SELECT d.successor_task_id AS task_id
       FROM engine_v2.job_task_dependencies d
       WHERE d.predecessor_task_id = $2::uuid
       UNION
       SELECT d.successor_task_id
       FROM engine_v2.job_task_dependencies d
       JOIN downstream ds ON ds.task_id = d.predecessor_task_id
     )
     UPDATE engine_v2.job_tasks
     SET status = 'canceled',
         error_code = 'upstream_failed',
         error_message = 'Canceled: upstream task ' || $2::uuid || ' failed'
     WHERE id IN (SELECT task_id FROM downstream)
       AND status IN ('pending', 'ready', 'blocked')`,
    [jobId, failedTaskId]
  );
}

// ---------------------------------------------------------------------------
// Execution helpers
// ---------------------------------------------------------------------------

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a single task and handle success/failure.
 * @param {object} db
 * @param {object} task - claimed task row
 * @param {string} jobId
 * @param {function} executeTask - async (task) => result
 * @param {function} onEvent - (eventName, data) => void
 */
async function executeAndHandle(db, task, jobId, executeTask, onEvent) {
  onEvent('taskStarted', { jobId, task });
  await emitEvent(db, jobId, task.id, 'task_started', {
    task_key: task.task_key,
    attempt: task.attempt_count,
  });

  try {
    const result = await executeTask(task);
    await markTaskStatus(db, task.id, 'succeeded', {
      output: result != null ? JSON.stringify(result) : null,
      finished_at: new Date().toISOString(),
    });

    // Emit task_completed event to DB
    await emitEvent(db, jobId, task.id, 'task_completed', {
      task_key: task.task_key,
    });

    // Conditional skip: intent=chat → skip all; qa_review.issues=0 → skip fix
    const skipped = await handleConditionalSkip(db, jobId, task.task_key, result);
    if (skipped.length > 0) {
      onEvent('tasksSkipped', { jobId, skipped });
    }

    onEvent('taskDone', { jobId, task, result });
    await promoteReadyTasks(db, jobId);
  } catch (err) {
    if (task.attempt_count < task.max_attempts) {
      // Retry: reset to ready
      await markTaskStatus(db, task.id, 'ready');
      onEvent('taskRetry', { jobId, task, error: err.message, attempt: task.attempt_count });
    } else {
      // Final failure
      await markTaskStatus(db, task.id, 'failed', {
        error_code: err.code || 'task_error',
        error_message: err.message,
        finished_at: new Date().toISOString(),
      });
      await emitEvent(db, jobId, task.id, 'task_failed', {
        task_key: task.task_key,
        error: err.message,
        attempt: task.attempt_count,
      });
      onEvent('taskFailed', { jobId, task, error: err.message });
      await propagateFailure(db, jobId, task.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

/**
 * A single worker loop: claim tasks, execute them, detect completion/deadlock.
 */
async function runWorker(db, jobId, executeTask, onEvent) {
  while (true) {
    const task = await claimNextTask(db, jobId);

    if (!task) {
      const active = await hasActiveTasks(db, jobId);

      if (!active) {
        // No active tasks — try one more promotion cycle
        await promoteReadyTasks(db, jobId);
        const retryTask = await claimNextTask(db, jobId);

        if (retryTask) {
          await executeAndHandle(db, retryTask, jobId, executeTask, onEvent);
          continue;
        }

        // Check for stuck tasks (deadlock detection)
        const stuckCount = await countStuckTasks(db, jobId);
        if (stuckCount > 0) {
          throw new DagDeadlockError(jobId, stuckCount);
        }

        // Normal completion — no more work
        return;
      }

      // Other workers are still running — poll
      await wait(POLL_INTERVAL_MS);
      continue;
    }

    await executeAndHandle(db, task, jobId, executeTask, onEvent);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the full DAG workflow for a job.
 *
 * Spawns WORKER_COUNT parallel workers that claim and execute tasks until
 * all tasks are complete, failed, or a deadlock is detected.
 *
 * @param {object} db - db module with query() and transaction()
 * @param {string} jobId - the job to process
 * @param {function} executeTask - async (task) => result
 * @param {function} onEvent - (eventName, data) => void
 */
async function runWorkflow(db, jobId, executeTask, onEvent) {
  // Initial promotion: move root tasks from pending to ready
  await promoteReadyTasks(db, jobId);

  const workers = Array.from({ length: WORKER_COUNT }, () =>
    runWorker(db, jobId, executeTask, onEvent)
  );

  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  runWorkflow,
  promoteReadyTasks,
  claimNextTask,
  propagateFailure,
  DagDeadlockError,
};
