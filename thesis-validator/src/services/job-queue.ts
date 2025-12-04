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
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });
}

/**
 * Research job data
 */
export interface ResearchJobData {
  engagementId: string;
  thesis: string;
  config: {
    maxHypotheses?: number;
    enableDeepDive?: boolean;
    confidenceThreshold?: number;
    searchDepth?: 'quick' | 'standard' | 'thorough';
  };
}

/**
 * Research job queue
 */
export class ResearchJobQueue {
  private queue: Queue<ResearchJobData>;
  private events: QueueEvents;

  constructor() {
    const connection = createRedisConnection();

    this.queue = new Queue<ResearchJobData>('research:jobs', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // Start at 1 minute
        },
        timeout: 1800000, // 30 minutes max
        removeOnComplete: {
          age: 86400 * 7, // Keep completed jobs for 7 days
          count: 100,
        },
        removeOnFail: {
          age: 86400 * 30, // Keep failed jobs for 30 days
        },
      },
    });

    this.events = new QueueEvents('research:jobs', {
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
