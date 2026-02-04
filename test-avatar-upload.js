/**
 * Avatar Upload Test
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_BASE = 'http://localhost:3000';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Get test user and generate token
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1 });
  const user = users[0];
  console.log('User:', user.email);

  const { data } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email
  });
  const { data: session } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink'
  });
  const accessToken = session.session.access_token;

  // Use existing test image (created via shell)
  const testImagePath = '/tmp/test-avatar.png';
  if (!fs.existsSync(testImagePath)) {
    console.error('Test image not found. Run: echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > /tmp/test-avatar.png');
    return;
  }

  console.log('\n=== Avatar Upload Test ===');

  // Create FormData manually (Node.js fetch approach)
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const fileContent = fs.readFileSync(testImagePath);

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="avatar"; filename="test.png"\r\n`),
    Buffer.from(`Content-Type: image/png\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const res = await fetch(`${API_BASE}/api/users/me/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: body
  });

  console.log('Status:', res.status);
  const result = await res.json();
  console.log('Response:', JSON.stringify(result, null, 2));

  if (result.avatar_url) {
    console.log('\n=== CDN Verification ===');
    console.log('URL:', result.avatar_url);
    console.log('Is CDN URL:', result.avatar_url.includes('cdn.dreamcore.gg') ? 'PASS' : 'FAIL');

    // Check CDN headers
    const cdnRes = await fetch(result.avatar_url, { method: 'HEAD' });
    console.log('\nCDN Response:');
    console.log('  Status:', cdnRes.status);
    console.log('  Content-Type:', cdnRes.headers.get('content-type'));
    console.log('  Cache-Control:', cdnRes.headers.get('cache-control'));
    console.log('  Access-Control-Allow-Origin:', cdnRes.headers.get('access-control-allow-origin') || 'NOT SET');
  }

  // Note: Not cleaning up test image for manual inspection
}

main().catch(console.error);
