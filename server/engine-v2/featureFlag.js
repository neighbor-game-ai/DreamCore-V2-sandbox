// server/engine-v2/featureFlag.js
'use strict';

const ENGINE_V2_ENABLED = process.env.ENGINE_V2_ENABLED === 'true';
const ENGINE_V2_ALLOWLIST_ONLY = process.env.ENGINE_V2_ALLOWLIST_ONLY !== 'false';
const ALLOWLIST = new Set(
  (process.env.ENGINE_V2_ALLOWLIST || '').split(',').filter(Boolean)
);

// 'shadow' = v2 runs in background for measurement only, v1 result always returned
// 'live'   = v2 replaces v1 (with fallback on failure)
// Any other value is forced to 'shadow' for safety
const VALID_MODES = new Set(['shadow', 'live']);
const ENGINE_V2_MODE = VALID_MODES.has(process.env.ENGINE_V2_MODE)
  ? process.env.ENGINE_V2_MODE
  : 'shadow';

function shouldUseV2(verifiedUser) {
  if (!ENGINE_V2_ENABLED) return false;
  if (!ENGINE_V2_ALLOWLIST_ONLY) return true;
  return ALLOWLIST.has(verifiedUser.id) || ALLOWLIST.has(verifiedUser.email);
}

function isShadowMode() {
  return ENGINE_V2_MODE === 'shadow';
}

module.exports = { shouldUseV2, isShadowMode, ENGINE_V2_ENABLED, ENGINE_V2_MODE };
