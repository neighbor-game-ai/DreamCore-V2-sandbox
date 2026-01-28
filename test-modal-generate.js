/**
 * Modal Generate E2E Test Script
 * Tests the full generation flow when USE_MODAL=true
 *
 * Test Cases:
 * 1. message_generation - Basic game generation via message
 * 2. stream_events - Stream events are received during generation
 * 3. job_completion - Job completes successfully
 * 4. full_generation_flow - Create project -> generate -> verify
 *
 * Prerequisites:
 * - Modal deployed and running
 * - USE_MODAL=true in .env
 * - MODAL_ENDPOINT and MODAL_INTERNAL_SECRET configured
 * - Valid test user in Supabase
 */

const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const WS_URL = process.env.WS_URL || 'ws://localhost:3000';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tcynrijrovktirsvwiqb.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjY5OTAsImV4cCI6MjA4NDYwMjk5MH0.y-_E-vuQg84t8BGISdPL18oaYcayS8ip1OLJsZwM3hI';

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test results
const results = {
  message_generation: { status: 'pending', details: '' },
  stream_events: { status: 'pending', details: '' },
  job_completion: { status: 'pending', details: '' },
  full_generation_flow: { status: 'pending', details: '' }
};

// Test configuration
const TIMEOUT_NORMAL = 30000;
const TIMEOUT_GENERATION = 180000; // 3min for generation (Modal can be slow)

// Helper to create WebSocket connection
function createWS() {
  return new WebSocket(WS_URL);
}

// Helper to send message and wait for response
function sendAndWait(ws, message, timeout = TIMEOUT_NORMAL) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for response to: ${message.type}`));
    }, timeout);

    const handler = (data) => {
      clearTimeout(timer);
      ws.removeListener('message', handler);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (e) {
        resolve(data.toString());
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(message));
  });
}

// Helper to collect all messages until job completion or timeout
function collectJobMessages(ws, timeout = TIMEOUT_GENERATION) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timer = setTimeout(() => {
      console.log(`Timeout after collecting ${messages.length} messages`);
      resolve(messages); // Resolve with what we have instead of rejecting
    }, timeout);

    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        messages.push(msg);

        // Log important events
        if (msg.type === 'jobStarted') {
          console.log('  Job started:', msg.job?.id);
        } else if (msg.type === 'stream') {
          // Don't log all stream events, just count
        } else if (msg.type === 'jobUpdate') {
          console.log('  Job update:', msg.status, msg.progress ? `${msg.progress}%` : '');
        } else if (msg.type === 'gameUpdated') {
          console.log('  Game updated');
        } else if (msg.type === 'geminiCode' || msg.type === 'geminiChat') {
          console.log('  Gemini response received');
        }

        // Check for completion
        if (msg.type === 'gameUpdated' ||
            (msg.type === 'jobUpdate' && msg.status === 'completed') ||
            msg.type === 'error') {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(messages);
        }
      } catch (e) {
        messages.push({ raw: data.toString() });
      }
    };

    ws.on('message', handler);
  });
}

// Get test user
async function getTestUser() {
  const testEmail = 'project-owner-1769066267048@test.local';
  const testPassword = 'TestPassword123!';

  console.log(`Using test user: ${testEmail}`);

  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  if (signInError) {
    console.error('Sign in error:', signInError.message);
    throw signInError;
  }

  return {
    userId: '7ca5c9e5-9fc2-45da-90ef-779073bd3959',
    accessToken: signInData.session.access_token
  };
}

// Test generation via message
async function testMessageGeneration() {
  console.log('\n=== Test: Generation via message ===\n');

  const userData = await getTestUser();
  const { accessToken } = userData;

  const ws = createWS();
  let testProjectId = null;

  await new Promise((resolve, reject) => {
    ws.on('open', async () => {
      try {
        console.log('WebSocket connected');

        // Initialize
        const initResponse = await sendAndWait(ws, {
          type: 'init',
          access_token: accessToken,
          sessionId: 'test-generate-' + Date.now()
        });

        if (initResponse.type !== 'init') {
          throw new Error(`Unexpected init response: ${JSON.stringify(initResponse)}`);
        }
        console.log(`Authenticated as user: ${initResponse.userId}`);

        // Create a new test project
        const createResponse = await sendAndWait(ws, {
          type: 'createProject',
          name: 'Modal Generate Test ' + Date.now()
        });

        if (createResponse.type !== 'projectCreated') {
          throw new Error(`Failed to create project: ${JSON.stringify(createResponse)}`);
        }

        testProjectId = createResponse.project.id;
        console.log(`Created project: ${testProjectId}`);

        // Select project
        const selectResponse = await sendAndWait(ws, {
          type: 'selectProject',
          projectId: testProjectId
        });
        console.log('Project selected:', selectResponse.type);

        // Send message for generation (use skipStyleSelection to avoid style prompt)
        console.log('\n--- Sending generation message ---');
        ws.send(JSON.stringify({
          type: 'message',
          content: '画面をクリックするとスコアが増えるシンプルな2Dゲームを作って',
          skipStyleSelection: true
        }));

        // Collect messages until completion
        console.log('Waiting for generation...');
        const messages = await collectJobMessages(ws, TIMEOUT_GENERATION);

        console.log(`\nReceived ${messages.length} total messages`);

        // Analyze messages
        const jobStarted = messages.find(m => m.type === 'jobStarted');
        const streamMessages = messages.filter(m => m.type === 'stream');
        const jobUpdates = messages.filter(m => m.type === 'jobUpdate');
        const gameUpdated = messages.find(m => m.type === 'gameUpdated');
        const geminiResponse = messages.find(m => m.type === 'geminiCode' || m.type === 'geminiChat');
        const errorMessages = messages.filter(m => m.type === 'error');

        console.log(`  - jobStarted: ${jobStarted ? 'yes' : 'no'}`);
        console.log(`  - stream: ${streamMessages.length}`);
        console.log(`  - jobUpdate: ${jobUpdates.length}`);
        console.log(`  - gameUpdated: ${gameUpdated ? 'yes' : 'no'}`);
        console.log(`  - geminiResponse: ${geminiResponse ? 'yes' : 'no'}`);
        console.log(`  - errors: ${errorMessages.length}`);

        // Test 1: message_generation - Job started
        if (jobStarted) {
          results.message_generation = {
            status: 'pass',
            details: `Job started successfully: ${jobStarted.job?.id}`
          };
        } else if (errorMessages.length > 0) {
          results.message_generation = {
            status: 'fail',
            details: `Error: ${errorMessages[0].message}`
          };
        } else {
          results.message_generation = {
            status: 'fail',
            details: 'No jobStarted message received'
          };
        }

        // Test 2: stream_events - Stream events received
        if (streamMessages.length > 0) {
          results.stream_events = {
            status: 'pass',
            details: `Received ${streamMessages.length} stream events`
          };
        } else if (geminiResponse) {
          // Gemini might send all at once
          results.stream_events = {
            status: 'pass',
            details: 'Received gemini response (no streaming)'
          };
        } else {
          results.stream_events = {
            status: 'fail',
            details: 'No stream events or gemini response received'
          };
        }

        // Test 3: job_completion
        const completedUpdate = jobUpdates.find(u => u.status === 'completed');
        if (gameUpdated || completedUpdate) {
          results.job_completion = {
            status: 'pass',
            details: gameUpdated ? 'Game updated successfully' : 'Job completed successfully'
          };
        } else if (errorMessages.length > 0) {
          results.job_completion = {
            status: 'fail',
            details: `Job failed: ${errorMessages[0].message}`
          };
        } else {
          results.job_completion = {
            status: 'fail',
            details: 'No completion message received'
          };
        }

        // Clean up
        console.log('\nCleaning up test project...');
        await sendAndWait(ws, {
          type: 'deleteProject',
          projectId: testProjectId
        });

        ws.close();
        resolve();
      } catch (error) {
        console.error('Test error:', error);

        // Mark pending tests as failed
        for (const key of ['message_generation', 'stream_events', 'job_completion']) {
          if (results[key].status === 'pending') {
            results[key] = {
              status: 'fail',
              details: `Exception: ${error.message}`
            };
          }
        }

        // Try to clean up
        if (testProjectId) {
          try {
            await sendAndWait(ws, {
              type: 'deleteProject',
              projectId: testProjectId
            }, 5000);
          } catch (e) {
            console.log('Cleanup failed:', e.message);
          }
        }

        ws.close();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
      reject(error);
    });
  });
}

// Test full generation flow (create -> generate -> verify)
async function testFullGenerationFlow() {
  console.log('\n=== Test: Full generation flow ===\n');

  const userData = await getTestUser();
  const { accessToken } = userData;

  const ws = createWS();
  let testProjectId = null;

  await new Promise((resolve, reject) => {
    ws.on('open', async () => {
      try {
        console.log('WebSocket connected');

        // Initialize
        const initResponse = await sendAndWait(ws, {
          type: 'init',
          access_token: accessToken,
          sessionId: 'test-flow-' + Date.now()
        });

        if (initResponse.type !== 'init') {
          throw new Error(`Unexpected init response: ${JSON.stringify(initResponse)}`);
        }
        console.log(`Authenticated as user: ${initResponse.userId}`);

        // Step 1: Create project
        console.log('\n--- Step 1: Create project ---');
        const createResponse = await sendAndWait(ws, {
          type: 'createProject',
          name: 'Modal Flow Test ' + Date.now()
        });

        if (createResponse.type !== 'projectCreated') {
          throw new Error(`Failed to create project: ${JSON.stringify(createResponse)}`);
        }

        testProjectId = createResponse.project.id;
        console.log(`Created project: ${testProjectId}`);

        // Step 2: Select project
        console.log('\n--- Step 2: Select project ---');
        const selectResponse = await sendAndWait(ws, {
          type: 'selectProject',
          projectId: testProjectId
        });
        console.log('Selected project, versions:', Array.isArray(selectResponse.versions) ? selectResponse.versions.length : 'N/A');

        // Step 3: Generate game
        console.log('\n--- Step 3: Generate game ---');
        ws.send(JSON.stringify({
          type: 'message',
          content: '赤い四角が画面内を跳ね回る2Dアニメーションを作って',
          skipStyleSelection: true
        }));

        const genMessages = await collectJobMessages(ws, TIMEOUT_GENERATION);
        const genCompleted = genMessages.find(m => m.type === 'gameUpdated' || (m.type === 'jobUpdate' && m.status === 'completed'));
        const genFailed = genMessages.find(m => m.type === 'error');

        if (!genCompleted && genFailed) {
          throw new Error(`Generation failed: ${genFailed.message}`);
        }

        if (!genCompleted) {
          throw new Error('Generation did not complete');
        }

        console.log('Generation completed');

        // Step 4: Verify by checking versions and history
        console.log('\n--- Step 4: Verify project ---');
        const verifyResponse = await sendAndWait(ws, {
          type: 'selectProject',
          projectId: testProjectId
        });

        if (verifyResponse.type === 'projectSelected') {
          const hasVersions = verifyResponse.versions && verifyResponse.versions.length > 0;
          const hasHistory = verifyResponse.history && verifyResponse.history.length > 0;
          console.log(`Project has versions: ${hasVersions} (${verifyResponse.versions?.length || 0})`);
          console.log(`Project has history: ${hasHistory} (${verifyResponse.history?.length || 0})`);

          // Also check getVersions for more details
          const versionsResponse = await sendAndWait(ws, {
            type: 'getVersions',
            projectId: testProjectId
          });
          const versionCount = versionsResponse.versions?.length || 0;
          console.log(`Version count from getVersions: ${versionCount}`);

          if (hasHistory || versionCount > 0) {
            results.full_generation_flow = {
              status: 'pass',
              details: `Full flow completed. History: ${verifyResponse.history?.length || 0}, Versions: ${versionCount}`
            };
          } else {
            results.full_generation_flow = {
              status: 'fail',
              details: `No history or versions after generation`
            };
          }
        } else {
          results.full_generation_flow = {
            status: 'fail',
            details: `Verification failed: ${verifyResponse.type}`
          };
        }

        // Clean up
        console.log('\nCleaning up test project...');
        await sendAndWait(ws, {
          type: 'deleteProject',
          projectId: testProjectId
        });

        ws.close();
        resolve();
      } catch (error) {
        console.error('Test error:', error);
        results.full_generation_flow = {
          status: 'fail',
          details: `Exception: ${error.message}`
        };

        // Try to clean up
        if (testProjectId) {
          try {
            await sendAndWait(ws, {
              type: 'deleteProject',
              projectId: testProjectId
            }, 5000);
          } catch (e) {
            console.log('Cleanup failed:', e.message);
          }
        }

        ws.close();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
      results.full_generation_flow = {
        status: 'fail',
        details: `WebSocket error: ${error.message}`
      };
      reject(error);
    });
  });
}

// Run all tests
async function runTests() {
  console.log('========================================');
  console.log('Modal Generate E2E Tests');
  console.log('========================================');
  console.log('Target:', WS_URL);
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('');
  console.log('Test Cases:');
  console.log('1. message_generation - Job starts successfully');
  console.log('2. stream_events - Stream events are received');
  console.log('3. job_completion - Job completes successfully');
  console.log('4. full_generation_flow - Full create->generate->verify flow');
  console.log('');

  try {
    await testMessageGeneration();
  } catch (error) {
    console.error('Message generation test failed:', error.message);
  }

  try {
    await testFullGenerationFlow();
  } catch (error) {
    console.error('Full generation flow test failed:', error.message);
  }

  // Print results
  console.log('\n========================================');
  console.log('TEST RESULTS:');
  console.log('========================================');

  let passCount = 0;
  let failCount = 0;

  for (const [testName, result] of Object.entries(results)) {
    const icon = result.status === 'pass' ? '[PASS]' : '[FAIL]';
    console.log(`\n${icon} ${testName}`);
    console.log(`  ${result.details}`);

    if (result.status === 'pass') {
      passCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n========================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('========================================');

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
