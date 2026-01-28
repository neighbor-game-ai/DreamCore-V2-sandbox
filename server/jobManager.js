const db = require('./database-supabase');
const EventEmitter = require('events');
const config = require('./config');

class JobManager extends EventEmitter {
  constructor() {
    super();
    this.runningJobs = new Map(); // jobId -> { process, cancel }
    this.subscribers = new Map(); // jobId -> Set of callbacks

    // Slot management for concurrent process control
    this.userSlots = new Map(); // userId -> current running count
    this.totalRunning = 0;
  }

  /**
   * Acquire a slot for job execution
   * @param {string} userId - User ID
   * @throws {Error} USER_LIMIT_EXCEEDED or SYSTEM_LIMIT_EXCEEDED
   */
  acquireSlot(userId) {
    const { maxConcurrentPerUser, maxConcurrentTotal } = config.RATE_LIMIT.cli;
    const userCount = this.userSlots.get(userId) || 0;

    if (userCount >= maxConcurrentPerUser) {
      const err = new Error('Too many concurrent requests. Please wait for the current job to finish.');
      err.code = 'USER_LIMIT_EXCEEDED';
      throw err;
    }

    if (this.totalRunning >= maxConcurrentTotal) {
      const err = new Error('System is busy. Please try again in a moment.');
      err.code = 'SYSTEM_LIMIT_EXCEEDED';
      throw err;
    }

    // Acquire slot
    this.userSlots.set(userId, userCount + 1);
    this.totalRunning++;
    console.log(`Slot acquired: user=${userId.slice(0, 8)}... (${userCount + 1}/${maxConcurrentPerUser}), total=${this.totalRunning}/${maxConcurrentTotal}`);
  }

  /**
   * Release a slot after job completion
   * Idempotent: safe to call multiple times (guards against going below 0)
   * @param {string} userId - User ID
   */
  releaseSlot(userId) {
    const { maxConcurrentPerUser, maxConcurrentTotal } = config.RATE_LIMIT.cli;
    const userCount = this.userSlots.get(userId) || 0;

    // Guard: only decrement if > 0 (idempotent)
    if (userCount > 0) {
      this.userSlots.set(userId, userCount - 1);
      if (userCount - 1 === 0) {
        this.userSlots.delete(userId);
      }
    }

    // Guard: only decrement if > 0 (idempotent)
    if (this.totalRunning > 0) {
      this.totalRunning--;
    }

    console.log(`Slot released: user=${userId.slice(0, 8)}... (${Math.max(0, userCount - 1)}/${maxConcurrentPerUser}), total=${this.totalRunning}/${maxConcurrentTotal}`);
  }

  /**
   * Check if user can acquire a slot
   * @param {string} userId - User ID
   * @returns {boolean} True if slot available
   */
  canAcquireSlot(userId) {
    const { maxConcurrentPerUser, maxConcurrentTotal } = config.RATE_LIMIT.cli;
    const userCount = this.userSlots.get(userId) || 0;
    return userCount < maxConcurrentPerUser && this.totalRunning < maxConcurrentTotal;
  }

  /**
   * Get current slot status
   * @returns {Object} Slot status
   */
  getSlotStatus() {
    const { maxConcurrentPerUser, maxConcurrentTotal } = config.RATE_LIMIT.cli;
    return {
      totalRunning: this.totalRunning,
      maxTotal: maxConcurrentTotal,
      userSlots: Object.fromEntries(this.userSlots),
      maxPerUser: maxConcurrentPerUser
    };
  }

  /**
   * Get running jobs for a user
   * @param {string} userId - User ID
   * @returns {Array} Array of { jobId, projectId, projectName }
   */
  getRunningJobsForUser(userId) {
    const jobs = [];
    for (const [jobId, jobInfo] of this.runningJobs) {
      if (jobInfo.userId === userId) {
        jobs.push({
          jobId,
          projectId: jobInfo.projectId,
          projectName: jobInfo.projectName || 'Unknown Project',
          stage: jobInfo.stage || 'processing'
        });
      }
    }
    return jobs;
  }

  /**
   * Update job info (for tracking projectName, stage, etc.)
   * @param {string} jobId - Job ID
   * @param {Object} info - Additional info to merge
   */
  updateJobInfo(jobId, info) {
    const existing = this.runningJobs.get(jobId);
    if (existing) {
      this.runningJobs.set(jobId, { ...existing, ...info });
    }
  }

  // Create a new job
  async createJob(userId, projectId) {
    const job = await db.createJob(userId, projectId);
    if (!job) {
      throw new Error('Failed to create job');
    }
    console.log(`Job created: ${job.id} for project ${projectId}`);
    return job;
  }

  // Get job by ID
  async getJob(jobId) {
    return await db.getJobById(jobId);
  }

  // Get active job for a project (pending or processing)
  async getActiveJob(projectId) {
    return await db.getActiveJobByProjectId(projectId);
  }

  // Get jobs for a user
  async getUserJobs(userId, limit = 20) {
    return await db.getJobsByUserId(userId, limit);
  }

  // Get jobs for a project
  async getProjectJobs(projectId, limit = 20) {
    return await db.getJobsByProjectId(projectId, limit);
  }

  // Get active jobs for a user (with project info)
  async getActiveJobsForUser(userId) {
    return await db.getActiveJobsForUser(userId);
  }

  // Start processing a job
  async startJob(jobId) {
    const job = await db.updateJobStatus(jobId, 'processing');
    this.emit('jobStarted', job);
    this.notifySubscribers(jobId, { type: 'started', job });
    return job;
  }

  // Update job progress
  async updateProgress(jobId, progress, message = null) {
    const job = await db.updateJobProgress(jobId, progress, message);
    this.notifySubscribers(jobId, { type: 'progress', job, progress, message });
    return job;
  }

  // Complete a job
  async completeJob(jobId, result = null) {
    const job = await db.completeJob(jobId, result);
    this.runningJobs.delete(jobId);
    this.emit('jobCompleted', job);
    this.notifySubscribers(jobId, { type: 'completed', job, result });
    console.log(`Job completed: ${jobId}`);
    return job;
  }

  // Fail a job
  async failJob(jobId, error) {
    const job = await db.failJob(jobId, error);
    this.runningJobs.delete(jobId);
    this.emit('jobFailed', job);
    this.notifySubscribers(jobId, { type: 'failed', job, error });
    console.log(`Job failed: ${jobId} - ${error}`);
    return job;
  }

  // Cancel a job
  async cancelJob(jobId) {
    const runningJob = this.runningJobs.get(jobId);
    if (runningJob && runningJob.cancel) {
      runningJob.cancel();
    }

    const job = await db.cancelJob(jobId);
    this.runningJobs.delete(jobId);
    this.emit('jobCancelled', job);
    this.notifySubscribers(jobId, { type: 'cancelled', job });
    console.log(`Job cancelled: ${jobId}`);
    return job;
  }

  // Register a running process for a job
  registerProcess(jobId, process, cancelFn, options = {}) {
    this.runningJobs.set(jobId, {
      process,
      cancel: cancelFn,
      userId: options.userId,
      projectId: options.projectId,
      projectName: options.projectName,
      stage: options.stage || 'processing'
    });
  }

  // Check if a job is running
  isJobRunning(jobId) {
    return this.runningJobs.has(jobId);
  }

  // Subscribe to job updates
  subscribe(jobId, callback) {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId).add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(jobId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(jobId);
        }
      }
    };
  }

  // Notify all subscribers for a job
  notifySubscribers(jobId, data) {
    const subs = this.subscribers.get(jobId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(data);
        } catch (e) {
          console.error('Error in job subscriber callback:', e);
        }
      }
    }
  }

  // Stream progress updates (for WebSocket/SSE)
  async streamJob(jobId, onUpdate) {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }

    // If job is already completed/failed, send final state immediately
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      onUpdate({ type: job.status, job });
      return () => {}; // No-op unsubscribe
    }

    // Otherwise, subscribe to updates
    return this.subscribe(jobId, onUpdate);
  }

  // Get pending jobs count
  async getPendingCount() {
    const jobs = await db.getPendingJobs(1000);
    return jobs.length;
  }

  // Clean up old completed jobs (optional maintenance)
  // Note: This needs to be done via Supabase SQL or admin API
  async cleanupOldJobs(daysOld = 7) {
    console.log(`Job cleanup: Use Supabase Dashboard or SQL to clean up jobs older than ${daysOld} days`);
    return 0;
  }
}

// Singleton instance
const jobManager = new JobManager();

module.exports = jobManager;
