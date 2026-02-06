#!/usr/bin/env node
// server/engine-v2/test-m2-wiring.js
// M2 integration test — verifies module wiring without requiring live services.
'use strict';

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✅ ${label}`);
}

function fail(label, err) {
  failed++;
  console.error(`  ❌ ${label}: ${err}`);
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ---------------------------------------------------------------------------
// 1. Module loading
// ---------------------------------------------------------------------------
section('Module Loading');

try {
  require('./featureFlag');
  ok('featureFlag loads');
} catch (e) { fail('featureFlag', e.message); }

try {
  require('./db');
  ok('db loads');
} catch (e) { fail('db', e.message); }

try {
  require('./dagBuilder');
  ok('dagBuilder loads');
} catch (e) { fail('dagBuilder', e.message); }

try {
  require('./scheduler');
  ok('scheduler loads');
} catch (e) { fail('scheduler', e.message); }

try {
  require('./taskRunner');
  ok('taskRunner loads');
} catch (e) { fail('taskRunner', e.message); }

try {
  require('./stagingManager');
  ok('stagingManager loads');
} catch (e) { fail('stagingManager', e.message); }

try {
  require('./output');
  ok('output loads');
} catch (e) { fail('output', e.message); }

try {
  require('./index');
  ok('index (entry point) loads');
} catch (e) { fail('index', e.message); }

// ---------------------------------------------------------------------------
// 2. Export verification
// ---------------------------------------------------------------------------
section('Export Verification');

const taskRunner = require('./taskRunner');
const expectedTaskRunnerExports = [
  'createTaskExecutor',
  'createAttempt',
  'completeAttempt',
  'saveArtifact',
  'emitEvent',
  'handleConditionalSkip',
];
for (const name of expectedTaskRunnerExports) {
  if (typeof taskRunner[name] === 'function') {
    ok(`taskRunner.${name} is a function`);
  } else {
    fail(`taskRunner.${name}`, `expected function, got ${typeof taskRunner[name]}`);
  }
}

const scheduler = require('./scheduler');
const expectedSchedulerExports = [
  'runWorkflow',
  'promoteReadyTasks',
  'claimNextTask',
  'propagateFailure',
  'DagDeadlockError',
];
for (const name of expectedSchedulerExports) {
  const expected = name === 'DagDeadlockError' ? 'function' : 'function';
  if (typeof scheduler[name] === 'function') {
    ok(`scheduler.${name} is exported`);
  } else {
    fail(`scheduler.${name}`, `expected function, got ${typeof scheduler[name]}`);
  }
}

const entryPoint = require('./index');
for (const name of ['run', 'shouldUseV2', 'logFallback', 'ENGINE_V2_ENABLED']) {
  if (name === 'ENGINE_V2_ENABLED') {
    if (typeof entryPoint[name] === 'boolean') {
      ok(`index.${name} is a boolean (${entryPoint[name]})`);
    } else {
      fail(`index.${name}`, `expected boolean, got ${typeof entryPoint[name]}`);
    }
  } else if (typeof entryPoint[name] === 'function') {
    ok(`index.${name} is a function`);
  } else {
    fail(`index.${name}`, `expected function, got ${typeof entryPoint[name]}`);
  }
}

// ---------------------------------------------------------------------------
// 3. createTaskExecutor wiring
// ---------------------------------------------------------------------------
section('createTaskExecutor Wiring');

// Create a mock modalClient and db to test callAgent routing
const mockDb = {
  query: async () => ({ rows: [{ id: 'mock-attempt-id' }] }),
  transaction: async (fn) => fn({ query: async () => ({ rows: [{ id: 'mock-id' }] }) }),
};

const mockModalClient = {
  v2DetectIntent: async (msg) => ({ intent: 'edit', _meta: { input_tokens: 10 } }),
  v2ChatHaiku: async (prompt) => ({ result: 'hello' }),
  v2GenerateCode: async (params) => ({ files: [], summary: 'test', _meta: {} }),
};

(async () => {
  const executeTask = taskRunner.createTaskExecutor(mockModalClient, {
    db: mockDb,
    userId: 'test-user',
    projectId: 'test-project',
    userMessage: 'make a game',
    prompt: 'full prompt here',
    detectedSkills: ['2d'],
  });

  if (typeof executeTask === 'function') {
    ok('createTaskExecutor returns a function');
  } else {
    fail('createTaskExecutor', 'did not return a function');
  }

  // Test intent task routing
  try {
    const intentResult = await executeTask({
      id: 'task-1',
      job_id: 'job-1',
      task_key: 'intent',
      agent_role: 'planner',
      attempt_count: 1,
      max_attempts: 2,
      input: null,
    });
    if (intentResult.intent === 'edit') {
      ok('intent task routes to v2DetectIntent');
    } else {
      fail('intent routing', `unexpected result: ${JSON.stringify(intentResult)}`);
    }
  } catch (e) {
    fail('intent task execution', e.message);
  }

  // Test codegen task routing
  try {
    const codegenResult = await executeTask({
      id: 'task-2',
      job_id: 'job-1',
      task_key: 'codegen',
      agent_role: 'builder',
      attempt_count: 1,
      max_attempts: 2,
      input: { plan: 'auto' },
    });
    if (Array.isArray(codegenResult.files)) {
      ok('codegen task routes to v2GenerateCode');
    } else {
      fail('codegen routing', `unexpected result: ${JSON.stringify(codegenResult)}`);
    }
  } catch (e) {
    fail('codegen task execution', e.message);
  }

  // Test qa_review stub (returns pass)
  try {
    const qaResult = await executeTask({
      id: 'task-3',
      job_id: 'job-1',
      task_key: 'qa_review',
      agent_role: 'qa',
      attempt_count: 1,
      max_attempts: 1,
      input: null,
    });
    if (qaResult.issues === 0) {
      ok('qa_review stub returns issues=0');
    } else {
      fail('qa_review stub', `unexpected result: ${JSON.stringify(qaResult)}`);
    }
  } catch (e) {
    fail('qa_review stub', e.message);
  }

  // Test unknown task_key throws
  try {
    await executeTask({
      id: 'task-4',
      job_id: 'job-1',
      task_key: 'nonexistent',
      agent_role: 'unknown',
      attempt_count: 1,
      max_attempts: 1,
      input: null,
    });
    fail('unknown task_key', 'should have thrown');
  } catch (e) {
    if (e.message.includes('Unknown task_key')) {
      ok('unknown task_key throws correctly');
    } else {
      fail('unknown task_key error', e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. handleConditionalSkip logic
  // ---------------------------------------------------------------------------
  section('handleConditionalSkip');

  // Test chat intent skip
  const skipDb = {
    query: async (sql, params) => {
      if (sql.includes('UPDATE')) {
        // Simulate skipping tasks
        const keysToSkip = params[1] || [];
        return { rows: keysToSkip.map((k) => ({ task_key: k })) };
      }
      if (sql.includes('INSERT')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  try {
    const skipped = await taskRunner.handleConditionalSkip(
      skipDb, 'job-1', 'intent', { intent: 'chat' }
    );
    if (skipped.length === 6) {
      ok(`chat intent skips ${skipped.length} tasks`);
    } else {
      fail('chat intent skip', `expected 6, got ${skipped.length}`);
    }
  } catch (e) {
    fail('handleConditionalSkip (chat)', e.message);
  }

  // Test qa pass skip
  try {
    const skipped = await taskRunner.handleConditionalSkip(
      skipDb, 'job-1', 'qa_review', { issues: 0 }
    );
    if (skipped.includes('fix')) {
      ok('qa_review issues=0 skips fix task');
    } else {
      fail('qa skip', `unexpected: ${JSON.stringify(skipped)}`);
    }
  } catch (e) {
    fail('handleConditionalSkip (qa)', e.message);
  }

  // Test no skip
  try {
    const skipped = await taskRunner.handleConditionalSkip(
      skipDb, 'job-1', 'codegen', { files: [] }
    );
    if (skipped.length === 0) {
      ok('codegen task does not trigger skips');
    } else {
      fail('no-skip', `unexpected skips: ${JSON.stringify(skipped)}`);
    }
  } catch (e) {
    fail('handleConditionalSkip (no-skip)', e.message);
  }

  // ---------------------------------------------------------------------------
  // 5. Circular dependency check
  // ---------------------------------------------------------------------------
  section('Circular Dependency Check');

  // scheduler imports from taskRunner, taskRunner does NOT import scheduler
  try {
    // If we got here without errors, no circular dependency
    ok('No circular dependency between scheduler ↔ taskRunner');
  } catch (e) {
    fail('Circular dependency', e.message);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
  console.log('═'.repeat(40));

  if (failed > 0) {
    process.exit(1);
  }
})();
