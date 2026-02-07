#!/usr/bin/env node
/**
 * test-shadow-20.js
 *
 * Run 20 game-edit jobs on GCE to exercise Engine V2 shadow mode.
 * After all jobs complete, query DB for shadow run results.
 *
 * Usage:
 *   node test-shadow-20.js
 *   node test-shadow-20.js --count=5    # override job count
 *   node test-shadow-20.js --dry-run    # auth + connect only, no jobs
 */
'use strict';

const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WS_URL = 'wss://v2.dreamcore.gg';
const STAFF_EMAIL = 'notef@neighbor.gg';
// Use an initialized project to skip style selection
const TEST_PROJECT_ID = '019c358b-2a8d-7385-b2fb-57da3480672d'; // Bubble Magic Puzzle

const JOB_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes per job
const INTER_JOB_DELAY_MS = 2000;       // 2s pause between jobs

// 20 varied edit messages (all trigger gemini code gen + shadow)
const MESSAGES = [
  'スコアの色を赤に変更して',
  '背景色を少し暗くして',
  'タイトルのフォントサイズを大きくして',
  'リトライボタンのデザインを丸くして',
  'スコア表示を画面の右上に移動して',
  'ゲームオーバー時の文字を大きくして',
  'プレイヤーの移動速度を少し速くして',
  'ボタンの色を緑に変えて',
  '画面の背景をグラデーションにして',
  'スコアのフォントをボールドにして',
  'タイトル画面のテキストを中央揃えにして',
  'ゲームエリアの枠線を追加して',
  '効果音のボリュームを小さくして',
  'クリア時のメッセージを変更して',
  '残りライフの表示位置を変えて',
  'ボタンにホバーエフェクトを追加して',
  'スタート画面の背景色を変えて',
  '文字の影を追加して',
  'ゲーム画面の余白を調整して',
  'フッターにバージョン番号を表示して',
];

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const countArg = args.find(a => a.startsWith('--count='));
const JOB_COUNT = countArg ? parseInt(countArg.split('=')[1], 10) : 20;
const DRY_RUN = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// Auth: get access_token via admin magic link
// ---------------------------------------------------------------------------

async function getAccessToken() {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Generate magic link (no email sent)
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: STAFF_EMAIL,
  });

  if (linkError) throw new Error(`generateLink failed: ${linkError.message}`);

  const tokenHash = linkData.properties.hashed_token;

  // Verify the token to get a session
  const supabaseAnon = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: verifyData, error: verifyError } = await supabaseAnon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  if (verifyError) throw new Error(`verifyOtp failed: ${verifyError.message}`);
  if (!verifyData.session?.access_token) throw new Error('No access_token in verify response');

  return verifyData.session.access_token;
}

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------

function connectWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sendJSON(ws, obj) {
  ws.send(JSON.stringify(obj));
}

/**
 * Wait for a message matching the predicate.
 * Returns the parsed message or throws on timeout.
 */
function waitFor(ws, predicate, timeoutMs = 30000, label = '') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for ${label} (${timeoutMs}ms)`));
    }, timeoutMs);

    function handler(raw) {
      try {
        const msg = JSON.parse(raw);
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(msg);
        }
      } catch (_) { /* ignore parse errors */ }
    }

    ws.on('message', handler);
  });
}

// ---------------------------------------------------------------------------
// Job runner
// ---------------------------------------------------------------------------

async function runOneJob(ws, index, message) {
  const tag = `[${String(index + 1).padStart(2, '0')}/${JOB_COUNT}]`;
  const shortMsg = message.slice(0, 20);
  process.stdout.write(`${tag} "${shortMsg}..." → `);

  const startTime = Date.now();

  // Send message
  sendJSON(ws, {
    type: 'message',
    content: message,
    skipStyleSelection: true,
  });

  // Wait for jobStarted
  try {
    await waitFor(ws, m => m.type === 'jobStarted', 15000, 'jobStarted');
  } catch (_) {
    // Some messages may be handled as chat without job
    console.log('no job (chat?) — skipped');
    return { index, status: 'no_job', elapsed: Date.now() - startTime };
  }

  // Wait for completion (gameUpdated) or failure
  try {
    const result = await waitFor(
      ws,
      m => m.type === 'gameUpdated' || m.type === 'failed' ||
           (m.type === 'jobUpdate' && m.status === 'failed') ||
           (m.type === 'error' && m.error?.code),
      JOB_TIMEOUT_MS,
      'completion'
    );

    const elapsed = Date.now() - startTime;
    const status = result.type === 'gameUpdated' ? 'ok' : 'v1_failed';
    console.log(`${status} (${(elapsed / 1000).toFixed(1)}s)`);
    return { index, status, elapsed };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.log(`TIMEOUT (${(elapsed / 1000).toFixed(1)}s)`);
    return { index, status: 'timeout', elapsed };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Engine V2 Shadow Test ===');
  console.log(`Target: ${WS_URL}`);
  console.log(`Staff:  ${STAFF_EMAIL}`);
  console.log(`Jobs:   ${JOB_COUNT}`);
  console.log(`Project: ${TEST_PROJECT_ID}`);
  console.log('');

  // 1. Get auth token
  process.stdout.write('Authenticating... ');
  const token = await getAccessToken();
  console.log('OK');

  // 2. Connect WebSocket
  process.stdout.write('Connecting WebSocket... ');
  const ws = await connectWS(WS_URL);
  console.log('OK');

  // 3. Init auth
  process.stdout.write('Sending init... ');
  sendJSON(ws, { type: 'init', access_token: token });
  const initResp = await waitFor(ws, m => m.type === 'init', 10000, 'init');
  console.log(`OK (userId: ${initResp.userId})`);

  // 4. Select project
  process.stdout.write('Selecting project... ');
  sendJSON(ws, { type: 'selectProject', projectId: TEST_PROJECT_ID });
  await waitFor(ws, m => m.type === 'projectSelected', 10000, 'projectSelected');
  console.log('OK');

  if (DRY_RUN) {
    console.log('\n--dry-run: stopping before jobs');
    ws.close();
    return;
  }

  // 5. Run jobs
  console.log(`\n--- Running ${JOB_COUNT} jobs ---\n`);
  const startAll = Date.now();
  const results = [];

  for (let i = 0; i < JOB_COUNT; i++) {
    const msg = MESSAGES[i % MESSAGES.length];
    const result = await runOneJob(ws, i, msg);
    results.push(result);

    // Brief pause between jobs
    if (i < JOB_COUNT - 1) {
      await new Promise(r => setTimeout(r, INTER_JOB_DELAY_MS));
    }
  }

  const totalElapsed = Date.now() - startAll;
  console.log(`\n--- Complete: ${(totalElapsed / 1000).toFixed(0)}s total ---\n`);

  // 6. Summary
  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'v1_failed').length;
  const timeouts = results.filter(r => r.status === 'timeout').length;
  const noJob = results.filter(r => r.status === 'no_job').length;

  console.log('V1 Job Results:');
  console.log(`  OK:       ${ok}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Timeout:  ${timeouts}`);
  console.log(`  No Job:   ${noJob}`);

  // 7. Wait for shadow runs to finish (they're async, give them time)
  console.log('\nWaiting 30s for shadow runs to complete...');
  await new Promise(r => setTimeout(r, 30000));

  // 8. Query shadow results
  console.log('\n--- Shadow Run Results (DB query) ---\n');
  console.log('Run this SQL to check:');
  console.log(`
SELECT
  status,
  error_code,
  count(*) AS cnt
FROM engine_v2.job_runs
WHERE created_at > now() - interval '2 hours'
  AND mode = 'shadow'
GROUP BY status, error_code
ORDER BY status;
  `);

  ws.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
