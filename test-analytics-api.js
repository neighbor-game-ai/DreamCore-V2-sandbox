#!/usr/bin/env node
/**
 * Analytics API Test Script
 *
 * Tests the analytics endpoints:
 *   POST /api/analytics/session     - Create session
 *   POST /api/analytics/track       - Track events
 *   POST /api/analytics/link        - Link user to session
 *   POST /api/analytics/session/:id/end - End session
 */

require('dotenv').config();
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const testDeviceId = `test_device_${Date.now()}`;
let testSessionId = null;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\\n=== Analytics API Tests ===\\n');
  let passed = 0;
  let total = 0;

  // Test 1: Create Session
  total++;
  if (await test('POST /api/analytics/session - Create session', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: testDeviceId,
        user_agent: 'TestAgent/1.0',
        referrer: 'https://test.com',
        utm: { source: 'test', medium: 'api' },
        landing_page: '/test'
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`HTTP ${res.status}: ${error.error}`);
    }

    const data = await res.json();
    if (!data.session_id) throw new Error('No session_id returned');
    testSessionId = data.session_id;
  })) passed++;

  // Test 2: Track Events
  total++;
  if (await test('POST /api/analytics/track - Track events', async () => {
    if (!testSessionId) throw new Error('No session_id from previous test');

    const res = await fetch(`${BASE_URL}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: testDeviceId,
        session_id: testSessionId,
        events: [
          {
            event_type: 'page_view',
            page_path: '/test-page',
            event_timestamp: new Date().toISOString()
          },
          {
            event_type: 'game_play',
            page_path: '/game/test',
            properties: { game_id: 'test-game-123' },
            event_timestamp: new Date().toISOString()
          }
        ]
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`HTTP ${res.status}: ${error.error}`);
    }

    const data = await res.json();
    if (data.count !== 2) throw new Error(`Expected 2 count, got ${data.count}`);
  })) passed++;

  // Test 3: Track with invalid event type (should fail)
  total++;
  if (await test('POST /api/analytics/track - Reject invalid event type', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: testDeviceId,
        session_id: testSessionId,
        events: [
          {
            event_type: 'invalid_type_xyz',
            page_path: '/test',
            event_timestamp: new Date().toISOString()
          }
        ]
      })
    });

    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
  })) passed++;

  // Test 4: End Session
  total++;
  if (await test('POST /api/analytics/session/:id/end - End session', async () => {
    if (!testSessionId) throw new Error('No session_id from previous test');

    const res = await fetch(`${BASE_URL}/api/analytics/session/${testSessionId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`HTTP ${res.status}: ${error.error}`);
    }

    const data = await res.json();
    if (!data.ok) throw new Error('Expected ok: true');
  })) passed++;

  // Summary
  console.log(`\\n=== Results: ${passed}/${total} passed ===\\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
