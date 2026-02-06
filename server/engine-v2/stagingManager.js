'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const STAGING_BASE = '/tmp/engine-v2-staging';

/**
 * Create an isolated staging directory for a job.
 * @param {string} jobId
 * @returns {Promise<string>} The staging directory path.
 */
async function createStagingDir(jobId) {
  const dir = path.join(STAGING_BASE, jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Remove the staging directory (best-effort, no throw on failure).
 * @param {string} jobId
 */
async function cleanupStagingDir(jobId) {
  const dir = path.join(STAGING_BASE, jobId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort: ignore errors
  }
}

/**
 * Return the production directory path for a project.
 * @param {string} userId
 * @param {string} projectId
 * @returns {string}
 */
function getProjectDir(userId, projectId) {
  return `/data/users/${userId}/projects/${projectId}/`;
}

/**
 * Check whether a path exists on disk.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomically swap staging content into the production directory.
 *
 * Strategy:
 *   1. Copy staging -> prodDir.new
 *   2. If prod exists, rename prod -> prod.bak.{ts}, then prod.new -> prod
 *      (rollback on failure: restore backup, remove .new)
 *   3. If prod does not exist (first creation), just rename prod.new -> prod
 *   4. Delete backup only on success
 *
 * @param {string} userId
 * @param {string} projectId
 * @param {string} stagingDir
 */
async function doRenameSwap(userId, projectId, stagingDir) {
  const prodDir = getProjectDir(userId, projectId);
  const backupDir = `${prodDir}.bak.${Date.now()}`;
  const tempTarget = `${prodDir}.new`;

  await fs.cp(stagingDir, tempTarget, { recursive: true });

  const prodExists = await exists(prodDir);

  if (prodExists) {
    await fs.rename(prodDir, backupDir);
    try {
      await fs.rename(tempTarget, prodDir);
    } catch (err) {
      // Rollback: restore the backup, remove temp
      await fs.rename(backupDir, prodDir).catch(() => {});
      await fs.rm(tempTarget, { recursive: true }).catch(() => {});
      // backupDir is NEVER deleted on failure
      throw err;
    }
    // Success only: delete backup
    fs.rm(backupDir, { recursive: true }).catch(() => {});
  } else {
    // First creation – ensure parent exists
    const parentDir = path.dirname(prodDir);
    await fs.mkdir(parentDir, { recursive: true });
    try {
      await fs.rename(tempTarget, prodDir);
    } catch (err) {
      await fs.rm(tempTarget, { recursive: true }).catch(() => {});
      throw err;
    }
  }
}

/**
 * Convert a project UUID into two int32 keys for pg_try_advisory_xact_lock.
 * @param {string} projectId
 * @returns {{ key1: number, key2: number }}
 */
function getAdvisoryLockKey(projectId) {
  const hash = crypto.createHash('md5').update(projectId).digest();
  return {
    key1: hash.readInt32BE(0),
    key2: hash.readInt32BE(4),
  };
}

/**
 * Acquire a Postgres advisory lock on the project and atomically swap
 * the staging directory into production.
 *
 * @param {object} db  Database helper with a `transaction(fn)` method.
 * @param {string} userId
 * @param {string} projectId
 * @param {string} stagingDir
 */
async function applyToProduction(db, userId, projectId, stagingDir) {
  const { key1, key2 } = getAdvisoryLockKey(projectId);

  await db.transaction(async (client) => {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS acquired',
      [key1, key2]
    );
    if (!lockResult.rows[0].acquired) {
      throw new Error('v2_concurrent_apply');
    }
    await doRenameSwap(userId, projectId, stagingDir);
  });
}

module.exports = {
  createStagingDir,
  cleanupStagingDir,
  getProjectDir,
  doRenameSwap,
  applyToProduction,
  getAdvisoryLockKey,
};
