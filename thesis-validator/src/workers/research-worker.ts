/**
 * Research Worker
 *
 * BullMQ worker that processes research jobs
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import type { ResearchJobData } from '../services/job-queue.js';
import type { ProgressEvent } from '../models/index.js';
import { ConductorAgent } from '../agents/index.js';
import { getPool } from '../db/index.js';

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
    ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null,
  });
}

/**
 * Redis publisher for progress events
 */
const redisPublisher = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
});

/**
 * Publish progress event to Redis
 */
async function publishProgress(jobId: string, type: ProgressEvent['type'], data: Record<string, unknown>): Promise<void> {
  const event: ProgressEvent = {
    type,
    jobId,
    timestamp: Date.now(),
    data,
  };

  const channel = `research:progress:${jobId}`;
  try {
    await redisPublisher.publish(channel, JSON.stringify(event));
  } catch (error) {
    console.error('[ResearchWorker] Failed to publish progress:', error);
  }
}

/**
 * Process research job
 */
async function processResearchJob(job: Job<ResearchJobData>): Promise<void> {
  const { engagementId, thesis, config } = job.data;
  const pool = getPool();

  console.log(`[ResearchWorker] Processing job ${job.id} for engagement ${engagementId}`);

  try {
    // Update job status to running
    await pool.query(
      'UPDATE research_jobs SET status = $1, started_at = NOW() WHERE id = $2',
      ['running', job.id]
    );

    await job.updateProgress(10);
    await publishProgress(job.id!, 'status_update', {
      status: 'running',
      message: 'Research job started',
      progress: 10,
    });

    // Initialize conductor
    const conductor = new ConductorAgent();

    // Phase 1: Hypothesis Generation
    await job.updateProgress(20);
    await publishProgress(job.id!, 'phase_start', {
      phase: 'hypothesis_generation',
      message: 'Building investment hypotheses',
      progress: 20,
    });

    // Execute research workflow (runs all phases internally as a batch)
    const results = await conductor.executeResearchWorkflow({
      thesis,
      config: {
        maxHypotheses: config.maxHypotheses ?? 5,
        enableDeepDive: config.enableDeepDive ?? true,
        confidenceThreshold: config.confidenceThreshold ?? 70,
      },
    });

    // Phase complete with hypothesis count
    await publishProgress(job.id!, 'phase_complete', {
      phase: 'hypothesis_generation',
      message: `Generated ${results.hypotheses.length} hypotheses`,
      progress: 30,
      hypothesis_count: results.hypotheses.length,
    });

    // Phase 2: Evidence Gathering
    await job.updateProgress(40);
    await publishProgress(job.id!, 'phase_start', {
      phase: 'evidence_gathering',
      message: 'Gathering supporting evidence',
      progress: 40,
    });

    await publishProgress(job.id!, 'phase_complete', {
      phase: 'evidence_gathering',
      message: `Collected ${results.evidence.length} evidence items`,
      progress: 55,
      evidence_count: results.evidence.length,
    });

    // Phase 3: Contradiction Detection
    await job.updateProgress(60);
    await publishProgress(job.id!, 'phase_start', {
      phase: 'contradiction_detection',
      message: 'Analyzing for contradictions',
      progress: 60,
    });

    await publishProgress(job.id!, 'phase_complete', {
      phase: 'contradiction_detection',
      message: `Found ${results.contradictions.length} potential contradictions`,
      progress: 70,
      contradiction_count: results.contradictions.length,
    });

    // Phase 4: Report Generation
    await job.updateProgress(75);
    await publishProgress(job.id!, 'phase_start', {
      phase: 'report_generation',
      message: 'Generating research report',
      progress: 75,
    });

    await job.updateProgress(80);
    await publishProgress(job.id!, 'phase_complete', {
      phase: 'report_generation',
      message: `Research complete with ${results.confidence.toFixed(1)}% confidence`,
      progress: 80,
    });

    // Store results in database
    await publishProgress(job.id!, 'status_update', {
      status: 'saving',
      message: 'Storing research results',
      progress: 85,
    });

    await storeResearchResults(pool, job.id!, engagementId, results);

    await job.updateProgress(90);

    // Update job status to completed
    await pool.query(
      `UPDATE research_jobs
       SET status = $1, completed_at = NOW(), confidence_score = $2, results = $3
       WHERE id = $4`,
      ['completed', results.confidence, JSON.stringify({
        verdict: results.confidence > 70 ? 'proceed' : 'review',
        summary: `Research completed with ${results.confidence.toFixed(1)}% confidence`,
        key_findings: results.hypotheses.map(h => h.statement),
        risks: results.contradictions,
        opportunities: [],
        recommendations: results.needsDeepDive ? ['Deep dive was performed'] : [],
      }), job.id]
    );

    await job.updateProgress(100);
    await publishProgress(job.id!, 'completed', {
      status: 'completed',
      message: 'Research job completed successfully',
      progress: 100,
      data: {
        confidence: results.confidence,
        verdict: results.confidence > 70 ? 'proceed' : 'review',
      },
    });

    console.log(`[ResearchWorker] Job ${job.id} completed with ${results.confidence.toFixed(1)}% confidence`);

  } catch (error) {
    console.error(`[ResearchWorker] Job ${job.id} failed:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Publish error event
    await publishProgress(job.id!, 'error', {
      status: 'failed',
      message: errorMessage,
      error: errorMessage,
    });

    // Update job status to failed
    await pool.query(
      'UPDATE research_jobs SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
      ['failed', errorMessage, job.id]
    );

    throw error;
  }
}

/**
 * Store research results in database
 */
async function storeResearchResults(
  pool: any,
  jobId: string,
  engagementId: string,
  results: {
    hypotheses: Array<{ statement: string; priority: number }>;
    evidence: Array<{ type: string; content: string; confidence: number }>;
    contradictions: string[];
    confidence: number;
  }
): Promise<void> {
  // Store hypotheses
  for (const hypothesis of results.hypotheses) {
    await pool.query(
      `INSERT INTO hypotheses (job_id, statement, priority, validation_status)
       VALUES ($1, $2, $3, $4)`,
      [jobId, hypothesis.statement, hypothesis.priority, 'pending']
    );
  }

  // Store evidence items
  for (const evidence of results.evidence) {
    await pool.query(
      `INSERT INTO evidence_items (engagement_id, job_id, type, hypothesis, content, confidence)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [engagementId, jobId, evidence.type, 'General research', evidence.content, evidence.confidence]
    );
  }
}

/**
 * Research worker instance
 */
export class ResearchWorker {
  private worker: Worker<ResearchJobData>;

  constructor(concurrency: number = 3) {
    const connection = createRedisConnection();

    this.worker = new Worker<ResearchJobData>(
      'research-jobs',
      processResearchJob,
      {
        connection,
        concurrency,
        limiter: {
          max: 10, // Max 10 jobs per window
          duration: 60000, // Per minute
        },
      }
    );

    // Event handlers
    this.worker.on('completed', (job) => {
      console.log(`[ResearchWorker] Job ${job.id} has completed`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[ResearchWorker] Job ${job?.id} has failed:`, error.message);
    });

    this.worker.on('error', (error) => {
      console.error('[ResearchWorker] Worker error:', error);
    });
  }

  /**
   * Close worker
   */
  async close(): Promise<void> {
    await this.worker.close();
  }

  /**
   * Get worker instance
   */
  getWorker(): Worker<ResearchJobData> {
    return this.worker;
  }
}

/**
 * Start worker if run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new ResearchWorker();
  console.log('[ResearchWorker] Started, waiting for jobs...');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[ResearchWorker] Shutting down...');
    await worker.close();
    process.exit(0);
  });
}
