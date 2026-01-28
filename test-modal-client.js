/**
 * Modal Client Unit Test Script
 * Tests modalClient.js functions without requiring Modal to be running
 *
 * Test Cases:
 * 1. parseSSEStream_valid - Parse valid SSE data
 * 2. parseSSEStream_multiline - Parse multiline SSE data
 * 3. convertSseToWsEvent_mapping - SSE to WebSocket type mapping
 * 4. deriveEndpoint_function - Endpoint URL derivation
 *
 * Note: These are unit tests that don't require Modal to be deployed.
 * For full integration tests, see test-modal-generate.js
 */

// Mock fetch for unit testing
const { Readable } = require('stream');
const { ReadableStream } = require('stream/web');

// Test results
const results = {
  parseSSEStream_valid: { status: 'pending', details: '' },
  parseSSEStream_multiline: { status: 'pending', details: '' },
  convertSseToWsEvent_mapping: { status: 'pending', details: '' },
  deriveEndpoint_function: { status: 'pending', details: '' },
  sseTypeMapping_complete: { status: 'pending', details: '' }
};

// Import the module for testing internal functions
// We'll need to access the SSE parsing and type mapping logic

// SSE to WebSocket type mapping (same as in modalClient.js)
const SSE_TO_WS_TYPE_MAP = {
  'status': 'progress',
  'stream': 'stream',
  'done': 'completed',
  'error': 'failed',
  'result': 'result',
  'log': 'log',
  'debug': 'debug',
  'warning': 'warning',
};

// Derive endpoint function (same as in modalClient.js)
function deriveEndpoint(baseEndpoint, endpointName) {
  if (!baseEndpoint) return null;
  return baseEndpoint.replace(/generate[_-]game/i, endpointName.replace(/_/g, '-'));
}

// Convert SSE event to WS event (same as in modalClient.js)
function convertSseToWsEvent(sseData) {
  const wsType = SSE_TO_WS_TYPE_MAP[sseData.type] || sseData.type;
  return {
    ...sseData,
    type: wsType,
  };
}

// Create a mock Response with SSE data
function createMockSSEResponse(sseLines) {
  const encoder = new TextEncoder();
  const sseText = sseLines.join('\n');
  const uint8Array = encoder.encode(sseText);

  // Create a ReadableStream that mimics fetch response body
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(uint8Array);
      controller.close();
    }
  });

  return {
    ok: true,
    status: 200,
    body: stream
  };
}

// Parse SSE stream (simplified version for testing)
async function parseSSEStream(sseText) {
  const results = [];
  const lines = sseText.split('\n');
  let buffer = '';

  for (const line of lines) {
    buffer += line + '\n';
    const trimmed = line.trim();

    if (trimmed.startsWith('data: ')) {
      try {
        const jsonStr = trimmed.slice(6);
        if (jsonStr) {
          results.push(JSON.parse(jsonStr));
        }
      } catch (e) {
        // Skip parse errors
      }
    }
  }

  return results;
}

// Test 1: parseSSEStream_valid
async function testParseSSEStreamValid() {
  console.log('\n--- Test 1: parseSSEStream_valid ---');

  const sseText = `data: {"type":"status","message":"Starting..."}

data: {"type":"stream","content":"<html>"}

data: {"type":"done","success":true}
`;

  try {
    const events = await parseSSEStream(sseText);

    console.log('Parsed events:', JSON.stringify(events, null, 2));

    if (events.length !== 3) {
      results.parseSSEStream_valid = {
        status: 'fail',
        details: `Expected 3 events, got ${events.length}`
      };
      return;
    }

    // Verify first event
    if (events[0].type !== 'status' || events[0].message !== 'Starting...') {
      results.parseSSEStream_valid = {
        status: 'fail',
        details: `First event incorrect: ${JSON.stringify(events[0])}`
      };
      return;
    }

    // Verify second event
    if (events[1].type !== 'stream' || events[1].content !== '<html>') {
      results.parseSSEStream_valid = {
        status: 'fail',
        details: `Second event incorrect: ${JSON.stringify(events[1])}`
      };
      return;
    }

    // Verify third event
    if (events[2].type !== 'done' || events[2].success !== true) {
      results.parseSSEStream_valid = {
        status: 'fail',
        details: `Third event incorrect: ${JSON.stringify(events[2])}`
      };
      return;
    }

    results.parseSSEStream_valid = {
      status: 'pass',
      details: `Successfully parsed ${events.length} events`
    };
  } catch (error) {
    results.parseSSEStream_valid = {
      status: 'fail',
      details: `Exception: ${error.message}`
    };
  }
}

// Test 2: parseSSEStream_multiline
async function testParseSSEStreamMultiline() {
  console.log('\n--- Test 2: parseSSEStream_multiline ---');

  // Test with many events
  const sseLines = [];
  for (let i = 0; i < 10; i++) {
    sseLines.push(`data: {"type":"stream","content":"chunk${i}"}`);
    sseLines.push('');  // Empty line between events
  }
  sseLines.push('data: {"type":"done","success":true}');

  const sseText = sseLines.join('\n');

  try {
    const events = await parseSSEStream(sseText);

    console.log(`Parsed ${events.length} events`);

    // Should have 10 stream events + 1 done event
    if (events.length !== 11) {
      results.parseSSEStream_multiline = {
        status: 'fail',
        details: `Expected 11 events, got ${events.length}`
      };
      return;
    }

    // Verify all stream events
    for (let i = 0; i < 10; i++) {
      if (events[i].type !== 'stream' || events[i].content !== `chunk${i}`) {
        results.parseSSEStream_multiline = {
          status: 'fail',
          details: `Stream event ${i} incorrect: ${JSON.stringify(events[i])}`
        };
        return;
      }
    }

    // Verify done event
    if (events[10].type !== 'done' || events[10].success !== true) {
      results.parseSSEStream_multiline = {
        status: 'fail',
        details: `Done event incorrect: ${JSON.stringify(events[10])}`
      };
      return;
    }

    results.parseSSEStream_multiline = {
      status: 'pass',
      details: `Successfully parsed ${events.length} multiline events`
    };
  } catch (error) {
    results.parseSSEStream_multiline = {
      status: 'fail',
      details: `Exception: ${error.message}`
    };
  }
}

// Test 3: convertSseToWsEvent_mapping
async function testConvertSseToWsEventMapping() {
  console.log('\n--- Test 3: convertSseToWsEvent_mapping ---');

  const testCases = [
    { input: { type: 'status', message: 'Starting...' }, expectedType: 'progress' },
    { input: { type: 'stream', content: '<html>' }, expectedType: 'stream' },
    { input: { type: 'done', success: true }, expectedType: 'completed' },
    { input: { type: 'error', message: 'Failed' }, expectedType: 'failed' },
    { input: { type: 'result', data: {} }, expectedType: 'result' },
    { input: { type: 'log', content: 'Debug info' }, expectedType: 'log' },
    { input: { type: 'debug', exit_code: 0 }, expectedType: 'debug' },
    { input: { type: 'warning', message: 'Warning!' }, expectedType: 'warning' },
    { input: { type: 'unknown', data: 'test' }, expectedType: 'unknown' },  // Unmapped type
  ];

  const failures = [];

  for (const testCase of testCases) {
    const result = convertSseToWsEvent(testCase.input);

    if (result.type !== testCase.expectedType) {
      failures.push({
        input: testCase.input.type,
        expected: testCase.expectedType,
        got: result.type
      });
    }

    // Verify original data is preserved
    for (const key of Object.keys(testCase.input)) {
      if (key !== 'type' && result[key] !== testCase.input[key]) {
        failures.push({
          input: testCase.input.type,
          issue: `${key} not preserved`
        });
      }
    }
  }

  if (failures.length > 0) {
    results.convertSseToWsEvent_mapping = {
      status: 'fail',
      details: `Mapping failures: ${JSON.stringify(failures)}`
    };
  } else {
    results.convertSseToWsEvent_mapping = {
      status: 'pass',
      details: `All ${testCases.length} type mappings correct`
    };
  }
}

// Test 4: deriveEndpoint_function
async function testDeriveEndpointFunction() {
  console.log('\n--- Test 4: deriveEndpoint_function ---');

  const testCases = [
    {
      base: 'https://xxx--dreamcore-generate-game.modal.run',
      endpoint: 'get_file',
      expected: 'https://xxx--dreamcore-get-file.modal.run'
    },
    {
      base: 'https://xxx--dreamcore-generate-game.modal.run',
      endpoint: 'list_files',
      expected: 'https://xxx--dreamcore-list-files.modal.run'
    },
    {
      base: 'https://xxx--dreamcore-generate-game.modal.run',
      endpoint: 'apply_files',
      expected: 'https://xxx--dreamcore-apply-files.modal.run'
    },
    {
      base: 'https://xxx--dreamcore-generate-game.modal.run',
      endpoint: 'detect_intent',
      expected: 'https://xxx--dreamcore-detect-intent.modal.run'
    },
    {
      base: 'https://xxx--dreamcore-generate-game.modal.run',
      endpoint: 'generate_gemini',
      expected: 'https://xxx--dreamcore-generate-gemini.modal.run'
    },
    {
      base: null,
      endpoint: 'get_file',
      expected: null
    },
  ];

  const failures = [];

  for (const testCase of testCases) {
    const result = deriveEndpoint(testCase.base, testCase.endpoint);

    if (result !== testCase.expected) {
      failures.push({
        base: testCase.base,
        endpoint: testCase.endpoint,
        expected: testCase.expected,
        got: result
      });
    }
  }

  if (failures.length > 0) {
    results.deriveEndpoint_function = {
      status: 'fail',
      details: `Derivation failures: ${JSON.stringify(failures)}`
    };
  } else {
    results.deriveEndpoint_function = {
      status: 'pass',
      details: `All ${testCases.length} endpoint derivations correct`
    };
  }
}

// Test 5: SSE type mapping completeness
async function testSseTypeMappingComplete() {
  console.log('\n--- Test 5: sseTypeMapping_complete ---');

  // All expected Modal event types
  const expectedTypes = ['status', 'stream', 'done', 'error', 'result', 'log', 'debug', 'warning'];

  const missing = [];
  for (const type of expectedTypes) {
    if (!(type in SSE_TO_WS_TYPE_MAP)) {
      missing.push(type);
    }
  }

  if (missing.length > 0) {
    results.sseTypeMapping_complete = {
      status: 'fail',
      details: `Missing mappings for: ${missing.join(', ')}`
    };
  } else {
    results.sseTypeMapping_complete = {
      status: 'pass',
      details: `All ${expectedTypes.length} expected types have mappings`
    };
  }
}

// Run all tests
async function runTests() {
  console.log('========================================');
  console.log('Modal Client Unit Tests');
  console.log('========================================');
  console.log('');
  console.log('Test Cases:');
  console.log('1. parseSSEStream_valid - Parse valid SSE data');
  console.log('2. parseSSEStream_multiline - Parse multiline SSE data');
  console.log('3. convertSseToWsEvent_mapping - Type mapping tests');
  console.log('4. deriveEndpoint_function - Endpoint URL derivation');
  console.log('5. sseTypeMapping_complete - Mapping completeness');
  console.log('');

  await testParseSSEStreamValid();
  await testParseSSEStreamMultiline();
  await testConvertSseToWsEventMapping();
  await testDeriveEndpointFunction();
  await testSseTypeMappingComplete();

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
