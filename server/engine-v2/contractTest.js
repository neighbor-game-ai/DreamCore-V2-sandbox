// server/engine-v2/contractTest.js
// Contract test: verify V2 Modal endpoints return expected responses.
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

/**
 * Required V2 endpoints with per-endpoint validation.
 *
 * Each endpoint specifies:
 *   - deriveName: URL segment for deriveEndpoint
 *   - body: minimal request body for the test
 *   - validate(status, body): returns { ok, reason }
 */
const REQUIRED_ENDPOINTS = [
  {
    name: 'v2_detect_intent',
    deriveName: 'v2-detect-intent',
    body: { message: '赤い車のレースゲームを作って' },
    validate(status, body) {
      // Must return 200 with { intent: string }
      if (status >= 500) return { ok: false, reason: `${status} (server error)` };
      if (status === 404) return { ok: false, reason: '404 (not deployed)' };
      if (status !== 200) return { ok: false, reason: `${status} (expected 200)` };
      if (!body || typeof body.intent !== 'string') {
        return { ok: false, reason: 'missing intent field in response' };
      }
      if (!['chat', 'edit', 'restore'].includes(body.intent)) {
        return { ok: false, reason: `invalid intent: ${body.intent}` };
      }
      return { ok: true };
    },
  },
  {
    name: 'v2_generate_code',
    deriveName: 'v2-generate-code',
    body: { message: '__contract_test__' },  // Missing user_id/project_id → 400
    validate(status, _body) {
      // 400 (missing params) is acceptable; 5xx is not
      if (status >= 500) return { ok: false, reason: `${status} (server error)` };
      if (status === 404) return { ok: false, reason: '404 (not deployed)' };
      if (status === 400) return { ok: true };  // Expected: missing required params
      if (status === 200) return { ok: true };
      return { ok: false, reason: `unexpected status ${status}` };
    },
  },
];

// Cache: null = not tested, true/false = result
let _result = null;
let _failedEndpoints = [];

/**
 * Run contract test against V2 Modal endpoints.
 *
 * Validates each endpoint against its expected behavior:
 * - v2_detect_intent: must return 200 + { intent: "chat"|"edit"|"restore" }
 * - v2_generate_code: 400 (missing params) is OK, 5xx is fail
 *
 * Results are cached — subsequent calls return immediately.
 *
 * @returns {Promise<boolean>} true if all required endpoints pass
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
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Modal-Secret': secret,
        },
        body: JSON.stringify(ep.body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Parse response body for schema validation
      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch (_) {
        // Non-JSON response — pass status to validator
      }

      const { ok, reason } = ep.validate(response.status, responseBody);
      if (!ok) {
        failed.push(`${ep.name}: ${reason}`);
      }
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
