// server/engine-v2/featureFlag.js
'use strict';

const ENGINE_V2_ENABLED = process.env.ENGINE_V2_ENABLED === 'true';
const ENGINE_V2_ALLOWLIST_ONLY = process.env.ENGINE_V2_ALLOWLIST_ONLY !== 'false';
const ALLOWLIST = new Set(
  (process.env.ENGINE_V2_ALLOWLIST || '').split(',').filter(Boolean)
);

function shouldUseV2(verifiedUser) {
  if (!ENGINE_V2_ENABLED) return false;
  if (!ENGINE_V2_ALLOWLIST_ONLY) return true;
  return ALLOWLIST.has(verifiedUser.id) || ALLOWLIST.has(verifiedUser.email);
}

module.exports = { shouldUseV2, ENGINE_V2_ENABLED };
