/**
 * Git utilities
 * Safe async git operations without shell interpolation
 */

const { execFile } = require('child_process');

/**
 * Safe async git commit (no shell interpolation)
 * Non-blocking: fires and forgets. Logs on failure but does not throw.
 * @param {string} cwd - Working directory
 * @param {string} message - Commit message
 * @param {string[]} files - Files to add (default: ['-A'] for all)
 */
const gitCommitAsync = (cwd, message, files = ['-A']) => {
  // First: git add
  execFile('git', ['add', ...files], { cwd }, (addErr) => {
    if (addErr) {
      console.log(`[Git] Add failed: ${addErr.message}`);
      return;
    }
    // Then: git commit
    execFile('git', ['commit', '-m', message, '--allow-empty'], { cwd }, (commitErr) => {
      if (commitErr) {
        console.log(`[Git] Commit skipped: ${commitErr.message}`);
      } else {
        console.log(`[Git] Committed: ${message}`);
      }
    });
  });
};

module.exports = { gitCommitAsync };
