# Game Creation Engine v2 — Final Design Document

**Status:** Frozen (design review complete, rev.4 — all 12 findings fixed)
**Created:** 2026-02-06
**Reviewers:** CTO + Engineering

---

## 0. Overview

Build a completely isolated new engine (v2) without touching the existing engine (v1). v2 is validated incrementally with internal users only and can be discarded in minutes at any time.

### Goals

- Split a single job into multiple tasks with parallel execution, retry, and observability via DB
- Improve game quality with a self-review (QA) loop
- Reduce perceived wait time with progressive display
- Enable future Claude Code team features (Planner/Builder/QA agents)

---

## 1. Design Principles

| Principle | Detail |
|-----------|--------|
| **v1 Immutable** | Zero changes to existing engine code, DB, or execution paths |
| **Complete Separation** | Separate module, schema, worker, and Modal endpoints |
| **Instant Disposal** | `ENGINE_V2_ENABLED=false` for instant stop; `DROP SCHEMA engine_v2 CASCADE` + `rm -rf server/engine-v2/` for full removal |
| **Default v1** | v1 always runs. v2 activates only under allowlist + flag double gate |
| **v1 Fallback** | v2 failure auto-falls back to v1; user sees no difference |
| **Invisible to Users** | No UI toggle. Internal param / hidden endpoint only |
| **No Existing Table Changes** | `public.*` is read-only. No columns added to existing tables |
| **Additive Migrations Only** | Only additions that don't need rollback. No destructive changes |

---

## 2. File Structure

```
server/
├── claudeRunner.js          ← v1 (existing, NO CHANGES)
├── jobManager.js             ← v1 (existing, NO CHANGES)
├── modalClient.js            ← v1 methods unchanged; v2 methods ADDED
├── geminiClient.js           ← v1 (existing, NO CHANGES)
│
├── engine-v2/                ← New directory (fully independent)
│   ├── README.md             ← Purpose and design principles
│   ├── index.js              ← Entry point (run function export)
│   ├── featureFlag.js        ← v2 activation check (flag + allowlist)
│   ├── fallback.js           ← v1 fallback + output compatibility check
│   ├── scheduler.js          ← DAG scheduler (promote, claim, deadlock detection)
│   ├── workflow.js           ← DAG definition (tasks + dependencies)
│   ├── db.js                 ← engine_v2 schema queries (pg direct)
│   ├── progress.js           ← Progressive display (WebSocket event conversion)
│   └── tasks/                ← Task execution logic
│       ├── intent.js         ← Intent detection (chat/edit/restore)
│       ├── plan.js           ← Skill selection + template + design
│       ├── codegen.js        ← Code generation (Gemini → Claude fallback)
│       ├── asset.js          ← Image generation (Vertex AI Gemini)
│       ├── qa-review.js      ← Auto code review (Haiku)
│       ├── fix.js            ← Auto-fix from QA findings
│       └── publish-prep.js   ← Git commit + metadata

modal/
├── app.py                    ← v1 functions unchanged; v2_ functions ADDED
```

---

## 3. DB Schema (`engine_v2` schema)

Completely separated from `public` schema. Zero changes to `public.*` tables.

### 3.1 Migration Header

```sql
-- Prerequisite extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Schema creation
CREATE SCHEMA IF NOT EXISTS engine_v2;

-- Auto-update trigger function
CREATE OR REPLACE FUNCTION engine_v2.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 3.2 job_runs (v2 job tracking)

Maps to `public.jobs`. Tracks which jobs were processed by v2.

```sql
CREATE TABLE engine_v2.job_runs (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  engine_version text NOT NULL DEFAULT 'v2',
  scheduler_version text,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','failed','canceled')),
  fallback_triggered boolean DEFAULT false,
  error_code text,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);
```

### 3.3 job_tasks (core)

Each task in the DAG for a single job.

```sql
CREATE TABLE engine_v2.job_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  agent_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','running','succeeded',
                      'failed','blocked','canceled','skipped')),
  input jsonb DEFAULT '{}',
  output jsonb DEFAULT '{}',
  progress int DEFAULT 0,
  attempt_count int DEFAULT 0,
  max_attempts int DEFAULT 2,
  display_label text,
  weight int DEFAULT 1,
  template_id text,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, task_key)
);

CREATE TRIGGER trg_job_tasks_updated_at
  BEFORE UPDATE ON engine_v2.job_tasks
  FOR EACH ROW EXECUTE FUNCTION engine_v2.set_updated_at();
```

### 3.4 job_task_dependencies (DAG edges)

```sql
CREATE TABLE engine_v2.job_task_dependencies (
  predecessor_task_id uuid NOT NULL
    REFERENCES engine_v2.job_tasks(id) ON DELETE CASCADE,
  successor_task_id uuid NOT NULL
    REFERENCES engine_v2.job_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (predecessor_task_id, successor_task_id),
  CHECK (predecessor_task_id <> successor_task_id)
);
```

### 3.5 job_task_attempts (execution history)

```sql
CREATE TABLE engine_v2.job_task_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL
    REFERENCES engine_v2.job_tasks(id) ON DELETE CASCADE,
  attempt_no int NOT NULL DEFAULT 1,
  status text NOT NULL
    CHECK (status IN ('running','succeeded','failed','canceled')),
  tokens_in int,
  tokens_out int,
  latency_ms int,
  cost_usd numeric(10,4),
  error jsonb,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, attempt_no)
);
```

### 3.6 job_task_artifacts (intermediate outputs)

```sql
CREATE TABLE engine_v2.job_task_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id uuid NOT NULL
    REFERENCES engine_v2.job_tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  uri text,
  content jsonb,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

### 3.7 job_task_events (immutable event log)

```sql
CREATE TABLE engine_v2.job_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES engine_v2.job_tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

### 3.8 Indexes

```sql
CREATE INDEX idx_job_tasks_status
  ON engine_v2.job_tasks(job_id, status, created_at);
CREATE INDEX idx_job_tasks_ready
  ON engine_v2.job_tasks(status, created_at)
  WHERE status IN ('ready', 'running');
CREATE INDEX idx_deps_successor
  ON engine_v2.job_task_dependencies(successor_task_id);
CREATE INDEX idx_artifacts_job
  ON engine_v2.job_task_artifacts(job_id, kind);
CREATE INDEX idx_events_job
  ON engine_v2.job_task_events(job_id, created_at);
```

### 3.9 RLS Policy

Owner-based SELECT only. All writes use service role (pg client), so RLS does not apply to writes.

**Tables with direct `job_id` column** — join via `jobs.user_id`:

```sql
-- job_runs
ALTER TABLE engine_v2.job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON engine_v2.job_runs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_runs.job_id AND jobs.user_id = auth.uid())
);

-- job_tasks
ALTER TABLE engine_v2.job_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON engine_v2.job_tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_tasks.job_id AND jobs.user_id = auth.uid())
);

-- job_task_artifacts
ALTER TABLE engine_v2.job_task_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON engine_v2.job_task_artifacts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_task_artifacts.job_id AND jobs.user_id = auth.uid())
);

-- job_task_events
ALTER TABLE engine_v2.job_task_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON engine_v2.job_task_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_task_events.job_id AND jobs.user_id = auth.uid())
);
```

**Tables WITHOUT `job_id`** — join via `task_id → job_tasks.job_id → jobs`:

```sql
-- job_task_dependencies (has predecessor_task_id + successor_task_id, no job_id)
ALTER TABLE engine_v2.job_task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON engine_v2.job_task_dependencies FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM engine_v2.job_tasks t
    JOIN public.jobs j ON j.id = t.job_id
    WHERE t.id = job_task_dependencies.successor_task_id
      AND j.user_id = auth.uid()
  )
);

-- job_task_attempts (has task_id, no job_id)
ALTER TABLE engine_v2.job_task_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON engine_v2.job_task_attempts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM engine_v2.job_tasks t
    JOIN public.jobs j ON j.id = t.job_id
    WHERE t.id = job_task_attempts.task_id
      AND j.user_id = auth.uid()
  )
);
```

**Note:** These multi-join RLS policies have a performance cost on large datasets. Acceptable because:
1. engine_v2 tables start empty and grow slowly (internal users only)
2. SELECT via anon client is rare (monitoring/debug only)
3. Production reads use service role (bypasses RLS)

---

## 4. Feature Flag + Allowlist

```javascript
// server/engine-v2/featureFlag.js

const ENGINE_V2_ENABLED = process.env.ENGINE_V2_ENABLED === 'true';
const ENGINE_V2_ALLOWLIST_ONLY = process.env.ENGINE_V2_ALLOWLIST_ONLY !== 'false';
const ALLOWLIST = new Set(
  (process.env.ENGINE_V2_ALLOWLIST || '').split(',').filter(Boolean)
);

function shouldUseV2(verifiedUser) {
  if (!ENGINE_V2_ENABLED) return false;
  if (!ENGINE_V2_ALLOWLIST_ONLY) return true;
  return ALLOWLIST.has(verifiedUser.id) || ALLOWLIST.has(verifiedUser.email);
}
```

**verifiedUser must come from JWT-verified source only. Never from client input.**

| Variable | M1-M2 | M3-M4 | M5 |
|----------|-------|-------|----|
| `ENGINE_V2_ENABLED` | `false` | `true` | `true` |
| `ENGINE_V2_ALLOWLIST_ONLY` | `true` | `true` | `false` |
| `ENGINE_V2_ALLOWLIST` | — | `notef@neighbor.gg` | — |

---

## 5. Routing Branch

### 5.1 Actual Execution Path (verified from code)

```
WebSocket 'message' event
  → server/index.js:1528  case 'message'
    → server/index.js:1658  claudeRunner.runClaudeAsJob()
      → server/claudeRunner.js:1647  runClaudeAsJob() — job creation + slot
        → server/claudeRunner.js:1675  processJobWithSlot() — timeout wrapper
          → server/claudeRunner.js:1716  processJob() — intent, Gemini, prompt
            → server/claudeRunner.js:1956  ★ BRANCH POINT (USE_MODAL check)
              → _runClaudeOnModal()  OR  _runClaudeLocal()
```

**The WebSocket message type is `'message'`, not `'generateGame'`.**
**The branch point is in `claudeRunner.processJob()` at line 1956, not in `index.js`.**

### 5.2 v2 Branch Implementation

Branch at `claudeRunner.js:processJob()` line 1956, where `USE_MODAL` is already checked.

```javascript
// server/claudeRunner.js — processJob() (line 1956 area)
// EXISTING:
if (config.USE_MODAL) {
  return this._runClaudeOnModal(jobId, userId, projectId, prompt, userMessage, detectedSkills);
}
return this._runClaudeLocal(jobId, userId, projectId, projectDir, prompt, userMessage, detectedSkills);

// MODIFIED (minimal change):
if (config.USE_MODAL) {
  // ★ userEmail is passed down from index.js → runClaudeAsJob() → processJob()
  // ★ It originates from ws.userEmail (JWT-verified at WebSocket init)
  const verifiedUser = { id: userId, email: userEmail };
  if (engineV2.shouldUseV2(verifiedUser)) {
    try {
      return await engineV2.run(userId, projectId, userMessage, {
        jobId, prompt, detectedSkills,
        // ★ Use existing jobManager.notifySubscribers pattern (not emit)
        onEvent: (event) => jobManager.notifySubscribers(jobId, event),
      });
    } catch (err) {
      console.warn('[EngineV2] Fallback to v1:', err.message);
      await engineV2.logFallback(jobId, err);
      // Fall through to v1
    }
  }
  return this._runClaudeOnModal(jobId, userId, projectId, prompt, userMessage, detectedSkills);
}
return this._runClaudeLocal(jobId, userId, projectId, projectDir, prompt, userMessage, detectedSkills);
```

### 5.3 Why This Location

| Reason | Detail |
|--------|--------|
| Already a branch point | `USE_MODAL` flag check at line 1956 |
| Job management handled upstream | `processJobWithSlot()` wraps timeout + slot release |
| Intent detection reusable | v2 can reuse or replace the intent detection done earlier in `processJob()` |
| Clean fallback | v2 failure falls through to existing `_runClaudeOnModal()` |

### 5.4 server/index.js Changes

**server/index.js requires NO structural changes.** The v2 branch lives entirely in `claudeRunner.js`.
Only addition: `require('./engine-v2')` at the top of `claudeRunner.js`.

---

## 6. Auth Context

### 6.1 Verified User Source

In the WebSocket flow, user identity is established at connection init:
- `ws.userId` = JWT `sub` claim (verified at init, `server/index.js`)
- `ws.userEmail` = JWT `email` claim (verified at init)
- `claudeRunner` receives `userId` as parameter from the WebSocket handler

### 6.2 Email Lookup for Allowlist

`claudeRunner.processJob()` has `userId` but not `email`. Options:
1. Pass `email` from WebSocket handler through the call chain
2. Look up email from `public.jobs` or Supabase Auth at branch point

**Chosen: Option 1** — pass `userEmail` as part of the existing parameters.
Minimal change: add `userEmail` to `runClaudeAsJob()` and `processJob()` signatures.

```javascript
// server/index.js:1658 (existing call site, add userEmail)
const { job, isExisting, startProcessing } = await claudeRunner.runClaudeAsJob(
  userId,
  currentProjectId,
  userMessage,
  debugOptions,
  ws.userEmail  // ★ add: JWT-verified email
);
```

- `shouldUseV2` receives only this JWT-verified value
- Client-supplied values (req.body.email etc.) are never used

---

## 7. Workflow DAG

### 7.1 Default DAG

```javascript
const DEFAULT_WORKFLOW = {
  tasks: [
    { key: 'intent',       role: 'planner',   weight: 1,  label: '意図を分析中...',   maxAttempts: 2 },
    { key: 'plan',         role: 'planner',   weight: 2,  label: 'ゲームを設計中...', maxAttempts: 2 },
    { key: 'codegen',      role: 'builder',   weight: 5,  label: 'コードを生成中...', maxAttempts: 2 },
    { key: 'asset',        role: 'asset',     weight: 4,  label: '画像を生成中...',   maxAttempts: 2 },
    { key: 'qa_review',    role: 'qa',        weight: 2,  label: '品質チェック中...', maxAttempts: 1 },
    { key: 'fix',          role: 'builder',   weight: 2,  label: '修正中...',         maxAttempts: 2 },
    { key: 'publish_prep', role: 'publisher', weight: 1,  label: '仕上げ中...',       maxAttempts: 1 },
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
```

### 7.2 DAG Visual

```
intent (Haiku, ~1s)
  │
  ▼
plan (Haiku, ~3s)
  │
  ├──────────────┐
  ▼              ▼
codegen          asset
(Gemini, ~15s)   (Vertex, ~20s)
  │                    │
  ▼                    │
qa_review              │
(Haiku, ~3s)           │
  │                    │
  ▼                    │
fix?                   │
(Gemini, ~5s)          │
  │                    │
  ├────────────────────┘
  ▼
publish_prep (~1s)
```

### 7.3 Task Details

| task_key | agent_role | Model | Input | Output |
|----------|-----------|-------|-------|--------|
| intent | planner | Haiku | `{message}` | `{intent: 'chat'\|'edit'\|'restore'}` |
| plan | planner | Haiku | `{message, intent, existing_code}` | `{dimension, skills[], template_id?, image_count, codegen_strategy}` |
| codegen | builder | Gemini → Claude fallback | `{message, plan, skills, template?}` | `{files[{path, content}], summary}` |
| asset | asset | Vertex AI Gemini | `{plan, image_specs[]}` | `{images[{name, uri}]}` |
| qa_review | qa | Haiku | `{files, plan}` | `{issues: int, findings[{severity, description, fix_hint}]}` |
| fix | builder | Gemini | `{files, findings}` | `{files[{path, content}]}` |
| publish_prep | publisher | — | `{files, images, summary}` | `{commit_hash}` |

### 7.4 Conditional Branching

- `intent === 'chat'` → skip all tasks after intent (chat handled separately)
- `qa_review.issues === 0` → skip fix task

---

## 8. DAG Scheduler

### 8.1 Promote Ready Tasks

```sql
UPDATE engine_v2.job_tasks t
SET status = 'ready'
WHERE t.job_id = $1
  AND t.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM engine_v2.job_task_dependencies d
    JOIN engine_v2.job_tasks pred ON pred.id = d.predecessor_task_id
    WHERE d.successor_task_id = t.id
      AND pred.status NOT IN ('succeeded', 'skipped')
  )
RETURNING *
```

### 8.2 Claim Task (exclusive, no double execution)

```sql
UPDATE engine_v2.job_tasks
SET status = 'running',
    started_at = now(),
    attempt_count = attempt_count + 1
WHERE id = (
  SELECT id FROM engine_v2.job_tasks
  WHERE job_id = $1 AND status = 'ready'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *
```

### 8.3 Worker Loop (unified claim pattern)

```javascript
async function runWorkflow(jobId, onEvent, options) {
  const WORKER_COUNT = 3;
  await promoteReadyTasks(jobId);
  const workers = Array.from({ length: WORKER_COUNT }, () =>
    runWorker(jobId, onEvent)
  );
  await Promise.all(workers);
}

async function runWorker(jobId, onEvent) {
  while (true) {
    const task = await claimNextTask(jobId);
    if (!task) {
      const hasRunning = await hasActiveTasks(jobId);
      if (!hasRunning) {
        // Deadlock check: promote first, then retry claim
        await promoteReadyTasks(jobId);
        const retryTask = await claimNextTask(jobId);
        if (retryTask) {
          await executeAndHandle(retryTask, jobId, onEvent);
          continue;
        }
        // Still nothing → check for stuck tasks
        const stuckCount = await countStuckTasks(jobId);
        if (stuckCount > 0) {
          throw new DagDeadlockError(jobId, stuckCount);
        }
        return;  // Normal completion
      }
      await wait(300);
      continue;
    }
    await executeAndHandle(task, jobId, onEvent);
  }
}
```

**hasActiveTasks checks `ready` and `running` only (not `pending`).**

### 8.4 Failure Propagation

When a task exhausts retries → failed → all downstream tasks recursively set to `canceled`.

```sql
WITH RECURSIVE downstream AS (
  SELECT d.successor_task_id AS task_id
  FROM engine_v2.job_task_dependencies d
  WHERE d.predecessor_task_id = $2
  UNION
  SELECT d.successor_task_id
  FROM engine_v2.job_task_dependencies d
  JOIN downstream ds ON ds.task_id = d.predecessor_task_id
)
UPDATE engine_v2.job_tasks
SET status = 'canceled',
    error_code = 'upstream_failed',
    error_message = 'Canceled: upstream task ' || $2 || ' failed'
WHERE id IN (SELECT task_id FROM downstream)
  AND status IN ('pending', 'ready', 'blocked')
```

### 8.5 State Guarantee

Every task reaches exactly one terminal state: `succeeded | skipped | failed | canceled`.
No task remains in `pending` forever:
- Upstream succeeded/skipped → promoteReadyTasks promotes to ready
- Upstream failed → propagateFailure sets to canceled

### 8.6 Deadlock Detection

Triggered when: ready=0, running=0, but pending/blocked > 0.
Cause: circular dependency or missing dependency definition.
Action: `error_code='v2_dag_deadlock'` recorded to `job_runs` + `job_task_events`, then v1 fallback.

---

## 9. Job Completion Responsibility

| Scenario | Who marks `public.jobs` as completed |
|----------|--------------------------------------|
| v1 only | v1 (existing behavior, unchanged) |
| v2 succeeds | v2 marks completed |
| v2 fails → v1 fallback | v1 marks completed (v2 does NOT touch public.jobs) |

**Rule: Exactly one actor marks a job as completed. Never both.**

---

## 10. Staging & Atomic Production Apply

### 10.1 Isolation

v2 works in a staging directory. Production directory is read-only during processing.

```
/tmp/engine-v2-staging/{jobId}/   ← Temporary workspace (GCE local)
/data/users/{userId}/projects/{projectId}/  ← Production (untouched until success)
```

### 10.2 Atomic Rename Swap

```javascript
async function doRenameSwap(userId, projectId, stagingDir) {
  const prodDir = getProjectDir(userId, projectId);
  const backupDir = `${prodDir}.bak.${Date.now()}`;
  const tempTarget = `${prodDir}.new`;

  await fs.cp(stagingDir, tempTarget, { recursive: true });

  const prodExists = await exists(prodDir);

  if (prodExists) {
    await fs.rename(prodDir, backupDir);
    try {
      await fs.rename(tempTarget, prodDir);
    } catch (err) {
      await fs.rename(backupDir, prodDir).catch(() => {});
      await fs.rm(tempTarget, { recursive: true }).catch(() => {});
      // ★ backupDir is NEVER deleted on failure
      throw err;
    }
    // ★ Success only: delete backup
    fs.rm(backupDir, { recursive: true }).catch(() => {});
  } else {
    // First creation
    const parentDir = path.dirname(prodDir);
    await fs.mkdir(parentDir, { recursive: true });
    try {
      await fs.rename(tempTarget, prodDir);
    } catch (err) {
      await fs.rm(tempTarget, { recursive: true }).catch(() => {});
      throw err;
    }
  }
}
```

**Rule: backupDir is deleted ONLY on success. On failure, only tempTarget is cleaned up.**

### 10.3 Concurrency Guard

Advisory lock per projectId prevents simultaneous apply to the same project.

```javascript
async function applyToProduction(userId, projectId, stagingDir) {
  const { key1, key2 } = getAdvisoryLockKey(projectId);

  await db.transaction(async (client) => {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS acquired',
      [key1, key2]
    );
    if (!lockResult.rows[0].acquired) {
      throw new Error('v2_concurrent_apply');
    }
    await doRenameSwap(userId, projectId, stagingDir);
  });
}
```

---

## 11. Modal v2 Endpoints

**v1 functions are NEVER modified. v2 adds new functions with `v2_` prefix.**

### 11.1 Core Extraction Strategy

Current `modal/app.py` already has reusable internal helpers:
- `run_haiku_in_sandbox(prompt, timeout)` — used by both `detect_intent` and `chat_haiku`
- `verify_internal_auth(request)` — auth check used by all endpoints
- `validate_ids(user_id, project_id)` — UUID validation
- `get_proxy_url()`, `get_vertex_env()`, `write_gcp_credentials()` — infra helpers

**v1 endpoint functions (`detect_intent`, `chat_haiku`, `generate_gemini`) contain
request parsing + response formatting logic around these helpers.**

**Strategy: v2 endpoints call the EXISTING helpers directly. No `_core` extraction needed.
v1 endpoint functions are not touched at all.**

```python
# modal/app.py

# ★ v1 (existing, NO CHANGES — lines 1645, 1824, 2262)
@app.function(image=web_image, secrets=[...], volumes={...})
@modal.fastapi_endpoint(method="POST")
async def detect_intent(request: Request):
    # ... existing code unchanged ...

@app.function(image=web_image, secrets=[...], volumes={...})
@modal.fastapi_endpoint(method="POST")
async def chat_haiku(request: Request):
    # ... existing code unchanged ...

@app.function(image=web_image.pip_install("httpx", "Pillow"), secrets=[...], volumes={...})
@modal.fastapi_endpoint(method="POST")
async def generate_gemini(request: Request):
    # ... existing code unchanged ...

# ★ v2 (NEW — calls existing helpers, NOT v1 endpoint functions)
@app.function(image=web_image, secrets=[...], volumes={...})
@modal.fastapi_endpoint(method="POST")
async def v2_detect_intent(request: Request):
    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    body = await request.json()
    message = body.get("message", "")
    # Calls existing helper directly (same as v1 uses internally)
    result = await run_haiku_in_sandbox(f"Intent detection prompt: {message}")
    # Intent output contract: string enum ('chat'|'edit'|'restore')
    # (v1 also parses intent inline in detect_intent at line 1645)
    import json
    try:
        parsed = json.loads(result)
        intent = parsed.get("intent", "chat") if isinstance(parsed, dict) else "chat"
    except (json.JSONDecodeError, TypeError):
        intent = "chat"  # safe default — skips game creation (see 7.4)
    if intent not in ("chat", "edit", "restore"):
        intent = "chat"
    return JSONResponse({"intent": intent})

@app.function(image=web_image, secrets=[...], volumes={...})
@modal.fastapi_endpoint(method="POST")
async def v2_chat_haiku(request: Request):
    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    body = await request.json()
    # Calls existing helper directly
    result = await run_haiku_in_sandbox(body.get("prompt", ""))
    return JSONResponse({"result": result})

@app.function(image=web_image.pip_install("httpx", "Pillow"), secrets=[...], volumes={...})
@modal.fastapi_endpoint(method="POST")
async def v2_generate_code(request: Request):
    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    body = await request.json()
    validate_ids(body["user_id"], body["project_id"])
    # Uses same Gemini/Vertex infra as v1, but v2-specific prompt construction
    # ... streaming response via existing httpx + Vertex pattern ...
```

### 11.2 What This Means for v1

| Item | Impact on v1 |
|------|-------------|
| `detect_intent()` function | **Zero changes** |
| `chat_haiku()` function | **Zero changes** |
| `generate_gemini()` function | **Zero changes** |
| `run_haiku_in_sandbox()` helper | **Zero changes** (called by v2 too) |
| `verify_internal_auth()` helper | **Zero changes** (called by v2 too) |
| New v2_ functions added | **Additive only** — existing functions unaffected |

### 11.3 When v2 Needs Different Logic

If v2 needs to change behavior (e.g., different prompt format for intent detection):
1. Copy the relevant helper logic INTO the v2 function
2. v1 helper stays unchanged
3. v2 function diverges independently

This avoids premature abstraction while maintaining v1 immutability.

---

## 12. DB Client

Direct `pg` connection. No Supabase JS SDK for engine_v2 writes.

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.DATABASE_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false,
  statement_timeout: 30000,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  options: '-c search_path=engine_v2,public',
});
```

---

## 13. Progressive Display

Task completion events streamed via WebSocket using `job_task_events`.

```
 0s:  {type: 'taskStarted',  task_key: 'intent',    label: '意図を分析中...'}
 1s:  {type: 'taskDone',     task_key: 'intent',    progress: 5}
 4s:  {type: 'taskDone',     task_key: 'plan',      progress: 15}
 4s:  {type: 'taskStarted',  task_key: 'codegen',   label: 'コードを生成中...'}
 4s:  {type: 'taskStarted',  task_key: 'asset',     label: '画像を生成中...'}
19s:  {type: 'partialResult', task_key: 'codegen',  ref: 'inline', files: [...]}
19s:  {type: 'taskDone',     task_key: 'codegen',   progress: 55}
22s:  {type: 'taskDone',     task_key: 'qa_review', progress: 70}
22s:  {type: 'taskSkipped',  task_key: 'fix',       progress: 80}
24s:  {type: 'taskDone',     task_key: 'asset',     progress: 95}
25s:  {type: 'taskDone',     task_key: 'publish_prep', progress: 100}
```

**partialResult size limit: 64KB inline, larger files use URI reference.**

---

## 14. Output Compatibility

### 14.1 v2 Canonical Output Schema

v2 `engineV2.run()` returns this single canonical schema:

```javascript
// V2Result — the ONLY output type from engineV2.run()
{
  files: [
    { path: 'index.html', content: '<!DOCTYPE html>...' },
    { path: 'game.js', content: '...' },
  ],
  images: [
    { name: 'cat.png', uri: '/data/staging/{jobId}/assets/cat.png' },
  ],
  summary: 'かわいい猫のシューティングゲームを作成しました',
  qa: {
    issues: 0,
    findings: [],
  },
}
```

**This is NOT the same as `job_task_artifacts`.** Artifacts are DB records for observability.
`V2Result` is assembled by `publish_prep` task from the final state of all artifacts.

### 14.2 Validation (against V2Result schema)

```javascript
function validateOutput(result) {
  if (!result) return false;
  if (!Array.isArray(result.files) || result.files.length === 0) return false;
  if (typeof result.summary !== 'string' || result.summary.length === 0) return false;
  if (!result.files.some(f => f.path === 'index.html')) return false;
  // images array is optional (text-only games have no images)
  // qa is required — qa_review task always runs before publish_prep
  if (!result.qa || typeof result.qa.issues !== 'number' || !Array.isArray(result.qa.findings)) return false;
  return true;
}
```

### 14.3 v1 Format Conversion (for WebSocket delivery)

```javascript
// Convert V2Result → v1 WebSocket message format
function toV1Response(v2Result) {
  return {
    type: 'completed',
    files: v2Result.files,     // Already in [{path, content}] format
    images: v2Result.images,   // Already in [{name, uri}] format
    summary: v2Result.summary,
  };
}
```

### 14.4 Schema Guarantee

| Field | Type | Required | Source Task |
|-------|------|----------|------------|
| `files` | `[{path: string, content: string}]` | Yes | codegen (or fix if QA triggered) |
| `files[].path` must include `index.html` | — | Yes | codegen |
| `images` | `[{name: string, uri: string}]` | No | asset |
| `summary` | `string` | Yes | codegen |
| `qa` | `{issues: int, findings: []}` | Yes | qa_review |

**If `validateOutput` fails → `V2_OUTPUT_INVALID` → v1 fallback.**

---

## 15. Fallback Error Codes

Structured codes for aggregation:

| Code | Meaning |
|------|---------|
| `v2_output_invalid` | Required fields missing |
| `v2_task_failed` | Task execution failure (after all retries) |
| `v2_timeout` | Overall job timeout |
| `v2_scheduler_error` | Scheduler internal error |
| `v2_dag_deadlock` | Circular/missing dependency detected |
| `v2_staging_error` | Staging filesystem operation failure |
| `v2_concurrent_apply` | Advisory lock not acquired |
| `v2_unknown` | Unclassified error |

Recorded to both `engine_v2.job_runs.error_code` and `engine_v2.job_task_events`.

---

## 16. Rollback Procedure

### Instant Stop (seconds)

1. `ENGINE_V2_ENABLED=false` → `pm2 restart dreamcore-sandbox`
2. v2 endpoints receive zero traffic immediately

### Verification

3. `SELECT count(*) FROM engine_v2.job_runs WHERE status = 'running'` → must be 0

### Full Removal (planned, not urgent)

4. `DROP SCHEMA engine_v2 CASCADE` — DB cleanup
5. `rm -rf server/engine-v2/` — Express code cleanup
6. Remove v2 methods from `server/modalClient.js`
7. Remove routing branch from `server/index.js`
8. Remove v2_ functions from `modal/app.py` → `modal deploy`
9. Remove v2 env vars from `.env`

**public schema has zero traces after removal.**

### Patterns That Break Rollback (NEVER DO)

1. Overwriting existing Modal v1 functions with v2 logic
2. Adding v2-dependent columns/constraints to existing DB tables
3. v2 writing directly to production directory (bypassing staging)

---

## 17. Migration Plan

| Phase | Content | Env Vars | User Impact |
|-------|---------|---------|-------------|
| **M1** | Schema + code skeleton + feature flag (OFF) | `ENABLED=false` | None |
| **M2** | Dual-write (v1 processes, v2 records minimally) | `ENABLED=false` | None |
| **M3** | Shadow execution (v2 runs but results discarded, compare only) | `ENABLED=true, ALLOWLIST=internal` | None |
| **M4** | Internal allowlist gets v2 responses | `ENABLED=true, ALLOWLIST=notef@...` | Internal only |
| **M5** | Gradual expansion after metrics pass | Expand `ALLOWLIST` | Gradual |

### M1 Scope

- `engine_v2` schema migration (flag OFF, tables unused)
- `server/engine-v2/` directory with all file skeletons
- `featureFlag.js` with `shouldUseV2`
- `modal/app.py` v2_ endpoint additions (calling existing helpers directly)
- `server/claudeRunner.js` v2 branch at `processJob()` line 1956 (always takes v1 path when ENABLED=false)
- `server/index.js` passes `ws.userEmail` to `runClaudeAsJob()` (minimal signature change)

### M1 Completion Criteria

**Non-regression (flag OFF):**
1. `ENGINE_V2_ENABLED=false` on production
2. All existing E2E tests pass (game creation, edit, chat flows)
3. `SELECT count(*) FROM engine_v2.job_runs` = 0 (zero v2 traffic)
4. v1 game creation latency unchanged (no performance regression from code addition)

**v2 code safety:**
5. `shouldUseV2({id:'test', email:'test'})` returns `false` when `ENGINE_V2_ENABLED=false`
6. `require('./engine-v2')` does not throw when loaded (module loads cleanly)
7. `engine_v2` schema tables exist and are empty

**Rollback rehearsal:**
8. `ENGINE_V2_ENABLED=false` → confirm zero v2 code paths execute
9. `DROP SCHEMA engine_v2 CASCADE` → confirm no errors, no v1 impact
10. Re-apply migration → confirm schema recreates cleanly

**Modal v2 endpoints:**
11. `v2_detect_intent`, `v2_chat_haiku`, `v2_generate_code` respond to POST (auth required)
12. Existing v1 endpoints (`detect_intent`, `chat_haiku`, `generate_gemini`) behavior unchanged

---

## 18. SLO Monitoring

Aggregated from `job_task_attempts` + `job_task_events`.

| Metric | v1 Baseline | v2 Target |
|--------|-------------|-----------|
| Success rate | Measure | >= v1 |
| P50 latency | Measure | <= v1 |
| P95 latency | Measure | <= v1 × 1.2 |
| Cost/job | Measure | <= v1 × 1.5 |
| Retry rate | Measure | < v1 (QA effect) |
| Fallback rate | — | < 5% |

---

## 19. Cost Estimate

| Task | Model | Est. Tokens | Est. Cost/run |
|------|-------|-------------|---------------|
| intent | Haiku | 500 in / 50 out | ~$0.0003 |
| plan | Haiku | 1,000 in / 200 out | ~$0.001 |
| codegen | Gemini 2.0 Flash | 5,000 in / 3,000 out | ~$0.003 |
| asset | Vertex Gemini | — | ~$0.04/image |
| qa_review | Haiku | 3,000 in / 300 out | ~$0.002 |
| fix | Gemini | 5,000 in / 2,000 out | ~$0.002 |
| publish_prep | None (local) | — | $0 |

**v2 additional cost: ~$0.004/job for qa_review + fix.**
One user retry costs $0.003 (codegen). If QA prevents even one retry, it pays for itself.

---

## 20. Future Extensions

### Phase 2: Claude Code Team Agents

`agent_role` field enables multi-agent execution without schema changes.

```
codegen task internally spawns Claude Code team:
  ├── game-logic agent (game.js)
  ├── ui agent (index.html + CSS)
  └── audio agent (BGM/SFX synthesis)
```

Token/cost tracking per agent via `job_task_attempts`.

### Phase 3: Template-Based Generation

`plan` task selects `template_id` → `codegen` customizes template instead of generating from scratch.
Templates stored in `public/templates/{template_id}/`.
3-5x speed improvement, more consistent quality.
