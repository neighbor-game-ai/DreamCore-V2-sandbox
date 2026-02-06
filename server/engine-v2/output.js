// server/engine-v2/output.js
'use strict';

const PARTIAL_RESULT_MAX_BYTES = 64 * 1024; // 64KB

function validateOutput(result) {
  if (!result) return false;
  if (!Array.isArray(result.files) || result.files.length === 0) return false;
  if (typeof result.summary !== 'string' || result.summary.length === 0) return false;
  if (!result.files.some(f => f.path === 'index.html')) return false;
  // images array is optional (text-only games have no images)
  // qa is required — qa_review task always runs before publish_prep
  if (!result.qa || typeof result.qa.issues !== 'number' || !Array.isArray(result.qa.findings)) return false;
  return true;
}

function toV1Response(v2Result) {
  return {
    type: 'completed',
    files: v2Result.files,
    images: v2Result.images,
    summary: v2Result.summary,
  };
}

function isPartialResultInline(data) {
  const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
  return size <= PARTIAL_RESULT_MAX_BYTES;
}

module.exports = { validateOutput, toV1Response, isPartialResultInline, PARTIAL_RESULT_MAX_BYTES };
