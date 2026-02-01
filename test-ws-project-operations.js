/**
 * WebSocket Project Operations Test Script
 * Tests createProject, renameProject, deleteProject, getProjectInfo
 *
 * NOTE: Uses existing user from database because of foreign key constraints
 * between projects.user_id and the users table.
 *
 * Test Cases:
 * 1. createProject - success & verification
 * 2. renameProject - success & verification
 * 3. deleteProject - success & verification
 * 4. getProjectInfo - owner only success
 */

const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const WS_URL = 'ws://localhost:3000';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tcynrijrovktirsvwiqb.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjY5OTAsImV4cCI6MjA4NDYwMjk5MH0.y-_E-vuQg84t8BGISdPL18oaYcayS8ip1OLJsZwM3hI';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTAyNjk5MCwiZXhwIjoyMDg0NjAyOTkwfQ.ayxOHlTtxqAsYAiMXR7BTPyY4e_nP2G8aLWL1cnKkV4';

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test results
const results = {
  createProject: { status: 'pending', details: '' },
  renameProject: { status: 'pending', details: '' },
  deleteProject: { status: 'pending', details: '' },
  getProjectInfo_owner: { status: 'pending', details: '' },
  getProjectInfo_other: { status: 'pending', details: '' }
};

// Reset quota for test user (to avoid quota limit issues)
async function resetQuotaForTestUser(userId) {
  console.log(`Resetting quota for user: ${userId}`);
  // Delete quota entry - it will be recreated with 0 counts on next use
  const { error } = await supabaseAdmin
    .from('usage_quotas')
    .delete()
    .eq('user_id', userId);

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows deleted (OK)
    console.warn('Warning: Could not reset quota:', error.message);
  } else {
    console.log('Quota reset successfully');
  }
}

// Helper to create WebSocket connection
function createWS() {
  return new WebSocket(WS_URL);
}

// Helper to send message and wait for response
function sendAndWait(ws, message, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for response'));
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

// Get test user - use existing user with projects (to bypass FK issues)
async function getOrCreateTestUser() {
  // Use the existing working user who has projects
  const testEmail = 'project-owner-1769066267048@test.local';
  const testPassword = 'TestPassword123!';

  console.log(`Using existing test user: ${testEmail}`);

  // Sign in
  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  if (signInError) {
    console.error('Sign in error:', signInError.message);
    throw signInError;
  }

  return {
    user: { id: '7ca5c9e5-9fc2-45da-90ef-779073bd3959', email: testEmail },
    accessToken: signInData.session.access_token,
    isNew: false
  };
}

// Get second test user for cross-user tests
async function getOrCreateSecondTestUser() {
  const testEmail = 'test-owner-403-1769066215822@test.local';
  const testPassword = 'TestPassword123!';

  console.log(`Using existing second test user: ${testEmail}`);

  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  if (signInError) {
    console.error('Sign in error for second user:', signInError.message);
    throw signInError;
  }

  return {
    user: { id: '594651f0-abc2-4fb8-aad5-6a6abb3a4dcb', email: testEmail },
    accessToken: signInData.session.access_token
  };
}

// Test all project operations
async function runProjectOperationsTests() {
  console.log('\n=== Test: Project Operations via WebSocket ===\n');

  let createdProjectId = null;

  try {
    // Get persistent test users
    const user1Data = await getOrCreateTestUser();
    const accessToken1 = user1Data.accessToken;
    const userId1 = user1Data.user.id;

    // Reset quota for test user to avoid quota limit issues
    await resetQuotaForTestUser(userId1);

    const user2Data = await getOrCreateSecondTestUser();
    const accessToken2 = user2Data.accessToken;

    // Connect WebSocket for user 1
    const ws1 = createWS();

    await new Promise((resolve, reject) => {
      ws1.on('open', async () => {
        try {
          console.log('\n--- WebSocket connected for User 1 ---');

          // Initialize with access token
          const initResponse = await sendAndWait(ws1, {
            type: 'init',
            access_token: accessToken1,
            sessionId: 'test-session-1'
          });
          console.log('Init response:', JSON.stringify(initResponse));

          if (initResponse.type !== 'init') {
            throw new Error(`Unexpected init response: ${JSON.stringify(initResponse)}`);
          }
          console.log(`Authenticated as user: ${initResponse.userId}`);

          // ===== Test 1: createProject =====
          console.log('\n--- Test 1: createProject ---');
          const createResponse = await sendAndWait(ws1, {
            type: 'createProject',
            name: 'Test Project WebSocket'
          });
          console.log('createProject response:', JSON.stringify(createResponse));

          if (createResponse.type === 'projectCreated' && createResponse.project && createResponse.project.id) {
            createdProjectId = createResponse.project.id;

            // Verify project was created by fetching it
            const getInfoResponse = await sendAndWait(ws1, {
              type: 'getProjectInfo',
              projectId: createdProjectId
            });
            console.log('getProjectInfo (verify create):', JSON.stringify(getInfoResponse));

            if (getInfoResponse.type === 'projectInfo' &&
                getInfoResponse.project &&
                getInfoResponse.project.name === 'Test Project WebSocket') {
              results.createProject = {
                status: 'pass',
                details: `Project created: ${createdProjectId}, name: ${createResponse.project.name}`
              };
            } else {
              results.createProject = {
                status: 'fail',
                details: `Project created but verification failed: ${JSON.stringify(getInfoResponse)}`
              };
            }
          } else {
            results.createProject = {
              status: 'fail',
              details: `Unexpected response: ${JSON.stringify(createResponse)}`
            };
          }

          // ===== Test 2: renameProject =====
          if (createdProjectId) {
            console.log('\n--- Test 2: renameProject ---');
            const renameResponse = await sendAndWait(ws1, {
              type: 'renameProject',
              projectId: createdProjectId,
              name: 'Renamed Project WebSocket'
            });
            console.log('renameProject response:', JSON.stringify(renameResponse));

            if (renameResponse.type === 'projectRenamed' &&
                renameResponse.project &&
                renameResponse.project.name === 'Renamed Project WebSocket') {

              // Verify rename
              const getInfoResponse = await sendAndWait(ws1, {
                type: 'getProjectInfo',
                projectId: createdProjectId
              });
              console.log('getProjectInfo (verify rename):', JSON.stringify(getInfoResponse));

              if (getInfoResponse.type === 'projectInfo' &&
                  getInfoResponse.project &&
                  getInfoResponse.project.name === 'Renamed Project WebSocket') {
                results.renameProject = {
                  status: 'pass',
                  details: `Project renamed successfully to: ${renameResponse.project.name}`
                };
              } else {
                results.renameProject = {
                  status: 'fail',
                  details: `Rename response OK but verification failed: ${JSON.stringify(getInfoResponse)}`
                };
              }
            } else {
              results.renameProject = {
                status: 'fail',
                details: `Unexpected response: ${JSON.stringify(renameResponse)}`
              };
            }
          }

          // ===== Test 3: getProjectInfo - owner only success =====
          console.log('\n--- Test 3: getProjectInfo - Owner Only ---');

          // Test 3a: Owner should succeed (already tested above, but explicit)
          if (createdProjectId) {
            const ownerInfoResponse = await sendAndWait(ws1, {
              type: 'getProjectInfo',
              projectId: createdProjectId
            });
            console.log('getProjectInfo (owner):', JSON.stringify(ownerInfoResponse));

            if (ownerInfoResponse.type === 'projectInfo' && ownerInfoResponse.project) {
              results.getProjectInfo_owner = {
                status: 'pass',
                details: `Owner can access project info: ${JSON.stringify(ownerInfoResponse.project)}`
              };
            } else {
              results.getProjectInfo_owner = {
                status: 'fail',
                details: `Owner should be able to access: ${JSON.stringify(ownerInfoResponse)}`
              };
            }
          }

          ws1.close();
          resolve();
        } catch (error) {
          console.error('Test error:', error);
          ws1.close();
          reject(error);
        }
      });

      ws1.on('error', (error) => {
        console.error('WebSocket error (user 1):', error.message);
        reject(error);
      });

      ws1.on('close', (code, reason) => {
        console.log(`WebSocket closed (user 1): code=${code}, reason=${reason}`);
      });
    });

    // Test with User 2 (non-owner access)
    if (createdProjectId) {
      console.log('\n--- Test 3b: getProjectInfo - Other User (should fail) ---');

      const ws2 = createWS();

      await new Promise((resolve, reject) => {
        ws2.on('open', async () => {
          try {
            console.log('WebSocket connected for User 2');

            // Initialize with user 2's access token
            const initResponse = await sendAndWait(ws2, {
              type: 'init',
              access_token: accessToken2,
              sessionId: 'test-session-2'
            });
            console.log('Init response (user 2):', JSON.stringify(initResponse));

            // Try to access user 1's project
            const otherInfoResponse = await sendAndWait(ws2, {
              type: 'getProjectInfo',
              projectId: createdProjectId
            });
            console.log('getProjectInfo (other user):', JSON.stringify(otherInfoResponse));

            if (otherInfoResponse.type === 'error' &&
                otherInfoResponse.message === 'Access denied') {
              results.getProjectInfo_other = {
                status: 'pass',
                details: `Other user correctly denied access: ${otherInfoResponse.message}`
              };
            } else {
              results.getProjectInfo_other = {
                status: 'fail',
                details: `Other user should be denied: ${JSON.stringify(otherInfoResponse)}`
              };
            }

            ws2.close();
            resolve();
          } catch (error) {
            console.error('Test error (user 2):', error);
            ws2.close();
            reject(error);
          }
        });

        ws2.on('error', (error) => {
          reject(error);
        });
      });
    }

    // ===== Test 4: deleteProject =====
    if (createdProjectId) {
      console.log('\n--- Test 4: deleteProject ---');

      const ws3 = createWS();

      await new Promise((resolve, reject) => {
        ws3.on('open', async () => {
          try {
            console.log('WebSocket connected for delete test');

            // Initialize with user 1's access token
            const initResponse = await sendAndWait(ws3, {
              type: 'init',
              access_token: accessToken1,
              sessionId: 'test-session-3'
            });

            // Delete the project
            const deleteResponse = await sendAndWait(ws3, {
              type: 'deleteProject',
              projectId: createdProjectId
            });
            console.log('deleteProject response:', JSON.stringify(deleteResponse));

            if (deleteResponse.type === 'projectDeleted' &&
                deleteResponse.projectId === createdProjectId) {

              // Verify deletion - trying to get info should fail
              const verifyResponse = await sendAndWait(ws3, {
                type: 'getProjectInfo',
                projectId: createdProjectId
              });
              console.log('getProjectInfo (verify delete):', JSON.stringify(verifyResponse));

              // After deletion, getProjectInfo should return error (Access denied or similar)
              // because the project no longer exists for this user
              if (verifyResponse.type === 'error') {
                results.deleteProject = {
                  status: 'pass',
                  details: `Project deleted successfully. Verification: project no longer accessible (${verifyResponse.message})`
                };
              } else if (verifyResponse.type === 'projectInfo' && !verifyResponse.project) {
                results.deleteProject = {
                  status: 'pass',
                  details: `Project deleted successfully. Verification: project returns null`
                };
              } else {
                results.deleteProject = {
                  status: 'fail',
                  details: `Delete response OK but project still accessible: ${JSON.stringify(verifyResponse)}`
                };
              }
            } else {
              results.deleteProject = {
                status: 'fail',
                details: `Unexpected response: ${JSON.stringify(deleteResponse)}`
              };
            }

            ws3.close();
            resolve();
          } catch (error) {
            console.error('Test error (delete):', error);
            ws3.close();
            reject(error);
          }
        });

        ws3.on('error', (error) => {
          reject(error);
        });
      });
    }

  } catch (error) {
    console.error('Test suite error:', error.message, error.stack);
    // Mark remaining tests as failed
    for (const key in results) {
      if (results[key].status === 'pending') {
        results[key] = {
          status: 'fail',
          details: `Test suite error: ${error.message}`
        };
      }
    }
  }
}

// Run all tests
async function runTests() {
  console.log('Starting WebSocket Project Operations Tests');
  console.log('Target:', WS_URL);
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('');
  console.log('Test Cases:');
  console.log('1. createProject - Create a new project and verify');
  console.log('2. renameProject - Rename the project and verify');
  console.log('3. getProjectInfo - Owner access (should succeed)');
  console.log('4. getProjectInfo - Other user access (should fail)');
  console.log('5. deleteProject - Delete the project and verify');
  console.log('');

  await runProjectOperationsTests();

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
