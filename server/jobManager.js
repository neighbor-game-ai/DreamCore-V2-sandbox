const db = require('./database');
const EventEmitter = require('events');

class JobManager extends EventEmitter {
  constructor() {
    super();
    this.runningJobs = new Map(); // jobId -> { process, cancel }
    this.subscribers = new Map(); // jobId -> Set of callbacks
  }

  // Create a new job
  createJob(userId, projectId) {
    const job = db.createJob(userId, projectId);
    console.log(`Job created: ${job.id} for project ${projectId}`);
    return job;
  }

  // Get job by ID
  getJob(jobId) {
    return db.getJobById(jobId);
  }

  // Get active job for a project (pending or processing)
  getActiveJob(projectId) {
    return db.getActiveJobByProjectId(projectId);
  }

  // Get jobs for a user
  getUserJobs(userId, limit = 20) {
    return db.getJobsByUserId(userId, limit);
  }

  // Get jobs for a project
  getProjectJobs(projectId, limit = 20) {
    return db.getJobsByProjectId(projectId, limit);
  }

  // Start processing a job
  startJob(jobId) {
    const job = db.updateJobStatus(jobId, 'processing');
    this.emit('jobStarted', job);
    this.notifySubscribers(jobId, { type: 'started', job });
    return job;
  }

  // Update job progress
  updateProgress(jobId, progress, message = null) {
    const job = db.updateJobProgress(jobId, progress, message);
    this.notifySubscribers(jobId, { type: 'progress', job, progress, message });
    return job;
  }

  // Complete a job
  completeJob(jobId, result = null) {
    const job = db.completeJob(jobId, result);
    this.runningJobs.delete(jobId);
    this.emit('jobCompleted', job);
    this.notifySubscribers(jobId, { type: 'completed', job, result });
    console.log(`Job completed: ${jobId}`);
    return job;
  }

  // Fail a job
  failJob(jobId, error) {
    const job = db.failJob(jobId, error);
    this.runningJobs.delete(jobId);
    this.emit('jobFailed', job);
    this.notifySubscribers(jobId, { type: 'failed', job, error });
    console.log(`Job failed: ${jobId} - ${error}`);
    return job;
  }

  // Cancel a job
  cancelJob(jobId) {
    const runningJob = this.runningJobs.get(jobId);
    if (runningJob && runningJob.cancel) {
      runningJob.cancel();
    }

    const job = db.cancelJob(jobId);
    this.runningJobs.delete(jobId);
    this.emit('jobCancelled', job);
    this.notifySubscribers(jobId, { type: 'cancelled', job });
    console.log(`Job cancelled: ${jobId}`);
    return job;
  }

  // Register a running process for a job
  registerProcess(jobId, process, cancelFn) {
    this.runningJobs.set(jobId, { process, cancel: cancelFn });
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
  streamJob(jobId, onUpdate) {
    const job = this.getJob(jobId);
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
  getPendingCount() {
    return db.getPendingJobs(1000).length;
  }

  // Clean up old completed jobs (optional maintenance)
  cleanupOldJobs(daysOld = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = db.db.prepare(`
      DELETE FROM jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND updated_at < ?
    `).run(cutoff.toISOString());

    console.log(`Cleaned up ${result.changes} old jobs`);
    return result.changes;
  }
}

// Singleton instance
const jobManager = new JobManager();

module.exports = jobManager;
