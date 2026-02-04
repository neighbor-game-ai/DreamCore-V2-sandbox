/**
 * Profile API E2E Test
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const API_BASE = 'http://localhost:3000';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Get test user
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1 });
  if (!users || users.length === 0) {
    console.log('No users found');
    return;
  }

  const user = users[0];
  console.log('=== Test User ===');
  console.log('User ID:', user.id);
  console.log('Email:', user.email);

  // Generate access token
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email
  });

  if (error) {
    console.error('Error generating link:', error);
    return;
  }

  // Exchange for session
  const token = data.properties.hashed_token;
  const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: 'magiclink'
  });

  if (verifyError) {
    console.error('Verify error:', verifyError);
    return;
  }

  const accessToken = session.session.access_token;
  console.log('\n=== Access Token Generated ===\n');

  // Test 1: GET /api/users/me
  console.log('=== Test 1: GET /api/users/me ===');
  let res = await fetch(`${API_BASE}/api/users/me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  let data1 = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data1, null, 2));

  // Test 2: PATCH /api/users/me (update profile)
  console.log('\n=== Test 2: PATCH /api/users/me ===');
  const testBio = 'Test bio at ' + new Date().toISOString();
  res = await fetch(`${API_BASE}/api/users/me`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      display_name: 'Test User',
      bio: testBio,
      social_links: {
        x: 'x.com/testuser',
        github: 'github.com/testuser',
        custom: [{ label: 'Blog', url: 'https://blog.example.com' }]
      }
    })
  });
  let data2 = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data2, null, 2));

  // Verify update
  if (res.status === 200) {
    console.log('\n--- Verification ---');
    console.log('display_name updated:', data2.display_name === 'Test User' ? 'PASS' : 'FAIL');
    console.log('bio updated:', data2.bio === testBio ? 'PASS' : 'FAIL');
    console.log('social_links.x normalized:', data2.social_links?.x === 'https://x.com/testuser' ? 'PASS' : 'FAIL');
    console.log('social_links.github normalized:', data2.social_links?.github === 'https://github.com/testuser' ? 'PASS' : 'FAIL');
    console.log('custom links preserved:', data2.social_links?.custom?.length === 1 ? 'PASS' : 'FAIL');
  }

  // Test 3: GET /api/users/:id/public
  console.log('\n=== Test 3: GET /api/users/:id/public ===');
  res = await fetch(`${API_BASE}/api/users/${user.id}/public`);
  let data3 = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data3, null, 2));

  // Verify public profile has bio and social_links
  if (res.status === 200) {
    console.log('\n--- Verification ---');
    console.log('bio visible:', data3.bio ? 'PASS' : 'FAIL');
    console.log('social_links visible:', data3.social_links ? 'PASS' : 'FAIL');
    console.log('email NOT visible:', data3.email === undefined ? 'PASS' : 'FAIL (SECURITY ISSUE)');
  }

  // Test 4: XSS payload test
  console.log('\n=== Test 4: XSS Payload Test ===');
  res = await fetch(`${API_BASE}/api/users/me`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      display_name: '<script>alert(1)</script>',
      bio: '<img src=x onerror=alert(1)>',
      social_links: {
        x: 'javascript:alert(1)'
      }
    })
  });
  let data4 = await res.json();
  console.log('Status:', res.status);

  if (res.status === 200) {
    console.log('\n--- XSS Verification ---');
    console.log('display_name stored as text:', data4.display_name === '<script>alert(1)</script>' ? 'PASS (stored, frontend must escape)' : 'FAIL');
    console.log('bio stored as text:', data4.bio === '<img src=x onerror=alert(1)>' ? 'PASS (stored, frontend must escape)' : 'FAIL');
    // null or not https:// = blocked
    const xUrl = data4.social_links?.x;
    const isBlocked = xUrl === null || xUrl === undefined || !xUrl.startsWith('https://x.com') && !xUrl.startsWith('https://twitter.com');
    console.log('javascript: URL blocked:', isBlocked ? 'PASS (x=' + xUrl + ')' : 'FAIL - URL was: ' + xUrl);
  } else if (res.status === 400) {
    console.log('XSS URL blocked by validation: PASS');
    console.log('Error:', data4.error);
  }

  // Cleanup - reset profile
  console.log('\n=== Cleanup ===');
  await fetch(`${API_BASE}/api/users/me`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      display_name: null,
      bio: null,
      social_links: null
    })
  });
  console.log('Profile reset');

  console.log('\n=== E2E Tests Complete ===');
}

main().catch(console.error);
