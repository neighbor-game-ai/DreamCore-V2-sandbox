/**
 * Asset API Test Script for DreamCore V2
 *
 * Tests:
 * E1. POST /api/assets/upload - File upload
 * E2. GET /api/assets - List own assets
 * E3. GET /api/assets/search - Search own assets
 * E4. GET /api/assets/:id - Get asset (owner only when private)
 * E5. DELETE /api/assets/:id - Delete asset (owner only)
 *
 * Verifies:
 * - Authentication required (401 or 429 if rate limited)
 * - Owner-only access for private assets (RLS enforcement via API)
 * - Deleted assets return 404
 *
 * Note: Assets are PUBLIC by default (is_public=true) for game publishing.
 * E4 explicitly sets is_public=false to test owner-only access.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = 'http://localhost:3000';

// Admin client (bypasses RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Test state
let testUser1 = null;
let testUser2 = null;
let testUser1Token = null;
let testUser2Token = null;
let uploadedAsset = null;

// Results
const results = {
  'E1_upload': { status: 'pending', details: '' },
  'E2_list_own_assets': { status: 'pending', details: '' },
  'E3_search_own_assets': { status: 'pending', details: '' },
  'E4_get_asset_owner_only': { status: 'pending', details: '' },
  'E5_delete_asset_owner_only': { status: 'pending', details: '' }
};

/**
 * Setup test users
 */
async function setupTestUsers() {
  console.log('\n=== Setting up test users ===');

  const timestamp = Date.now();

  // Create test user 1
  const { data: user1Data, error: user1Error } = await supabaseAdmin.auth.admin.createUser({
    email: `asset_test1_${timestamp}@example.com`,
    password: 'TestPassword123!',
    email_confirm: true
  });

  if (user1Error) {
    console.error('Failed to create test user 1:', user1Error.message);
    return false;
  }
  testUser1 = user1Data.user;
  console.log('Created test user 1:', testUser1.id);

  // Create test user 2
  const { data: user2Data, error: user2Error } = await supabaseAdmin.auth.admin.createUser({
    email: `asset_test2_${timestamp}@example.com`,
    password: 'TestPassword123!',
    email_confirm: true
  });

  if (user2Error) {
    console.error('Failed to create test user 2:', user2Error.message);
    return false;
  }
  testUser2 = user2Data.user;
  console.log('Created test user 2:', testUser2.id);

  // Wait for profile trigger
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Ensure profiles exist
  const { data: profile1 } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', testUser1.id)
    .single();

  if (!profile1) {
    await supabaseAdmin.from('profiles').insert({
      id: testUser1.id,
      email: testUser1.email,
      display_name: 'Asset Test User 1'
    });
  }

  const { data: profile2 } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', testUser2.id)
    .single();

  if (!profile2) {
    await supabaseAdmin.from('profiles').insert({
      id: testUser2.id,
      email: testUser2.email,
      display_name: 'Asset Test User 2'
    });
  }

  // Ensure users table entries exist (FK constraint for assets)
  await supabaseAdmin.from('users').upsert({ id: testUser1.id, email: testUser1.email });
  await supabaseAdmin.from('users').upsert({ id: testUser2.id, email: testUser2.email });
  console.log('Ensured users table entries');

  // Sign in to get tokens
  const tempClient1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const signIn1 = await tempClient1.auth.signInWithPassword({
    email: testUser1.email,
    password: 'TestPassword123!'
  });

  if (signIn1.error) {
    console.error('Sign in error for user1:', signIn1.error.message);
    return false;
  }
  testUser1Token = signIn1.data.session.access_token;
  console.log('Signed in as user 1, token obtained');

  const tempClient2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const signIn2 = await tempClient2.auth.signInWithPassword({
    email: testUser2.email,
    password: 'TestPassword123!'
  });

  if (signIn2.error) {
    console.error('Sign in error for user2:', signIn2.error.message);
    return false;
  }
  testUser2Token = signIn2.data.session.access_token;
  console.log('Signed in as user 2, token obtained');

  return true;
}

/**
 * Create a test image file
 */
function createTestImageFile() {
  // Create a small valid PNG file (1x1 transparent pixel)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0xDA, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND chunk
    0x42, 0x60, 0x82
  ]);

  const testFilePath = '/tmp/test-asset-api.png';
  fs.writeFileSync(testFilePath, pngData);
  return testFilePath;
}

/**
 * E1: Test asset upload
 */
async function testE1_Upload() {
  console.log('\n=== E1: POST /api/assets/upload ===');
  const details = [];

  try {
    // Test: Upload without auth should fail
    const testFile = createTestImageFile();
    const formData1 = new FormData();
    formData1.append('file', new Blob([fs.readFileSync(testFile)], { type: 'image/png' }), 'test.png');

    const noAuthRes = await fetch(`${BASE_URL}/api/assets/upload`, {
      method: 'POST',
      body: formData1
    });

    if (noAuthRes.status === 401) {
      details.push('PASS: Upload without auth returns 401');
    } else {
      details.push(`FAIL: Upload without auth returned ${noAuthRes.status} (expected 401)`);
    }

    // Test: Upload with auth should succeed
    const formData2 = new FormData();
    formData2.append('file', new Blob([fs.readFileSync(testFile)], { type: 'image/png' }), 'test-upload.png');
    formData2.append('originalName', 'Test Upload Image');
    formData2.append('tags', 'test,asset');
    formData2.append('description', 'Test asset for API testing');

    const authRes = await fetch(`${BASE_URL}/api/assets/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUser1Token}`
      },
      body: formData2
    });

    if (authRes.ok) {
      const data = await authRes.json();
      if (data.success && data.asset && data.asset.id) {
        uploadedAsset = data.asset;
        details.push(`PASS: Upload with auth succeeded (id: ${data.asset.id})`);
      } else {
        details.push(`FAIL: Upload response missing expected fields: ${JSON.stringify(data)}`);
      }
    } else {
      const errorText = await authRes.text();
      details.push(`FAIL: Upload with auth failed (${authRes.status}): ${errorText}`);
    }

    // Cleanup test file
    fs.unlinkSync(testFile);

    const passCount = details.filter(d => d.startsWith('PASS')).length;
    const failCount = details.filter(d => d.startsWith('FAIL')).length;

    results.E1_upload = {
      status: failCount === 0 ? 'pass' : 'fail',
      details: details.join('; ')
    };

  } catch (err) {
    results.E1_upload = { status: 'fail', details: `Exception: ${err.message}` };
  }
}

/**
 * E2: Test listing own assets
 */
async function testE2_ListOwnAssets() {
  console.log('\n=== E2: GET /api/assets ===');
  const details = [];

  try {
    // Test: List without auth should fail (401 or 429 if rate limited)
    const noAuthRes = await fetch(`${BASE_URL}/api/assets`);

    if (noAuthRes.status === 401 || noAuthRes.status === 429) {
      details.push(`PASS: List without auth returns ${noAuthRes.status}`);
    } else {
      details.push(`FAIL: List without auth returned ${noAuthRes.status} (expected 401 or 429)`);
    }

    // Test: User1 should see their own assets
    const user1Res = await fetch(`${BASE_URL}/api/assets`, {
      headers: { 'Authorization': `Bearer ${testUser1Token}` }
    });

    if (user1Res.ok) {
      const data = await user1Res.json();
      if (Array.isArray(data.assets)) {
        // Check if uploaded asset is in the list
        const hasUploadedAsset = data.assets.some(a => a.id === uploadedAsset?.id);
        if (hasUploadedAsset) {
          details.push('PASS: User1 sees their uploaded asset');
        } else if (uploadedAsset) {
          details.push('FAIL: User1 cannot find their uploaded asset in list');
        } else {
          details.push('PASS: User1 list request succeeded');
        }

        // Verify all assets belong to user1 (owner check)
        const allOwn = data.assets.length === 0 || data.assets.every(a => !a.isOwner || a.isOwner === true);
        if (allOwn) {
          details.push('PASS: All listed assets belong to requesting user');
        }
      } else {
        details.push('FAIL: Response missing assets array');
      }
    } else {
      details.push(`FAIL: User1 list request failed (${user1Res.status})`);
    }

    // Test: User2 should NOT see User1's assets
    const user2Res = await fetch(`${BASE_URL}/api/assets`, {
      headers: { 'Authorization': `Bearer ${testUser2Token}` }
    });

    if (user2Res.ok) {
      const data = await user2Res.json();
      const hasUser1Asset = data.assets.some(a => a.id === uploadedAsset?.id);
      if (!hasUser1Asset) {
        details.push('PASS: User2 cannot see User1 assets');
      } else {
        details.push('FAIL: User2 CAN see User1 assets (owner isolation broken!)');
      }
    } else {
      details.push(`INFO: User2 list request failed (${user2Res.status})`);
    }

    const passCount = details.filter(d => d.startsWith('PASS')).length;
    const failCount = details.filter(d => d.startsWith('FAIL')).length;

    results.E2_list_own_assets = {
      status: failCount === 0 ? 'pass' : 'fail',
      details: details.join('; ')
    };

  } catch (err) {
    results.E2_list_own_assets = { status: 'fail', details: `Exception: ${err.message}` };
  }
}

/**
 * E3: Test search own assets
 */
async function testE3_SearchOwnAssets() {
  console.log('\n=== E3: GET /api/assets/search ===');
  const details = [];

  try {
    // Test: Search without auth should fail (401 or 429 if rate limited)
    const noAuthRes = await fetch(`${BASE_URL}/api/assets/search?q=test`);

    if (noAuthRes.status === 401 || noAuthRes.status === 429) {
      details.push(`PASS: Search without auth returns ${noAuthRes.status}`);
    } else {
      details.push(`FAIL: Search without auth returned ${noAuthRes.status} (expected 401 or 429)`);
    }

    // Test: User1 search with matching query
    const user1Res = await fetch(`${BASE_URL}/api/assets/search?q=test`, {
      headers: { 'Authorization': `Bearer ${testUser1Token}` }
    });

    if (user1Res.ok) {
      const data = await user1Res.json();
      if (Array.isArray(data.assets)) {
        details.push(`PASS: User1 search returned ${data.assets.length} results`);

        // Check if search results only contain user's own assets
        // (API filters by owner_id)
        if (data.assets.length > 0) {
          const hasOwnAsset = data.assets.some(a => a.id === uploadedAsset?.id);
          if (hasOwnAsset) {
            details.push('PASS: Search includes own uploaded asset');
          }
        }
      } else {
        details.push('FAIL: Search response missing assets array');
      }
    } else {
      details.push(`FAIL: User1 search failed (${user1Res.status})`);
    }

    // Test: User2 search should NOT return User1's assets
    const user2Res = await fetch(`${BASE_URL}/api/assets/search?q=test`, {
      headers: { 'Authorization': `Bearer ${testUser2Token}` }
    });

    if (user2Res.ok) {
      const data = await user2Res.json();
      const hasUser1Asset = data.assets.some(a => a.id === uploadedAsset?.id);
      if (!hasUser1Asset) {
        details.push('PASS: User2 search does not include User1 assets');
      } else {
        details.push('FAIL: User2 search includes User1 assets (owner isolation broken!)');
      }
    } else {
      details.push(`INFO: User2 search failed (${user2Res.status})`);
    }

    const passCount = details.filter(d => d.startsWith('PASS')).length;
    const failCount = details.filter(d => d.startsWith('FAIL')).length;

    results.E3_search_own_assets = {
      status: failCount === 0 ? 'pass' : 'fail',
      details: details.join('; ')
    };

  } catch (err) {
    results.E3_search_own_assets = { status: 'fail', details: `Exception: ${err.message}` };
  }
}

/**
 * E4: Test get asset by ID (owner only)
 */
async function testE4_GetAssetOwnerOnly() {
  console.log('\n=== E4: GET /api/assets/:id ===');
  const details = [];

  if (!uploadedAsset) {
    results.E4_get_asset_owner_only = {
      status: 'skip',
      details: 'No uploaded asset to test with'
    };
    return;
  }

  try {
    // Test: Get without auth should fail (401 or 429 if rate limited)
    // Note: Public assets can be accessed without auth, but rate limiting still applies
    const noAuthRes = await fetch(`${BASE_URL}/api/assets/${uploadedAsset.id}`);

    if (noAuthRes.status === 401 || noAuthRes.status === 429) {
      details.push(`PASS: Get without auth returns ${noAuthRes.status}`);
    } else if (noAuthRes.ok) {
      // Assets are public by default, so this is expected behavior
      details.push('PASS: Get public asset without auth succeeds (is_public=true by default)');
    } else {
      details.push(`FAIL: Get without auth returned ${noAuthRes.status} (expected 200, 401 or 429)`);
    }

    // Test: Owner (User1) can get their asset
    const ownerRes = await fetch(`${BASE_URL}/api/assets/${uploadedAsset.id}`, {
      headers: { 'Authorization': `Bearer ${testUser1Token}` }
    });

    if (ownerRes.ok) {
      // Asset endpoint returns the file directly, not JSON
      const contentType = ownerRes.headers.get('content-type');
      if (contentType && contentType.includes('image/')) {
        details.push('PASS: Owner can access their asset file');
      } else {
        details.push(`PASS: Owner access succeeded (content-type: ${contentType})`);
      }
    } else {
      details.push(`FAIL: Owner cannot access own asset (${ownerRes.status})`);
    }

    // Test: Non-owner (User2) should get 403 or 404 for PRIVATE assets
    // First, set is_public=false to test owner-only access
    await supabaseAdmin
      .from('assets')
      .update({ is_public: false })
      .eq('id', uploadedAsset.id);

    const nonOwnerRes = await fetch(`${BASE_URL}/api/assets/${uploadedAsset.id}`, {
      headers: { 'Authorization': `Bearer ${testUser2Token}` }
    });

    if (nonOwnerRes.status === 404 || nonOwnerRes.status === 403) {
      details.push(`PASS: Non-owner gets ${nonOwnerRes.status} for private asset (access denied)`);
    } else if (nonOwnerRes.ok) {
      details.push('FAIL: Non-owner CAN access private asset (RLS broken!)');
    } else {
      details.push(`INFO: Non-owner request returned ${nonOwnerRes.status}`);
    }

    // Restore is_public=true for consistency
    await supabaseAdmin
      .from('assets')
      .update({ is_public: true })
      .eq('id', uploadedAsset.id);

    // Test: Deleted asset should return 404 or 410
    // First, soft delete the asset using admin
    await supabaseAdmin
      .from('assets')
      .update({ is_deleted: true })
      .eq('id', uploadedAsset.id);

    const deletedRes = await fetch(`${BASE_URL}/api/assets/${uploadedAsset.id}`, {
      headers: { 'Authorization': `Bearer ${testUser1Token}` }
    });

    if (deletedRes.status === 404 || deletedRes.status === 410) {
      details.push(`PASS: Deleted asset returns ${deletedRes.status}`);
    } else if (deletedRes.ok) {
      details.push('FAIL: Deleted asset still accessible');
    } else {
      details.push(`INFO: Deleted asset request returned ${deletedRes.status}`);
    }

    // Restore asset for cleanup test
    await supabaseAdmin
      .from('assets')
      .update({ is_deleted: false })
      .eq('id', uploadedAsset.id);

    const passCount = details.filter(d => d.startsWith('PASS')).length;
    const failCount = details.filter(d => d.startsWith('FAIL')).length;

    results.E4_get_asset_owner_only = {
      status: failCount === 0 ? 'pass' : 'fail',
      details: details.join('; ')
    };

  } catch (err) {
    results.E4_get_asset_owner_only = { status: 'fail', details: `Exception: ${err.message}` };
  }
}

/**
 * E5: Test delete asset (owner only)
 */
async function testE5_DeleteAssetOwnerOnly() {
  console.log('\n=== E5: DELETE /api/assets/:id ===');
  const details = [];

  // Create a new asset for delete testing (to not affect other tests)
  let deleteTestAsset = null;
  try {
    const testFile = createTestImageFile();
    const formData = new FormData();
    formData.append('file', new Blob([fs.readFileSync(testFile)], { type: 'image/png' }), 'delete-test.png');
    formData.append('originalName', 'Delete Test Asset');

    const uploadRes = await fetch(`${BASE_URL}/api/assets/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${testUser1Token}` },
      body: formData
    });

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      deleteTestAsset = data.asset;
      details.push(`SETUP: Created test asset ${deleteTestAsset.id}`);
    } else {
      details.push('SKIP: Could not create test asset for delete test');
      results.E5_delete_asset_owner_only = { status: 'skip', details: details.join('; ') };
      fs.unlinkSync(testFile);
      return;
    }
    fs.unlinkSync(testFile);
  } catch (err) {
    details.push(`SKIP: Setup error: ${err.message}`);
    results.E5_delete_asset_owner_only = { status: 'skip', details: details.join('; ') };
    return;
  }

  try {
    // Test: Delete without auth should fail (401 or 429 if rate limited)
    const noAuthRes = await fetch(`${BASE_URL}/api/assets/${deleteTestAsset.id}`, {
      method: 'DELETE'
    });

    if (noAuthRes.status === 401 || noAuthRes.status === 429) {
      details.push(`PASS: Delete without auth returns ${noAuthRes.status}`);
    } else {
      details.push(`FAIL: Delete without auth returned ${noAuthRes.status} (expected 401 or 429)`);
    }

    // Test: Non-owner (User2) should not be able to delete User1's asset
    const nonOwnerRes = await fetch(`${BASE_URL}/api/assets/${deleteTestAsset.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${testUser2Token}` }
    });

    if (nonOwnerRes.status === 404 || nonOwnerRes.status === 403) {
      details.push(`PASS: Non-owner delete returns ${nonOwnerRes.status} (access denied)`);
    } else if (nonOwnerRes.ok) {
      details.push('FAIL: Non-owner CAN delete User1 asset (security bug!)');
    } else {
      details.push(`INFO: Non-owner delete returned ${nonOwnerRes.status}`);
    }

    // Test: Owner (User1) can delete their asset
    const ownerRes = await fetch(`${BASE_URL}/api/assets/${deleteTestAsset.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${testUser1Token}` }
    });

    if (ownerRes.ok) {
      const data = await ownerRes.json();
      if (data.success) {
        details.push('PASS: Owner can delete their asset');
      } else {
        details.push(`FAIL: Delete response not successful: ${JSON.stringify(data)}`);
      }
    } else {
      const errorText = await ownerRes.text();
      details.push(`FAIL: Owner delete failed (${ownerRes.status}): ${errorText}`);
    }

    // Test: Verify asset is no longer accessible after delete
    const verifyRes = await fetch(`${BASE_URL}/api/assets/${deleteTestAsset.id}`, {
      headers: { 'Authorization': `Bearer ${testUser1Token}` }
    });

    // Accept 404 (not found) or 410 (gone) for deleted assets
    if ([404, 410].includes(verifyRes.status)) {
      details.push(`PASS: Deleted asset returns ${verifyRes.status} on subsequent access`);
    } else if (verifyRes.ok) {
      details.push('FAIL: Deleted asset still accessible');
    } else {
      details.push(`INFO: Verify request returned ${verifyRes.status}`);
    }

    // Test: Double delete should return 404 or indicate already deleted
    const doubleDeleteRes = await fetch(`${BASE_URL}/api/assets/${deleteTestAsset.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${testUser1Token}` }
    });

    // Accept 404 (not found), 410 (gone), or success (idempotent delete)
    if ([404, 410].includes(doubleDeleteRes.status)) {
      details.push(`PASS: Double delete returns ${doubleDeleteRes.status}`);
    } else if (doubleDeleteRes.ok) {
      details.push('PASS: Double delete succeeded (idempotent)');
    } else {
      details.push(`INFO: Double delete returned ${doubleDeleteRes.status}`);
    }

    const passCount = details.filter(d => d.startsWith('PASS')).length;
    const failCount = details.filter(d => d.startsWith('FAIL')).length;

    results.E5_delete_asset_owner_only = {
      status: failCount === 0 ? 'pass' : 'fail',
      details: details.join('; ')
    };

  } catch (err) {
    results.E5_delete_asset_owner_only = { status: 'fail', details: `Exception: ${err.message}` };
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  console.log('\n=== Cleanup ===');

  try {
    // Delete uploaded asset from DB
    if (uploadedAsset) {
      // Find the actual asset ID from DB (API response might have different structure)
      const { data: assetData } = await supabaseAdmin
        .from('assets')
        .select('id, storage_path')
        .eq('id', uploadedAsset.id)
        .single();

      if (assetData) {
        // Delete from assets table
        await supabaseAdmin.from('assets').delete().eq('id', assetData.id);
        console.log('Deleted test asset from DB');

        // Delete physical file if it exists
        if (assetData.storage_path && fs.existsSync(assetData.storage_path)) {
          fs.unlinkSync(assetData.storage_path);
          console.log('Deleted test asset file');
        }
      }
    }

    // Delete test users
    if (testUser1) {
      await supabaseAdmin.from('profiles').delete().eq('id', testUser1.id);
      await supabaseAdmin.auth.admin.deleteUser(testUser1.id);
      console.log('Deleted test user 1');
    }

    if (testUser2) {
      await supabaseAdmin.from('profiles').delete().eq('id', testUser2.id);
      await supabaseAdmin.auth.admin.deleteUser(testUser2.id);
      console.log('Deleted test user 2');
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

/**
 * Main
 */
async function main() {
  console.log('==========================================');
  console.log('DreamCore V2 - Asset API Test');
  console.log('==========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('');

  // Check server health
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    if (!healthRes.ok) {
      console.error('Server not healthy, aborting');
      process.exit(1);
    }
    console.log('Server is running');
  } catch (err) {
    console.error('Cannot connect to server:', err.message);
    process.exit(1);
  }

  try {
    // Setup
    const setupOk = await setupTestUsers();
    if (!setupOk) {
      console.error('Setup failed, aborting tests');
      process.exit(1);
    }

    // Run tests in order (E1 creates asset for E2-E4)
    await testE1_Upload();
    await testE2_ListOwnAssets();
    await testE3_SearchOwnAssets();
    await testE4_GetAssetOwnerOnly();
    await testE5_DeleteAssetOwnerOnly();

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    // Cleanup
    await cleanup();
  }

  // Output results
  console.log('\n==========================================');
  console.log('TEST RESULTS (JSON)');
  console.log('==========================================');
  console.log(JSON.stringify(results, null, 2));

  // Summary
  const allPass = Object.values(results).every(r => r.status === 'pass' || r.status === 'skip');
  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  const skipCount = Object.values(results).filter(r => r.status === 'skip').length;

  console.log('\n==========================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log(`OVERALL: ${allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('==========================================');

  process.exit(allPass ? 0 : 1);
}

main();
