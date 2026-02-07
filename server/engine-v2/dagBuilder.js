// server/engine-v2/dagBuilder.js
'use strict';

const DEFAULT_WORKFLOW = {
  tasks: [
    { key: 'intent',       role: 'planner',   weight: 1, label: '意図を分析中...',   maxAttempts: 2 },
    { key: 'plan',         role: 'planner',   weight: 2, label: 'ゲームを設計中...', maxAttempts: 2 },
    { key: 'codegen',      role: 'builder',   weight: 5, label: 'コードを生成中...', maxAttempts: 2 },
    { key: 'asset',        role: 'asset',     weight: 4, label: '画像を生成中...',   maxAttempts: 2 },
    { key: 'qa_review',    role: 'qa',        weight: 2, label: '品質チェック中...', maxAttempts: 1 },
    { key: 'fix',          role: 'builder',   weight: 2, label: '修正中...',         maxAttempts: 2 },
    { key: 'publish_prep', role: 'publisher', weight: 1, label: '仕上げ中...',       maxAttempts: 1 },
  ],
  dependencies: [
    ['intent', 'plan'],
    ['plan', 'codegen'],
    ['plan', 'asset'],
    ['codegen', 'qa_review'],
    ['qa_review', 'fix'],
    ['fix', 'publish_prep'],
    ['asset', 'publish_prep'],
  ],
};

/**
 * Build the task DAG for a job.
 *
 * Inserts task rows into engine_v2.job_tasks and dependency rows into
 * engine_v2.job_task_dependencies within a single transaction.
 *
 * @param {object} db  - db module with query() and transaction()
 * @param {string} jobId - UUID of the parent job
 * @param {object} workflow - workflow definition (defaults to DEFAULT_WORKFLOW)
 * @returns {Promise<Record<string, string>>} map of task_key -> task_id (UUID)
 */
async function buildDag(db, jobId, workflow = DEFAULT_WORKFLOW) {
  // Determine which task keys have predecessors so we can set initial status
  const hasPredecesor = new Set();
  for (const [, successor] of workflow.dependencies) {
    hasPredecesor.add(successor);
  }

  const taskMap = await db.transaction(async (client) => {
    const map = {};

    // 1. Insert all tasks
    for (const task of workflow.tasks) {
      const status = hasPredecesor.has(task.key) ? 'pending' : 'ready';
      const { rows } = await client.query(
        `INSERT INTO engine_v2.job_tasks
           (job_id, task_key, agent_role, status, display_label, weight, max_attempts)
         VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::int, $7::int)
         RETURNING id`,
        [jobId, task.key, task.role, status, task.label, task.weight, task.maxAttempts]
      );
      map[task.key] = rows[0].id;
    }

    // 2. Insert all dependencies
    for (const [predecessorKey, successorKey] of workflow.dependencies) {
      await client.query(
        `INSERT INTO engine_v2.job_task_dependencies
           (predecessor_task_id, successor_task_id)
         VALUES ($1::uuid, $2::uuid)`,
        [map[predecessorKey], map[successorKey]]
      );
    }

    return map;
  });

  return taskMap;
}

module.exports = { buildDag, DEFAULT_WORKFLOW };
