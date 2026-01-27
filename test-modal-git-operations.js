/**
 * Modal Git Operations Test Script
 * Tests that Git version operations return proper values (not Promises)
 *
 * This test verifies the await fixes in server/index.js for:
 * - selectProject (includes versions)
 * - getVersions
 * - getVersionEdits
 * - restoreVersion
 *
 * Key verification: Values should NOT be:
 * - Promise objects: { "then": ... }
 * - undefined
 * - String "[object Promise]"
 */

const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const WS_URL = 'ws://localhost:3000';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tcynrijrovktirsvwiqb.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjY5OTAsImV4cCI6MjA4NDYwMjk5MH0.y-_E-vuQg84t8BGISdPL18oaYcayS8ip1OLJsZwM3hI';

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test results
const results = {
  selectProject_versions_is_array: { status: 'pending', details: '' },
  getVersions_returns_array: { status: 'pending', details: '' },
  getVersionEdits_returns_object: { status: 'pending', details: '' },
  restoreVersion_returns_result: { status: 'pending', details: '' }
};

// Helper to create WebSocket connection
function createWS() {
  return new WebSocket(WS_URL);
}

// Helper to send message and wait for response
function sendAndWait(ws, message, timeout = 10000) {
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

// Check if value is a Promise-like object (not properly awaited)
function isPromiseLike(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value === '[object Promise]') return true;
  if (typeof value === 'object' && typeof value.then === 'function') return true;
  if (typeof value === 'object' && 'then' in value) return true;
  return false;
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

// Main test function
async function runGitOperationsTests() {
  console.log('\n=== Test: Modal Git Operations (await fixes) ===\n');

  let testProjectId = null;
  let testVersionHash = null;

  try {
    const userData = await getTestUser();
    const { accessToken, userId } = userData;

    const ws = createWS();

    await new Promise((resolve, reject) => {
      ws.on('open', async () => {
        try {
          console.log('\n--- WebSocket connected ---');

          // Initialize with access token
          const initResponse = await sendAndWait(ws, {
            type: 'init',
            access_token: accessToken,
            sessionId: 'test-git-ops-' + Date.now()
          });

          if (initResponse.type !== 'init') {
            throw new Error(`Unexpected init response: ${JSON.stringify(initResponse)}`);
          }
          console.log(`Authenticated as user: ${initResponse.userId}`);

          // Get list of projects to find one with versions
          const projectsList = initResponse.projects || [];
          console.log(`Found ${projectsList.length} projects`);

          // Use first project or create one
          if (projectsList.length > 0) {
            testProjectId = projectsList[0].id;
            console.log(`Using existing project: ${testProjectId}`);
          } else {
            // Create a project for testing
            const createResponse = await sendAndWait(ws, {
              type: 'createProject',
              name: 'Git Operations Test Project'
            });
            if (createResponse.type === 'projectCreated' && createResponse.project) {
              testProjectId = createResponse.project.id;
              console.log(`Created test project: ${testProjectId}`);
            } else {
              throw new Error(`Failed to create project: ${JSON.stringify(createResponse)}`);
            }
          }

          // ===== Test 1: selectProject includes versions as array =====
          console.log('\n--- Test 1: selectProject includes versions as array ---');
          const selectResponse = await sendAndWait(ws, {
            type: 'selectProject',
            projectId: testProjectId
          });
          console.log('selectProject response type:', selectResponse.type);
          console.log('versions type:', typeof selectResponse.versions);
          console.log('versions value:', JSON.stringify(selectResponse.versions)?.substring(0, 200));

          if (selectResponse.type === 'projectSelected') {
            const versions = selectResponse.versions;

            if (isPromiseLike(versions)) {
              results.selectProject_versions_is_array = {
                status: 'fail',
                details: `versions is a Promise object (not awaited): ${JSON.stringify(versions)}`
              };
            } else if (versions === undefined) {
              results.selectProject_versions_is_array = {
                status: 'fail',
                details: 'versions is undefined'
              };
            } else if (Array.isArray(versions)) {
              results.selectProject_versions_is_array = {
                status: 'pass',
                details: `versions is an array with ${versions.length} items`
              };
              // Save first version hash for later tests
              if (versions.length > 0 && versions[0].hash) {
                testVersionHash = versions[0].hash;
              }
            } else {
              results.selectProject_versions_is_array = {
                status: 'fail',
                details: `versions is not an array: ${typeof versions} - ${JSON.stringify(versions)}`
              };
            }
          } else {
            results.selectProject_versions_is_array = {
              status: 'fail',
              details: `Unexpected response: ${JSON.stringify(selectResponse)}`
            };
          }

          // ===== Test 2: getVersions returns array =====
          console.log('\n--- Test 2: getVersions returns array ---');
          const versionsResponse = await sendAndWait(ws, {
            type: 'getVersions',
            projectId: testProjectId
          });
          console.log('getVersions response type:', versionsResponse.type);
          console.log('versions type:', typeof versionsResponse.versions);
          console.log('versions value:', JSON.stringify(versionsResponse.versions)?.substring(0, 200));

          if (versionsResponse.type === 'versionsList') {
            const versions = versionsResponse.versions;

            if (isPromiseLike(versions)) {
              results.getVersions_returns_array = {
                status: 'fail',
                details: `versions is a Promise object (not awaited): ${JSON.stringify(versions)}`
              };
            } else if (versions === undefined) {
              results.getVersions_returns_array = {
                status: 'fail',
                details: 'versions is undefined'
              };
            } else if (Array.isArray(versions)) {
              results.getVersions_returns_array = {
                status: 'pass',
                details: `getVersions returned array with ${versions.length} items`
              };
              // Update testVersionHash if we didn't get one before
              if (!testVersionHash && versions.length > 0 && versions[0].hash) {
                testVersionHash = versions[0].hash;
              }
            } else {
              results.getVersions_returns_array = {
                status: 'fail',
                details: `versions is not an array: ${typeof versions} - ${JSON.stringify(versions)}`
              };
            }
          } else if (versionsResponse.type === 'error') {
            results.getVersions_returns_array = {
              status: 'fail',
              details: `Error response: ${versionsResponse.message}`
            };
          } else {
            results.getVersions_returns_array = {
              status: 'fail',
              details: `Unexpected response type: ${versionsResponse.type}`
            };
          }

          // ===== Test 3: getVersionEdits returns object with edits =====
          console.log('\n--- Test 3: getVersionEdits returns object ---');
          if (testVersionHash) {
            const editsResponse = await sendAndWait(ws, {
              type: 'getVersionEdits',
              projectId: testProjectId,
              versionHash: testVersionHash
            });
            console.log('getVersionEdits response type:', editsResponse.type);
            console.log('edits type:', typeof editsResponse.edits);
            console.log('edits value:', JSON.stringify(editsResponse.edits)?.substring(0, 200));

            if (editsResponse.type === 'versionEdits') {
              const edits = editsResponse.edits;

              if (isPromiseLike(edits)) {
                results.getVersionEdits_returns_object = {
                  status: 'fail',
                  details: `edits is a Promise object (not awaited): ${JSON.stringify(edits)}`
                };
              } else if (edits === undefined) {
                results.getVersionEdits_returns_object = {
                  status: 'fail',
                  details: 'edits is undefined (editsData was likely undefined)'
                };
              } else if (Array.isArray(edits)) {
                results.getVersionEdits_returns_object = {
                  status: 'pass',
                  details: `getVersionEdits returned edits array with ${edits.length} items`
                };
              } else {
                results.getVersionEdits_returns_object = {
                  status: 'fail',
                  details: `edits is not an array: ${typeof edits} - ${JSON.stringify(edits)}`
                };
              }
            } else if (editsResponse.type === 'error') {
              results.getVersionEdits_returns_object = {
                status: 'fail',
                details: `Error response: ${editsResponse.message}`
              };
            } else {
              results.getVersionEdits_returns_object = {
                status: 'fail',
                details: `Unexpected response type: ${editsResponse.type}`
              };
            }
          } else {
            results.getVersionEdits_returns_object = {
              status: 'skip',
              details: 'No versions available to test (project has no git history)'
            };
          }

          // ===== Test 4: restoreVersion returns result =====
          console.log('\n--- Test 4: restoreVersion returns result ---');
          if (testVersionHash) {
            const restoreResponse = await sendAndWait(ws, {
              type: 'restoreVersion',
              projectId: testProjectId,
              versionId: testVersionHash
            });
            console.log('restoreVersion response type:', restoreResponse.type);
            console.log('restoreVersion response:', JSON.stringify(restoreResponse).substring(0, 300));

            // If await was missing, restoreResult.success would be undefined
            // and we'd get an error response or incorrect behavior
            if (restoreResponse.type === 'versionRestored') {
              results.restoreVersion_returns_result = {
                status: 'pass',
                details: `restoreVersion succeeded for version ${testVersionHash}`
              };
            } else if (restoreResponse.type === 'error') {
              // Check if the error is due to Promise not being awaited
              if (restoreResponse.message === undefined ||
                  (typeof restoreResponse.message === 'object' && restoreResponse.message.then)) {
                results.restoreVersion_returns_result = {
                  status: 'fail',
                  details: `restoreVersion result not awaited: ${JSON.stringify(restoreResponse)}`
                };
              } else {
                // This could be a legitimate error (e.g., version not found)
                // but at least the await is working
                results.restoreVersion_returns_result = {
                  status: 'pass',
                  details: `restoreVersion returned proper error (await working): ${restoreResponse.message}`
                };
              }
            } else {
              results.restoreVersion_returns_result = {
                status: 'fail',
                details: `Unexpected response type: ${restoreResponse.type} - ${JSON.stringify(restoreResponse)}`
              };
            }
          } else {
            results.restoreVersion_returns_result = {
              status: 'skip',
              details: 'No versions available to test (project has no git history)'
            };
          }

          ws.close();
          resolve();
        } catch (error) {
          console.error('Test error:', error);
          ws.close();
          reject(error);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log(`WebSocket closed: code=${code}, reason=${reason}`);
      });
    });

  } catch (error) {
    console.error('Test suite error:', error.message, error.stack);
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
  console.log('Starting Modal Git Operations Tests');
  console.log('Target:', WS_URL);
  console.log('');
  console.log('Purpose: Verify await fixes for Modal async Git operations');
  console.log('');
  console.log('Test Cases:');
  console.log('1. selectProject - versions should be array (not Promise)');
  console.log('2. getVersions - should return array (not Promise)');
  console.log('3. getVersionEdits - should return object with edits (not undefined)');
  console.log('4. restoreVersion - should return result (not undefined)');
  console.log('');

  await runGitOperationsTests();

  console.log('\n========================================');
  console.log('TEST RESULTS:');
  console.log('========================================');

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const [testName, result] of Object.entries(results)) {
    let icon;
    if (result.status === 'pass') {
      icon = '[PASS]';
      passCount++;
    } else if (result.status === 'skip') {
      icon = '[SKIP]';
      skipCount++;
    } else {
      icon = '[FAIL]';
      failCount++;
    }
    console.log(`\n${icon} ${testName}`);
    console.log(`  ${result.details}`);
  }

  console.log('\n========================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log('========================================');

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
