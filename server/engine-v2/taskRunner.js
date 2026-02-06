// server/engine-v2/taskRunner.js
'use strict';

// ---------------------------------------------------------------------------
// Task keys that should be skipped when intent is 'chat'
// ---------------------------------------------------------------------------
const TASKS_AFTER_INTENT = ['plan', 'codegen', 'asset', 'qa_review', 'fix', 'publish_prep'];

// ---------------------------------------------------------------------------
// Attempt management
// ---------------------------------------------------------------------------

/**
 * Create a new attempt record for a task.
 *
 * @param {object} db - db module (query/transaction)
 * @param {string} taskId - UUID of the job_task
 * @param {number} attemptNo - 1-based attempt number
 * @returns {Promise<string>} attempt id (UUID)
 */
async function createAttempt(db, taskId, attemptNo) {
  const { rows } = await db.query(
    `INSERT INTO engine_v2.job_task_attempts
       (task_id, attempt_number, status, started_at)
     VALUES ($1, $2, 'running', NOW())
     RETURNING id`,
    [taskId, attemptNo]
  );
  return rows[0].id;
}

/**
 * Mark an attempt as completed (success or failure).
 *
 * @param {object} db - db module (query/transaction)
 * @param {string} attemptId - UUID of the attempt
 * @param {object} result
 * @param {string} result.status - 'succeeded' | 'failed'
 * @param {number} [result.input_tokens]
 * @param {number} [result.output_tokens]
 * @param {number} [result.latency_ms]
 * @param {number} [result.cost_usd]
 * @param {string} [result.error_message]
 */
async function completeAttempt(db, attemptId, result) {
  await db.query(
    `UPDATE engine_v2.job_task_attempts
     SET status        = $1,
         finished_at   = NOW(),
         input_tokens  = $2,
         output_tokens = $3,
         latency_ms    = $4,
         cost_usd      = $5,
         error_message = $6
     WHERE id = $7`,
    [
      result.status,
      result.input_tokens ?? null,
      result.output_tokens ?? null,
      result.latency_ms ?? null,
      result.cost_usd ?? null,
      result.error_message ?? null,
      attemptId,
    ]
  );
}

// ---------------------------------------------------------------------------
// Artifact storage
// ---------------------------------------------------------------------------

/**
 * Save an artifact produced by a task.
 *
 * @param {object} db
 * @param {string} jobId
 * @param {string} taskId
 * @param {string} kind - e.g. 'code', 'image', 'plan', 'qa_report'
 * @param {*} content - JSON-serialisable content
 * @param {object} [metadata] - optional metadata
 * @returns {Promise<string>} artifact id
 */
async function saveArtifact(db, jobId, taskId, kind, content, metadata) {
  const { rows } = await db.query(
    `INSERT INTO engine_v2.job_task_artifacts
       (job_id, task_id, kind, content, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      jobId,
      taskId,
      kind,
      JSON.stringify(content),
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

/**
 * Emit a lifecycle event for a task.
 *
 * @param {object} db
 * @param {string} jobId
 * @param {string} taskId
 * @param {string} eventType - e.g. 'task_started', 'task_completed', 'task_failed', 'task_skipped'
 * @param {object} [data] - additional event data
 */
async function emitEvent(db, jobId, taskId, eventType, data) {
  await db.query(
    `INSERT INTO engine_v2.job_task_events
       (job_id, task_id, event_type, data)
     VALUES ($1, $2, $3, $4)`,
    [jobId, taskId, eventType, data ? JSON.stringify(data) : null]
  );
}

// ---------------------------------------------------------------------------
// Conditional branching
// ---------------------------------------------------------------------------

/**
 * After a task succeeds, check if downstream tasks should be skipped.
 *
 * Rules:
 *   - intent === 'chat' → skip all remaining tasks
 *   - qa_review.issues === 0 → skip 'fix' task
 *
 * @param {object} db
 * @param {string} jobId
 * @param {string} taskKey - the task that just completed
 * @param {object} output - the output of the completed task
 * @returns {Promise<string[]>} list of task_keys that were skipped
 */
async function handleConditionalSkip(db, jobId, taskKey, output) {
  let keysToSkip = [];

  if (taskKey === 'intent' && output && output.intent === 'chat') {
    keysToSkip = TASKS_AFTER_INTENT;
  } else if (taskKey === 'qa_review' && output && output.issues === 0) {
    keysToSkip = ['fix'];
  }

  if (keysToSkip.length === 0) return [];

  const { rows } = await db.query(
    `UPDATE engine_v2.job_tasks
     SET status = 'skipped'
     WHERE job_id = $1
       AND task_key = ANY($2)
       AND status IN ('pending', 'blocked', 'ready')
     RETURNING task_key`,
    [jobId, keysToSkip]
  );

  const skippedKeys = rows.map((r) => r.task_key);

  // Emit skip events for each skipped task
  for (const row of rows) {
    await emitEvent(db, jobId, null, 'task_skipped', {
      task_key: row.task_key,
      reason: taskKey === 'intent' ? 'chat_intent' : 'qa_pass',
    });
  }

  return skippedKeys;
}

// ---------------------------------------------------------------------------
// Task executor factory
// ---------------------------------------------------------------------------

/**
 * Map of agent_role -> Modal v2 endpoint path.
 * Used by the executor to route tasks to the correct Modal function.
 */
const ROLE_ENDPOINTS = {
  planner: '/v2/plan',
  builder: '/v2/build',
  asset: '/v2/asset',
  qa: '/v2/qa',
  publisher: '/v2/publish',
};

/**
 * Create a task executor function.
 *
 * @param {object} modalClient - client with .post(path, body) method (TODO: M2)
 * @param {object} options
 * @param {object} options.db - db module
 * @returns {function(object): Promise<object>} executeTask(task) -> output
 */
function createTaskExecutor(modalClient, options) {
  const { db } = options;

  /**
   * Execute a single task: track attempts, call agent, save artifacts.
   *
   * @param {object} task
   * @param {string} task.id - task UUID
   * @param {string} task.job_id
   * @param {string} task.task_key
   * @param {string} task.agent_role
   * @param {number} task.max_attempts
   * @param {object} task.input - input payload for the agent
   * @returns {Promise<object>} task output
   */
  async function executeTask(task) {
    const { id: taskId, job_id: jobId, task_key: taskKey, agent_role: agentRole, max_attempts: maxAttempts } = task;

    // Mark task as running
    await db.query(
      `UPDATE engine_v2.job_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId]
    );
    await emitEvent(db, jobId, taskId, 'task_started', { task_key: taskKey });

    let lastError = null;
    let output = null;

    for (let attempt = 1; attempt <= (maxAttempts || 1); attempt++) {
      const attemptId = await createAttempt(db, taskId, attempt);
      const startTime = Date.now();

      try {
        // --- M1 STUB: actual Modal call is not implemented yet ---
        output = await callAgent(modalClient, agentRole, taskKey, task.input);
        // ---------------------------------------------------------

        const latencyMs = Date.now() - startTime;

        await completeAttempt(db, attemptId, {
          status: 'succeeded',
          input_tokens: output._meta?.input_tokens,
          output_tokens: output._meta?.output_tokens,
          latency_ms: latencyMs,
          cost_usd: output._meta?.cost_usd,
        });

        // Clean internal metadata before returning
        delete output._meta;

        // Save artifacts based on task type
        await saveTaskArtifacts(db, jobId, taskId, taskKey, output);

        // Mark task as succeeded
        await db.query(
          `UPDATE engine_v2.job_tasks SET status = 'succeeded', finished_at = NOW(), output = $1 WHERE id = $2`,
          [JSON.stringify(output), taskId]
        );
        await emitEvent(db, jobId, taskId, 'task_completed', { task_key: taskKey, attempt });

        // Handle conditional branching
        await handleConditionalSkip(db, jobId, taskKey, output);

        return output;
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        lastError = err;

        await completeAttempt(db, attemptId, {
          status: 'failed',
          latency_ms: latencyMs,
          error_message: err.message,
        });

        await emitEvent(db, jobId, taskId, 'task_attempt_failed', {
          task_key: taskKey,
          attempt,
          error: err.message,
        });

        // If we have more attempts, continue; otherwise fall through
        if (attempt < (maxAttempts || 1)) {
          continue;
        }
      }
    }

    // All attempts exhausted
    await db.query(
      `UPDATE engine_v2.job_tasks SET status = 'failed', finished_at = NOW() WHERE id = $1`,
      [taskId]
    );
    await emitEvent(db, jobId, taskId, 'task_failed', {
      task_key: taskKey,
      error: lastError?.message,
    });

    throw lastError;
  }

  return executeTask;
}

// ---------------------------------------------------------------------------
// Agent call stub (M1: not implemented)
// ---------------------------------------------------------------------------

/**
 * Call the appropriate Modal v2 agent endpoint.
 *
 * M1 skeleton: throws "not implemented yet".
 * M2: will use modalClient.post() to call the real endpoint.
 *
 * @param {object} modalClient
 * @param {string} agentRole
 * @param {string} taskKey
 * @param {object} input
 * @returns {Promise<object>} agent output
 */
async function callAgent(modalClient, agentRole, taskKey, input) {
  // TODO (M2): implement actual Modal calls
  //
  // const endpoint = ROLE_ENDPOINTS[agentRole];
  // if (!endpoint) throw new Error(`Unknown agent_role: ${agentRole}`);
  // const response = await modalClient.post(endpoint, { task_key: taskKey, ...input });
  // return response.data;

  throw new Error(`callAgent not implemented yet: ${agentRole}/${taskKey}`);
}

// ---------------------------------------------------------------------------
// Artifact helpers
// ---------------------------------------------------------------------------

/**
 * Save artifacts appropriate for the task type.
 *
 * @param {object} db
 * @param {string} jobId
 * @param {string} taskId
 * @param {string} taskKey
 * @param {object} output
 */
async function saveTaskArtifacts(db, jobId, taskId, taskKey, output) {
  switch (taskKey) {
    case 'intent':
      await saveArtifact(db, jobId, taskId, 'intent', output);
      break;
    case 'plan':
      await saveArtifact(db, jobId, taskId, 'plan', output);
      break;
    case 'codegen':
      if (output.files) {
        await saveArtifact(db, jobId, taskId, 'code', output.files, {
          file_count: output.files.length,
        });
      }
      break;
    case 'asset':
      if (output.images) {
        await saveArtifact(db, jobId, taskId, 'image', output.images, {
          image_count: output.images.length,
        });
      }
      break;
    case 'qa_review':
      await saveArtifact(db, jobId, taskId, 'qa_report', output);
      break;
    case 'fix':
      if (output.files) {
        await saveArtifact(db, jobId, taskId, 'code', output.files, {
          file_count: output.files.length,
          is_fix: true,
        });
      }
      break;
    case 'publish_prep':
      await saveArtifact(db, jobId, taskId, 'publish', output, {
        commit_hash: output.commit_hash,
      });
      break;
  }
}

module.exports = {
  createTaskExecutor,
  createAttempt,
  completeAttempt,
  saveArtifact,
  emitEvent,
  handleConditionalSkip,
};
