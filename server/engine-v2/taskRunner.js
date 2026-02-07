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
       (task_id, attempt_no, status, started_at)
     VALUES ($1::uuid, $2::int, 'running', NOW())
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
     SET status        = $1::text,
         ended_at      = NOW(),
         tokens_in     = $2::int,
         tokens_out    = $3::int,
         latency_ms    = $4::int,
         cost_usd      = $5::numeric,
         error          = $6::jsonb
     WHERE id = $7::uuid`,
    [
      result.status,
      result.input_tokens ?? null,
      result.output_tokens ?? null,
      result.latency_ms ?? null,
      result.cost_usd ?? null,
      result.error_message ? JSON.stringify({ message: result.error_message }) : null,
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
     VALUES ($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::jsonb)
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
     VALUES ($1::uuid, $2::uuid, $3::text, $4::jsonb)`,
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
     WHERE job_id = $1::uuid
       AND task_key = ANY($2::text[])
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
 * @param {object} modalClient - ModalClient instance with v2 methods
 * @param {object} options
 * @param {object} options.db - db module
 * @param {string} options.userId - JWT-verified user ID
 * @param {string} options.projectId - Target project ID
 * @param {string} options.userMessage - Original user message
 * @param {string} options.prompt - Built prompt
 * @param {string[]} options.detectedSkills - Skills detected in message
 * @returns {function(object): Promise<object>} executeTask(task) -> output
 */
function createTaskExecutor(modalClient, options) {
  const { db, userId, projectId, userMessage, prompt, detectedSkills } = options;

  /**
   * Execute a single task: call agent, track attempts, save artifacts.
   *
   * NOTE: Task status management (running/succeeded/failed) is handled by
   * scheduler.executeAndHandle. This function ONLY handles:
   * - Agent calls via Modal v2 endpoints
   * - Attempt tracking (createAttempt, completeAttempt)
   * - Artifact saving
   * Returns output on success, throws on all-attempts-exhausted failure.
   *
   * @param {object} task - claimed task row from scheduler
   * @returns {Promise<object>} task output
   */
  async function executeTask(task) {
    const { id: taskId, job_id: jobId, task_key: taskKey, agent_role: agentRole, attempt_count: attemptCount, max_attempts: maxAttempts } = task;

    const attemptNo = attemptCount; // claimNextTask increments attempt_count
    const attemptId = await createAttempt(db, taskId, attemptNo);
    const startTime = Date.now();

    try {
      const context = { userId, projectId, userMessage, prompt, detectedSkills };
      const output = await callAgent(modalClient, taskKey, task.input, context);
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

      return output;
    } catch (err) {
      const latencyMs = Date.now() - startTime;

      await completeAttempt(db, attemptId, {
        status: 'failed',
        latency_ms: latencyMs,
        error_message: err.message,
      });

      throw err;
    }
  }

  return executeTask;
}

// ---------------------------------------------------------------------------
// Agent call stub (M1: not implemented)
// ---------------------------------------------------------------------------

/**
 * Call the appropriate Modal v2 agent endpoint.
 *
 * Routes by task_key to the correct modalClient v2 method.
 * Passes both task-specific input (from predecessor outputs) and
 * job-level context (userId, projectId, prompt, etc.).
 *
 * @param {object} modalClient - ModalClient instance
 * @param {string} taskKey - e.g. 'intent', 'plan', 'codegen'
 * @param {object} input - task input (from job_tasks.input column)
 * @param {object} context - job-level context
 * @param {string} context.userId
 * @param {string} context.projectId
 * @param {string} context.userMessage
 * @param {string} context.prompt
 * @param {string[]} context.detectedSkills
 * @returns {Promise<object>} agent output
 */
async function callAgent(modalClient, taskKey, input, context) {
  switch (taskKey) {
    case 'intent':
      return modalClient.v2DetectIntent(context.userMessage);

    case 'plan':
      // M2: plan endpoint not yet implemented on Modal
      // Return a pass-through so downstream tasks can proceed
      return { plan: 'auto', message: context.userMessage };

    case 'codegen':
      return modalClient.v2GenerateCode({
        user_id: context.userId,
        project_id: context.projectId,
        prompt: context.prompt,
        plan: input?.plan,
        skills: context.detectedSkills,
      });

    case 'asset':
      // M2: asset generation not yet implemented
      return { images: [] };

    case 'qa_review':
      // M2: QA not yet implemented — pass with no issues
      return { issues: 0, findings: [] };

    case 'fix':
      // M2: fix not needed when qa_review passes (issues=0 → skipped)
      return { files: [] };

    case 'publish_prep':
      // M2: publish prep is a pass-through
      return { ready: true };

    default:
      throw new Error(`Unknown task_key: ${taskKey}`);
  }
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
