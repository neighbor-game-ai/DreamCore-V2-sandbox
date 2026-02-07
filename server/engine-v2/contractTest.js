// server/engine-v2/contractTest.js
// Contract test: verify V2 Modal endpoints exist before running shadow/live.
'use strict';

const config = require('../config');

/**
 * Derive a V2 endpoint URL from the base Modal endpoint.
 * Mirrors modalClient.deriveEndpoint logic.
 */
function deriveV2Url(endpointName) {
  const base = config.MODAL_ENDPOINT;
  if (!base) return null;
  return base.replace(/generate[_-]game/i, endpointName.replace(/_/g, '-'));
}

// Required V2 endpoints (name → derive name)
const REQUIRED_ENDPOINTS = [
  { name: 'v2_detect_intent', deriveName: 'v2-detect-intent' },
  { name: 'v2_generate_code', deriveName: 'v2-generate-code' },
];

// Cache: null = not tested, true/false = result
let _result = null;
let _failedEndpoints = [];

/**
 * Run contract test against V2 Modal endpoints.
 *
 * Sends a minimal POST to each required endpoint and checks
 * that it responds (any status except 404). A 404 means the
 * endpoint does not exist on Modal (not deployed).
 *
 * Results are cached — subsequent calls return immediately.
 *
 * @returns {Promise<boolean>} true if all required endpoints exist
 */
async function runContractTest() {
  // Return cached result on subsequent calls
  if (_result !== null) return _result;

  const secret = config.MODAL_INTERNAL_SECRET;
  if (!config.MODAL_ENDPOINT || !secret) {
    console.warn('[EngineV2:contract] Skipped: Modal not configured');
    _result = false;
    return false;
  }

  const failed = [];

  for (const ep of REQUIRED_ENDPOINTS) {
    const url = deriveV2Url(ep.deriveName);
    if (!url) {
      failed.push(`${ep.name}: URL could not be derived`);
      continue;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Modal-Secret': secret,
        },
        body: JSON.stringify({ message: '__contract_test__' }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 404) {
        failed.push(`${ep.name}: 404 (not deployed)`);
      }
      // Any other status (200, 400, 401, 422, 500) = endpoint exists
    } catch (err) {
      failed.push(`${ep.name}: ${err.message}`);
    }
  }

  _failedEndpoints = failed;

  if (failed.length > 0) {
    console.error(`[EngineV2:contract] FAILED — disabling v2:\n  ${failed.join('\n  ')}`);
    _result = false;
  } else {
    console.log('[EngineV2:contract] All V2 endpoints verified');
    _result = true;
  }

  return _result;
}

/**
 * Get the list of failed endpoints from the last test run.
 * @returns {string[]}
 */
function getFailedEndpoints() {
  return _failedEndpoints;
}

/**
 * Reset cached result (for testing purposes).
 */
function resetContractTest() {
  _result = null;
  _failedEndpoints = [];
}

module.exports = { runContractTest, getFailedEndpoints, resetContractTest };
