/**
 * Test F: Exception and Boundary Case Tests
 *
 * Tests:
 * 1. Invalid UUID format -> 400
 * 2. Path traversal attempts -> 400 (blocked by isPathSafe)
 * 3. Non-existent endpoint -> 404
 *
 * Note: Many endpoints require authentication. This test uses
 * Supabase service_role to create test tokens.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test results
const results = [];
let passed = 0;
let failed = 0;

// Helper to log results
function logResult(testName, expected, actual, pass, details = '') {
  const status = pass ? 'PASS' : 'FAIL';
  const icon = pass ? '[OK]' : '[NG]';
  console.log(`${icon} ${testName}`);
  console.log(`    Expected: ${expected}`);
  console.log(`    Actual:   ${actual}`);
  if (details) {
    console.log(`    Details:  ${details}`);
  }
  console.log();

  results.push({ testName, expected, actual, pass, details });
  if (pass) passed++;
  else failed++;
}

// Test helper for HTTP requests
async function testRequest(testName, url, expectedStatus, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${url}`, options);
    const pass = response.status === expectedStatus;
    let body = '';
    try {
      body = await response.text();
      // Try to parse as JSON for better details
      try {
        const json = JSON.parse(body);
        body = JSON.stringify(json);
      } catch (e) {
        // Keep as text
        if (body.length > 100) {
          body = body.substring(0, 100) + '...';
        }
      }
    } catch (e) {
      body = '(no body)';
    }
    logResult(
      testName,
      `Status ${expectedStatus}`,
      `Status ${response.status}`,
      pass,
      body
    );
    return { status: response.status, pass };
  } catch (error) {
    logResult(
      testName,
      `Status ${expectedStatus}`,
      `Error: ${error.message}`,
      false
    );
    return { status: 0, pass: false };
  }
}

// Test with multiple expected statuses
async function testRequestMulti(testName, url, expectedStatuses, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${url}`, options);
    const pass = expectedStatuses.includes(response.status);
    let body = '';
    try {
      body = await response.text();
      try {
        const json = JSON.parse(body);
        body = JSON.stringify(json);
      } catch (e) {
        if (body.length > 100) {
          body = body.substring(0, 100) + '...';
        }
      }
    } catch (e) {
      body = '(no body)';
    }
    logResult(
      testName,
      `Status ${expectedStatuses.join(' or ')}`,
      `Status ${response.status}`,
      pass,
      body
    );
    return { status: response.status, pass };
  } catch (error) {
    logResult(
      testName,
      `Status ${expectedStatuses.join(' or ')}`,
      `Error: ${error.message}`,
      false
    );
    return { status: 0, pass: false };
  }
}

// Helper: delay between requests to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== Tests ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('Test F: Exception and Boundary Case Tests');
  console.log('='.repeat(60));
  console.log();

  // Create Supabase client to get valid token
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get or create test user
  let accessToken = null;
  let testUserId = null;

  try {
    // List users and find existing test user
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    let testUser = users.users.find(u => u.email === 'test-exception@example.com');

    if (!testUser) {
      // Create test user
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: 'test-exception@example.com',
        password: 'test-password-12345',
        email_confirm: true
      });
      if (createError) throw createError;
      testUser = createData.user;
      console.log('Created test user:', testUser.id);
    } else {
      console.log('Using existing test user:', testUser.id);
    }

    testUserId = testUser.id;

    // Generate session for the user
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: testUser.email
    });

    // Sign in as the user to get access token
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'test-exception@example.com',
      password: 'test-password-12345'
    });

    if (signInError) {
      // Try to update password if sign-in fails
      await supabase.auth.admin.updateUserById(testUser.id, {
        password: 'test-password-12345'
      });
      const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
        email: 'test-exception@example.com',
        password: 'test-password-12345'
      });
      if (retryError) throw retryError;
      accessToken = retryData.session.access_token;
    } else {
      accessToken = signInData.session.access_token;
    }

    console.log('Obtained access token');
    console.log();

  } catch (error) {
    console.error('Failed to setup test user:', error.message);
    console.log('Continuing with unauthenticated tests only...');
    console.log();
  }

  const authHeaders = accessToken
    ? { 'Authorization': `Bearer ${accessToken}` }
    : {};

  // ==================== F-1: Invalid UUID Tests ====================
  console.log('--- F-1: Invalid UUID Tests (expect 400 with auth) ---\n');

  if (accessToken) {
    // Test invalid UUID for projects endpoint
    await testRequest(
      'F-1a: /api/projects/not-a-uuid',
      '/api/projects/not-a-uuid',
      400,
      { headers: authHeaders }
    );

    await testRequest(
      'F-1b: /api/projects/12345',
      '/api/projects/12345',
      400,
      { headers: authHeaders }
    );

    await testRequest(
      'F-1c: /api/projects/abc-def-ghi',
      '/api/projects/abc-def-ghi',
      400,
      { headers: authHeaders }
    );

    // Too short UUID
    await testRequest(
      'F-1d: /api/projects/550e8400-e29b-41d4 (truncated UUID)',
      '/api/projects/550e8400-e29b-41d4',
      400,
      { headers: authHeaders }
    );

    // Invalid characters
    await testRequest(
      'F-1e: /api/projects/550e8400-e29b-41d4-a716-44665544000z (invalid char z)',
      '/api/projects/550e8400-e29b-41d4-a716-44665544000z',
      400,
      { headers: authHeaders }
    );

    // Test invalid UUID for assets endpoint
    await testRequest(
      'F-1f: /api/assets/not-a-uuid',
      '/api/assets/not-a-uuid',
      400,
      { headers: authHeaders }
    );

    await testRequest(
      'F-1g: /api/assets/12345',
      '/api/assets/12345',
      400,
      { headers: authHeaders }
    );

    // Test invalid UUID for jobs endpoint
    await testRequest(
      'F-1h: /api/jobs/not-a-uuid',
      '/api/jobs/not-a-uuid',
      400,
      { headers: authHeaders }
    );

    // Test invalid UUID for game path
    await testRequest(
      'F-1i: /game/not-a-uuid/also-not-uuid/index.html',
      '/game/not-a-uuid/also-not-uuid/index.html',
      400,
      { headers: authHeaders }
    );

    // Valid UUID format but non-existent -> 404 (due to RLS)
    await testRequest(
      'F-1j: /api/projects/{valid-but-nonexistent-uuid} -> 404',
      '/api/projects/550e8400-e29b-41d4-a716-446655440000',
      404,
      { headers: authHeaders }
    );

  } else {
    console.log('Skipping F-1 tests (no valid token)\n');
  }

  // ==================== F-2: Path Traversal Tests ====================
  console.log('--- F-2: Path Traversal Tests ---\n');

  if (accessToken && testUserId) {
    // Valid UUIDs but with path traversal in filename
    // These should return 400 (blocked by isPathSafe) or 403/404

    await testRequestMulti(
      'F-2a: Path traversal in game file path (../../../etc/passwd)',
      `/game/${testUserId}/550e8400-e29b-41d4-a716-446655440001/../../../etc/passwd`,
      [400, 403, 404],
      { headers: authHeaders }
    );

    await testRequestMulti(
      'F-2b: URL-encoded path traversal',
      `/game/${testUserId}/550e8400-e29b-41d4-a716-446655440001/..%2F..%2F..%2Fetc%2Fpasswd`,
      [400, 403, 404],
      { headers: authHeaders }
    );

    await testRequestMulti(
      'F-2c: Double-encoded dots',
      `/game/${testUserId}/550e8400-e29b-41d4-a716-446655440001/%2e%2e/%2e%2e/etc/passwd`,
      [400, 403, 404],
      { headers: authHeaders }
    );

  } else {
    console.log('Skipping F-2 tests (no valid token)\n');
  }

  // ==================== F-3: Non-existent Endpoint Tests ====================
  console.log('--- F-3: Non-existent Endpoint Tests (expect 404, 429 if rate limited) ---\n');

  // Add delay to avoid rate limiting from previous tests
  await delay(1000);

  await testRequestMulti(
    'F-3a: /api/nonexistent',
    '/api/nonexistent',
    [404, 429]
  );

  await testRequestMulti(
    'F-3b: /api/users (not implemented)',
    '/api/users',
    [404, 429]
  );

  await testRequestMulti(
    'F-3c: /api/admin/settings (not implemented)',
    '/api/admin/settings',
    [404, 429]
  );

  await testRequestMulti(
    'F-3d: /api/v2/projects (wrong version)',
    '/api/v2/projects',
    [404, 429]
  );

  // ==================== F-4: Authentication Required Tests ====================
  console.log('--- F-4: Authentication Required Tests (expect 401, 429 if rate limited) ---\n');

  // Without auth header (rate limiting may apply before auth check)
  await testRequestMulti(
    'F-4a: /api/projects without auth -> 401',
    '/api/projects',
    [401, 429]
  );

  await testRequestMulti(
    'F-4b: /api/assets without auth -> 401',
    '/api/assets',
    [401, 429]
  );

  await testRequestMulti(
    'F-4c: /api/jobs/some-id without auth -> 401',
    '/api/jobs/550e8400-e29b-41d4-a716-446655440000',
    [401, 429]
  );

  // With invalid token
  await testRequest(
    'F-4d: /api/projects with invalid token -> 401',
    '/api/projects',
    401,
    { headers: { 'Authorization': 'Bearer invalid-token-12345' } }
  );

  await testRequest(
    'F-4e: /api/projects with malformed auth header -> 401',
    '/api/projects',
    401,
    { headers: { 'Authorization': 'NotBearer token' } }
  );

  // ==================== F-5: Edge Cases ====================
  console.log('--- F-5: Edge Cases (429 if rate limited) ---\n');

  if (accessToken) {
    // Very long invalid UUID
    const longId = 'a'.repeat(1000);
    await testRequestMulti(
      'F-5a: /api/projects/{1000 char string}',
      `/api/projects/${longId}`,
      [400, 429],
      { headers: authHeaders }
    );

    // Special characters
    await testRequestMulti(
      'F-5b: /api/projects/<script> (XSS attempt)',
      '/api/projects/%3Cscript%3Ealert(1)%3C%2Fscript%3E',
      [400, 404, 429],
      { headers: authHeaders }
    );

    // SQL injection patterns (should be caught by UUID validation)
    await testRequestMulti(
      'F-5c: /api/projects/\' OR 1=1-- (SQL injection pattern)',
      "/api/projects/%27%20OR%201%3D1--",
      [400, 429],
      { headers: authHeaders }
    );

  } else {
    console.log('Skipping F-5 tests (no valid token)\n');
  }

  // ==================== F-6: CORS/Security Headers ====================
  console.log('--- F-6: API Health Check ---\n');

  await testRequestMulti(
    'F-6a: /api/health (public endpoint)',
    '/api/health',
    [200, 429]
  );

  // ==================== Summary ====================
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total:  ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log();

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  - ${r.testName}`);
      console.log(`      Expected: ${r.expected}, Got: ${r.actual}`);
    });
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Analysis');
  console.log('='.repeat(60));

  // Group results by category
  const f1Tests = results.filter(r => r.testName.startsWith('F-1'));
  const f2Tests = results.filter(r => r.testName.startsWith('F-2'));
  const f3Tests = results.filter(r => r.testName.startsWith('F-3'));
  const f4Tests = results.filter(r => r.testName.startsWith('F-4'));
  const f5Tests = results.filter(r => r.testName.startsWith('F-5'));
  const f6Tests = results.filter(r => r.testName.startsWith('F-6'));

  console.log(`F-1 (Invalid UUID):     ${f1Tests.filter(r => r.pass).length}/${f1Tests.length} passed`);
  console.log(`F-2 (Path Traversal):   ${f2Tests.filter(r => r.pass).length}/${f2Tests.length} passed`);
  console.log(`F-3 (Non-existent):     ${f3Tests.filter(r => r.pass).length}/${f3Tests.length} passed`);
  console.log(`F-4 (Auth Required):    ${f4Tests.filter(r => r.pass).length}/${f4Tests.length} passed`);
  console.log(`F-5 (Edge Cases):       ${f5Tests.filter(r => r.pass).length}/${f5Tests.length} passed`);
  console.log(`F-6 (Health Check):     ${f6Tests.filter(r => r.pass).length}/${f6Tests.length} passed`);

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
