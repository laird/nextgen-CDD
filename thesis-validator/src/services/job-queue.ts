/**
 * Job Queue Service
 *
 * BullMQ queue initialization and utilities for research jobs
 */

import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

// Redis connection from environment
const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];

/**
 * Create Redis connection
 */
function createRedisConnection(): Redis {
  const options: {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: null;
  } = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
  };

  if (REDIS_PASSWORD !== undefined) {
    options.password = REDIS_PASSWORD;
  }

  return new Redis(options);
}

/**
 * Research job data
 */
export type ResearchJobData =
  | {
    type: 'research';
    engagementId: string;
    thesis: string;
    config: {
      maxHypotheses?: number;
      enableDeepDive?: boolean;
      confidenceThreshold?: number;
      searchDepth?: 'quick' | 'standard' | 'thorough';
    };
  }
  | {
    type: 'stress_test';
    engagementId: string;
    stressTestId: string; // Needed to update status in DB
    config: {
      intensity: 'light' | 'moderate' | 'aggressive';
    };
    hypothesisIds?: string[];
  };

/**
 * Research job queue
 */
export class ResearchJobQueue {
  private queue: Queue<ResearchJobData>;
  private events: QueueEvents;

  constructor() {
    const connection = createRedisConnection();

    this.queue = new Queue<ResearchJobData>('research-jobs', {
      connection,
      defaultJobOptions: {
        attempts: 100, // Retry up to 100 times (approx 1.5 hours of retries, or indefinitely if we want)
        backoff: {
          type: 'fixed',
          delay: 60000, // Retry every 1 minute
        },
        removeOnComplete: {
          age: 86400 * 7, // Keep completed jobs for 7 days
          count: 100,
        },
        removeOnFail: {
          age: 86400 * 30, // Keep failed jobs for 30 days
        },
      },
    });

    this.events = new QueueEvents('research-jobs', {
      connection: createRedisConnection(),
    });
  }

  /**
   * Add research job to queue
   */
  async addJob(jobId: string, data: ResearchJobData): Promise<void> {
    await this.queue.add('research', data, {
      jobId,
      priority: 1, // Lower number = higher priority
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<string | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return state;
  }

  /**
   * Wait for job completion
   */
  async waitForCompletion(jobId: string, timeout: number = 1800000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Job timeout'));
      }, timeout);

      const completedHandler = ({ jobId: completedId }: { jobId: string }) => {
        if (completedId === jobId) {
          cleanup();
          resolve();
        }
      };

      const failedHandler = ({ jobId: failedId }: { jobId: string }) => {
        if (failedId === jobId) {
          cleanup();
          reject(new Error('Job failed'));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.events.off('completed', completedHandler);
        this.events.off('failed', failedHandler);
      };

      this.events.on('completed', completedHandler);
      this.events.on('failed', failedHandler);
    });
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.queue.close();
    await this.events.close();
  }

  /**
   * Get queue counts
   */
  async getQueueCounts(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0
    };
  }

  /**
   * Get jobs by status
   */
  async getJobs(status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'): Promise<any[]> {
    const jobs = await this.queue.getJobs([status]);
    return jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: job.progress,
      delay: job.delay,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      returnvalue: job.returnvalue,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    }));
  }

  /**
   * Get queue instance for worker
   */
  getQueue(): Queue<ResearchJobData> {
    return this.queue;
  }
}

/**
 * Singleton instance
 */
let researchQueue: ResearchJobQueue | null = null;

/**
 * Get or create research queue
 */
export function getResearchQueue(): ResearchJobQueue {
  if (!researchQueue) {
    researchQueue = new ResearchJobQueue();
  }
  return researchQueue;
}
