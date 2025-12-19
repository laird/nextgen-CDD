/**
 * Research Worker
 *
 * BullMQ worker that processes research jobs
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import type { ResearchJobData } from '../services/job-queue.js';
import type { ProgressEvent, EngagementEvent, Engagement } from '../models/index.js';
import { executeResearchWorkflow } from '../workflows/index.js';
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
 * Fetch engagement from database
 */
async function fetchEngagement(engagementId: string): Promise<Engagement | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM engagements WHERE id = $1',
    [engagementId]
  );

  if (rows.length === 0) return null;

  const row = rows[0]!;

  // Map database row to Engagement type
  // Required fields with sensible defaults for optional DB columns
  // Note: DB uses 'target_company' as the main name field, not 'name'
  const targetCompanyName = row.target_company as string;
  const target = typeof row.target === 'string'
    ? JSON.parse(row.target as string)
    : (row.target as Record<string, unknown> ?? {});
  const thesis = typeof row.thesis === 'string'
    ? JSON.parse(row.thesis as string)
    : row.thesis;
  const config = typeof row.config === 'string'
    ? JSON.parse(row.config as string)
    : (row.config as Record<string, unknown> ?? {});

  // Normalize sector to valid enum value
  const rawSector = (target.sector as string) ?? (row.sector as string) ?? 'technology';
  const validSectors = [
    'technology', 'healthcare', 'industrials', 'consumer', 'financial_services',
    'energy', 'real_estate', 'media', 'telecommunications', 'materials', 'utilities', 'other'
  ] as const;
  type Sector = typeof validSectors[number];
  const sector: Sector = validSectors.includes(rawSector.toLowerCase() as Sector)
    ? (rawSector.toLowerCase() as Sector)
    : 'other';

  return {
    id: row.id as string,
    name: targetCompanyName, // DB stores this as target_company
    client_name: (row.lead_partner as string) ?? 'Unknown Client',
    deal_type: (row.deal_type as Engagement['deal_type']) ?? 'buyout',
    status: row.status as Engagement['status'],
    target_company: {
      name: (target.name as string) ?? targetCompanyName,
      sector,
      description: (target.description as string) ?? (row.description as string),
    },
    investment_thesis: thesis ? {
      summary: thesis.statement ?? thesis.summary ?? '',
      key_value_drivers: thesis.key_value_drivers ?? [],
      key_risks: thesis.key_risks ?? [],
    } : undefined,
    team: [],
    config: {
      enable_real_time_support: config.enable_real_time_support ?? false,
      enable_contradiction_analysis: config.enable_contradiction_analysis ?? true,
      enable_comparables_search: config.enable_comparables_search ?? true,
      auto_refresh_market_intel: config.auto_refresh_market_intel ?? false,
    },
    retention_policy: {
      deal_memory_days: 365,
      allow_institutional_learning: true,
      anonymization_required: true,
      auto_archive: true,
    },
    deal_namespace: `deal_${engagementId}`,
    created_at: new Date(row.created_at as string).getTime(),
    updated_at: new Date(row.updated_at as string).getTime(),
    created_by: (row.created_by as string) ?? 'system',
  };
}

/**
 * Map workflow phase to TUI phase name
 */
function mapPhaseToProgress(phase: string): { phase: string; progress: number } {
  const phaseMap: Record<string, { phase: string; progress: number }> = {
    'initializing': { phase: 'hypothesis_generation', progress: 10 },
    'thesis_structuring': { phase: 'hypothesis_generation', progress: 20 },
    'comparables_search': { phase: 'hypothesis_generation', progress: 30 },
    'evidence_gathering': { phase: 'evidence_gathering', progress: 50 },
    'contradiction_analysis': { phase: 'contradiction_detection', progress: 70 },
    'synthesis': { phase: 'report_generation', progress: 85 },
  };
  return phaseMap[phase] ?? { phase: 'status_update', progress: 50 };
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

    // Fetch engagement from database
    const engagement = await fetchEngagement(engagementId);
    if (!engagement) {
      throw new Error(`Engagement ${engagementId} not found`);
    }

    // Build thesis object
    const investmentThesis = {
      summary: thesis,
      key_value_drivers: engagement.investment_thesis?.key_value_drivers ?? [],
      key_risks: engagement.investment_thesis?.key_risks ?? [],
    };

    // Create event handler for progress updates
    const onEvent = (event: EngagementEvent): void => {
      const eventData = event.data as Record<string, unknown>;
      const phase = eventData['phase'] as string | undefined;

      if (phase) {
        const mapped = mapPhaseToProgress(phase);
        void job.updateProgress(mapped.progress);
        void publishProgress(job.id!, 'phase_start', {
          phase: mapped.phase,
          message: eventData['message'] ?? `Processing ${mapped.phase}...`,
          progress: mapped.progress,
        });
      }
    };

    // Execute the proper research workflow
    console.log(`[ResearchWorker] Starting research workflow for ${engagement.name}`);
    const results = await executeResearchWorkflow({
      engagement,
      thesis: investmentThesis,
      config: {
        enableComparablesSearch: true,
        enableContradictionAnalysis: true,
        contradictionIntensity: config.searchDepth === 'thorough' ? 'aggressive' : 'moderate',
        maxEvidencePerHypothesis: config.maxHypotheses ?? 20,
        parallelAgents: true,
        recordMetrics: true,
      },
      onEvent,
    });

    console.log(`[ResearchWorker] Workflow completed for ${engagement.name}`);

    // Calculate confidence score - use overallConfidence from results (0-1 scale, convert to 0-100)
    const rawConfidence = results.overallConfidence * 100;
    const confidenceScore = (typeof rawConfidence === 'number' && !isNaN(rawConfidence))
      ? Math.max(0, Math.min(100, rawConfidence))
      : 50;

    // Update job status to completed
    await pool.query(
      `UPDATE research_jobs
       SET status = $1, completed_at = NOW(), confidence_score = $2, results = $3
       WHERE id = $4`,
      ['completed', confidenceScore, JSON.stringify({
        verdict: confidenceScore > 70 ? 'proceed' : 'review',
        summary: `Research completed with ${confidenceScore.toFixed(1)}% confidence`,
        hypothesisTree: results.hypothesisTree,
        evidence: results.evidence,
        contradictions: results.contradictions,
        comparables: results.comparables,
        riskAssessment: results.riskAssessment,
        recommendations: results.recommendations,
        executionTimeMs: results.executionTimeMs,
      }), job.id]
    );

    await job.updateProgress(100);
    await publishProgress(job.id!, 'completed', {
      status: 'completed',
      message: 'Research job completed successfully',
      progress: 100,
      data: {
        confidence: confidenceScore,
        verdict: confidenceScore > 70 ? 'proceed' : 'review',
        hypothesisCount: results.hypothesisTree.totalHypotheses,
        evidenceCount: results.evidence.totalCount,
        contradictionCount: results.contradictions.totalCount,
      },
    });

    console.log(`[ResearchWorker] Job ${job.id} completed with ${confidenceScore.toFixed(1)}% confidence`);

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
        // Research workflows can take several minutes - extend lock to 10 minutes
        lockDuration: 600000, // 10 minutes
        lockRenewTime: 300000, // Renew lock every 5 minutes
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
