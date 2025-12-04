# Research Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement core research workflow enabling users to submit investment theses and receive AI-validated results through adaptive multi-agent analysis.

**Architecture:** Job-based system using BullMQ + Redis for async processing, PostgreSQL for structured data, vector memory for cross-deal learning. Conductor orchestrates agents in adaptive workflow with optional deep-dive phases.

**Tech Stack:** BullMQ, Redis, PostgreSQL, Fastify, WebSockets, Tavily (web search), existing agent framework

**Design Document:** `docs/plans/2025-12-04-research-workflow-design.md`

---

## Phase 1: Foundation

### Task 1: Database Schema - Research Tables

**Files:**
- Create: `thesis-validator/migrations/003_research_tables.sql`

**Step 1: Write migration SQL**

Create the migration file with research tables:

```sql
-- Research jobs tracking
CREATE TABLE IF NOT EXISTS research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'partial')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_research_jobs_engagement ON research_jobs(engagement_id);
CREATE INDEX idx_research_jobs_status ON research_jobs(status);
CREATE INDEX idx_research_jobs_created ON research_jobs(created_at DESC);

-- Evidence items from research
CREATE TABLE IF NOT EXISTS evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('supporting', 'contradicting', 'neutral')),
  hypothesis TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  source_type VARCHAR(50),
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_items_engagement ON evidence_items(engagement_id);
CREATE INDEX idx_evidence_items_job ON evidence_items(job_id);
CREATE INDEX idx_evidence_items_type ON evidence_items(type);

-- Hypotheses generated during research
CREATE TABLE IF NOT EXISTS hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  testable BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL CHECK (priority >= 1 AND priority <= 5),
  validation_status VARCHAR(20) NOT NULL CHECK (validation_status IN ('pending', 'validated', 'rejected', 'inconclusive')),
  evidence_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hypotheses_job ON hypotheses(job_id);
CREATE INDEX idx_hypotheses_priority ON hypotheses(priority DESC);

-- Update trigger for research_jobs
CREATE OR REPLACE FUNCTION update_research_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER research_jobs_updated_at
  BEFORE UPDATE ON research_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_research_jobs_updated_at();
```

**Step 2: Run migration**

```bash
cd thesis-validator
# Check if db:migrate script exists
cat package.json | grep db:migrate || echo "Add db:migrate script if needed"

# Run migration
npm run db:migrate
```

Expected: Tables created successfully

**Step 3: Verify tables created**

```bash
# Connect to PostgreSQL and verify
psql $DATABASE_URL -c "\dt research_*"
psql $DATABASE_URL -c "\dt evidence_*"
psql $DATABASE_URL -c "\dt hypotheses"
```

Expected: All three tables listed

**Step 4: Commit**

```bash
git add migrations/003_research_tables.sql
git commit -m "feat(db): add research workflow tables

- research_jobs for job tracking
- evidence_items for findings
- hypotheses for generated hypotheses
- Indexes for query performance"
```

---

### Task 2: Zod Models - Research Types

**Files:**
- Create: `thesis-validator/src/models/research.ts`
- Modify: `thesis-validator/src/models/index.ts`

**Step 1: Create Zod schemas**

Create `thesis-validator/src/models/research.ts`:

```typescript
/**
 * Research Models
 *
 * Zod schemas and types for research workflow
 */

import { z } from 'zod';

/**
 * Research job status
 */
export const ResearchJobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'partial'
]);

export type ResearchJobStatus = z.infer<typeof ResearchJobStatusSchema>;

/**
 * Research configuration
 */
export const ResearchConfigSchema = z.object({
  maxHypotheses: z.number().min(1).max(10).default(5),
  enableDeepDive: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(100).default(70),
  searchDepth: z.enum(['quick', 'standard', 'thorough']).default('standard'),
});

export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

/**
 * Evidence type
 */
export const EvidenceTypeSchema = z.enum(['supporting', 'contradicting', 'neutral']);

export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/**
 * Evidence item
 */
export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  job_id: z.string().uuid(),
  type: EvidenceTypeSchema,
  hypothesis: z.string().min(1),
  content: z.string().min(1),
  source_url: z.string().url().optional(),
  source_type: z.string().optional(),
  confidence: z.number().min(0).max(1),
  created_at: z.number(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * Validation status for hypotheses
 */
export const ValidationStatusSchema = z.enum([
  'pending',
  'validated',
  'rejected',
  'inconclusive'
]);

export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

/**
 * Hypothesis
 */
export const HypothesisSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  statement: z.string().min(1),
  testable: z.boolean(),
  priority: z.number().min(1).max(5),
  validation_status: ValidationStatusSchema,
  evidence_summary: z.string().optional(),
  created_at: z.number(),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

/**
 * Research results summary
 */
export const ResearchResultsSchema = z.object({
  verdict: z.enum(['proceed', 'review', 'reject']),
  summary: z.string(),
  key_findings: z.array(z.string()),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type ResearchResults = z.infer<typeof ResearchResultsSchema>;

/**
 * Research job
 */
export const ResearchJobSchema = z.object({
  id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  status: ResearchJobStatusSchema,
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
  error_message: z.string().optional(),
  config: ResearchConfigSchema,
  results: ResearchResultsSchema.optional(),
  confidence_score: z.number().min(0).max(100).optional(),
  created_at: z.number(),
  updated_at: z.number(),
});

export type ResearchJob = z.infer<typeof ResearchJobSchema>;

/**
 * Request to start research
 */
export const StartResearchRequestSchema = z.object({
  thesis: z.string().min(10).max(2000),
  config: ResearchConfigSchema.partial().optional(),
});

export type StartResearchRequest = z.infer<typeof StartResearchRequestSchema>;

/**
 * Progress event types
 */
export const ProgressEventTypeSchema = z.enum([
  'hypothesis_generated',
  'evidence_found',
  'contradiction_detected',
  'round_complete',
  'job_complete'
]);

export type ProgressEventType = z.infer<typeof ProgressEventTypeSchema>;

/**
 * Progress event
 */
export const ProgressEventSchema = z.object({
  type: ProgressEventTypeSchema,
  jobId: z.string().uuid(),
  timestamp: z.number(),
  data: z.record(z.unknown()),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
```

**Step 2: Update index exports**

Modify `thesis-validator/src/models/index.ts` - add to end of file:

```typescript
export * from './research.js';
```

**Step 3: Verify types compile**

```bash
cd thesis-validator
npm run typecheck
```

Expected: No type errors

**Step 4: Commit**

```bash
git add src/models/research.ts src/models/index.ts
git commit -m "feat(models): add research workflow Zod schemas

- ResearchJob with status tracking
- EvidenceItem and Hypothesis types
- ResearchConfig for configurable depth
- ProgressEvent for real-time updates"
```

---

### Task 3: BullMQ Queue Service

**Files:**
- Create: `thesis-validator/src/services/job-queue.ts`
- Modify: `thesis-validator/package.json` (if bullmq not installed)

**Step 1: Install BullMQ (if needed)**

```bash
cd thesis-validator
npm list bullmq || npm install bullmq
```

**Step 2: Create job queue service**

Create `thesis-validator/src/services/job-queue.ts`:

```typescript
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
```

**Step 3: Verify compiles**

```bash
npm run typecheck
```

Expected: No errors

**Step 4: Test Redis connection (optional)**

```bash
# Verify Redis is running
redis-cli ping
```

Expected: PONG

**Step 5: Commit**

```bash
git add src/services/job-queue.ts
git commit -m "feat(queue): add BullMQ job queue service

- ResearchJobQueue for managing research jobs
- Redis connection with retry logic
- Job status tracking and completion waiting
- Singleton pattern for queue access"
```

---

### Task 4: Research Worker Skeleton

**Files:**
- Create: `thesis-validator/src/workers/research-worker.ts`
- Create: `thesis-validator/src/workers/index.ts`

**Step 1: Create worker skeleton**

Create `thesis-validator/src/workers/research-worker.ts`:

```typescript
/**
 * Research Worker
 *
 * BullMQ worker that processes research jobs
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import type { ResearchJobData } from '../services/job-queue.js';

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
 * Process research job
 */
async function processResearchJob(job: Job<ResearchJobData>): Promise<void> {
  console.log(`[ResearchWorker] Processing job ${job.id} for engagement ${job.data.engagementId}`);

  try {
    // Update job progress
    await job.updateProgress(10);

    // TODO: Execute research workflow
    // For now, just simulate work
    await new Promise(resolve => setTimeout(resolve, 5000));

    await job.updateProgress(100);
    console.log(`[ResearchWorker] Job ${job.id} completed`);
  } catch (error) {
    console.error(`[ResearchWorker] Job ${job.id} failed:`, error);
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
      'research:jobs',
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
```

**Step 2: Create workers index**

Create `thesis-validator/src/workers/index.ts`:

```typescript
/**
 * Workers Exports
 */

export { ResearchWorker } from './research-worker.js';
```

**Step 3: Verify compiles**

```bash
npm run typecheck
```

Expected: No errors

**Step 4: Test worker manually (optional)**

```bash
# Start worker in background
tsx src/workers/research-worker.ts &
WORKER_PID=$!

# Kill after verification
sleep 2
kill $WORKER_PID
```

Expected: "Started, waiting for jobs..." message

**Step 5: Commit**

```bash
git add src/workers/
git commit -m "feat(worker): add research worker skeleton

- ResearchWorker with BullMQ integration
- Job processing placeholder
- Event handlers for completed/failed jobs
- Graceful shutdown handling"
```

---

## Phase 2: Core Workflow

### Task 5: Conductor Adaptive Workflow

**Files:**
- Modify: `thesis-validator/src/agents/conductor.ts`

**Step 1: Read existing conductor**

```bash
cat src/agents/conductor.ts | head -50
```

**Step 2: Add adaptive workflow method**

Add this method to the `ConductorAgent` class in `src/agents/conductor.ts`:

```typescript
/**
 * Execute adaptive research workflow
 */
async executeResearchWorkflow(input: {
  thesis: string;
  config: {
    maxHypotheses?: number;
    enableDeepDive?: boolean;
    confidenceThreshold?: number;
  };
}): Promise<{
  hypotheses: Array<{ statement: string; priority: number }>;
  evidence: Array<{ type: string; content: string; confidence: number }>;
  contradictions: string[];
  confidence: number;
  needsDeepDive: boolean;
}> {
  // Phase 1: Core analysis
  const phase1Result = await this.executePhase1(input.thesis, input.config.maxHypotheses ?? 5);

  // Evaluate if deep dive needed
  const needsDeepDive =
    input.config.enableDeepDive &&
    (phase1Result.confidence < (input.config.confidenceThreshold ?? 70) ||
     phase1Result.contradictions.length > 3);

  if (needsDeepDive) {
    // Phase 2: Deep dive with additional agents
    const phase2Result = await this.executePhase2(phase1Result);
    return { ...phase2Result, needsDeepDive: true };
  }

  return { ...phase1Result, needsDeepDive: false };
}

/**
 * Execute Phase 1: Core analysis
 */
private async executePhase1(
  thesis: string,
  maxHypotheses: number
): Promise<{
  hypotheses: Array<{ statement: string; priority: number }>;
  evidence: Array<{ type: string; content: string; confidence: number }>;
  contradictions: string[];
  confidence: number;
}> {
  // Step 1: Generate hypotheses
  const hypotheses = await this.generateHypotheses(thesis, maxHypotheses);

  // Step 2: Gather evidence
  const evidence = await this.gatherEvidence(hypotheses);

  // Step 3: Hunt contradictions
  const contradictions = await this.huntContradictions(evidence);

  // Calculate confidence
  const supportingRatio = evidence.filter(e => e.type === 'supporting').length / evidence.length;
  const confidence = supportingRatio * 100 * (1 - contradictions.length * 0.1);

  return {
    hypotheses,
    evidence,
    contradictions,
    confidence: Math.max(0, Math.min(100, confidence)),
  };
}

/**
 * Execute Phase 2: Deep dive
 */
private async executePhase2(phase1Result: {
  hypotheses: Array<{ statement: string; priority: number }>;
  evidence: Array<{ type: string; content: string; confidence: number }>;
  contradictions: string[];
  confidence: number;
}): Promise<{
  hypotheses: Array<{ statement: string; priority: number }>;
  evidence: Array<{ type: string; content: string; confidence: number }>;
  contradictions: string[];
  confidence: number;
}> {
  // TODO: Implement comparables finder and expert synthesizer
  // For now, just return phase 1 results with slight confidence boost
  return {
    ...phase1Result,
    confidence: Math.min(100, phase1Result.confidence + 10),
  };
}

/**
 * Generate hypotheses from thesis
 */
private async generateHypotheses(
  thesis: string,
  maxCount: number
): Promise<Array<{ statement: string; priority: number }>> {
  // TODO: Call HypothesisBuilder agent
  // For now, return mock hypotheses
  return [
    { statement: `Market assumption: ${thesis}`, priority: 5 },
    { statement: 'Financial viability needs validation', priority: 4 },
    { statement: 'Competitive positioning unclear', priority: 3 },
  ].slice(0, maxCount);
}

/**
 * Gather evidence for hypotheses
 */
private async gatherEvidence(
  hypotheses: Array<{ statement: string; priority: number }>
): Promise<Array<{ type: string; content: string; confidence: number }>> {
  // TODO: Call EvidenceGatherer agent
  // For now, return mock evidence
  return hypotheses.flatMap((h) => [
    {
      type: 'supporting',
      content: `Evidence supports: ${h.statement}`,
      confidence: 0.7,
    },
    {
      type: 'contradicting',
      content: `Counter-evidence for: ${h.statement}`,
      confidence: 0.5,
    },
  ]);
}

/**
 * Hunt contradictions in evidence
 */
private async huntContradictions(
  evidence: Array<{ type: string; content: string; confidence: number }>
): Promise<string[]> {
  // TODO: Call ContradictionHunter agent
  // For now, return mock contradictions
  const contradictingEvidence = evidence.filter(e => e.type === 'contradicting');
  return contradictingEvidence.map(e => `Contradiction found: ${e.content}`);
}
```

**Step 3: Verify compiles**

```bash
npm run typecheck
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/agents/conductor.ts
git commit -m "feat(conductor): add adaptive workflow methods

- executeResearchWorkflow with 2-phase approach
- Phase 1: hypotheses, evidence, contradictions
- Phase 2: deep dive when confidence low
- Placeholder agent calls (to be implemented)"
```

---

### Task 6: Wire Conductor to Worker

**Files:**
- Modify: `thesis-validator/src/workers/research-worker.ts`
- Modify: `thesis-validator/src/workers/research-worker.ts` (add database updates)

**Step 1: Add conductor integration**

In `src/workers/research-worker.ts`, replace the `processResearchJob` function:

```typescript
import { ConductorAgent } from '../agents/index.js';
import { getPool } from '../db/index.js';

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

    // Initialize conductor
    const conductor = new ConductorAgent({
      llmProvider: process.env['LLM_PROVIDER'] ?? 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });

    await job.updateProgress(20);

    // Execute research workflow
    const results = await conductor.executeResearchWorkflow({
      thesis,
      config: {
        maxHypotheses: config.maxHypotheses ?? 5,
        enableDeepDive: config.enableDeepDive ?? true,
        confidenceThreshold: config.confidenceThreshold ?? 70,
      },
    });

    await job.updateProgress(80);

    // Store results in database
    await storeResearchResults(pool, job.id!, engagementId, results);

    await job.updateProgress(90);

    // Update job status to completed
    await pool.query(
      `UPDATE research_jobs
       SET status = $1, completed_at = NOW(), confidence_score = $2, results = $3
       WHERE id = $4`,
      ['completed', results.confidence, JSON.stringify({
        verdict: results.confidence > 70 ? 'proceed' : 'review',
        summary: `Research completed with ${results.confidence}% confidence`,
        key_findings: results.hypotheses.map(h => h.statement),
        risks: results.contradictions,
        opportunities: [],
        recommendations: results.needsDeepDive ? ['Deep dive was performed'] : [],
      }), job.id]
    );

    await job.updateProgress(100);
    console.log(`[ResearchWorker] Job ${job.id} completed with ${results.confidence}% confidence`);

  } catch (error) {
    console.error(`[ResearchWorker] Job ${job.id} failed:`, error);

    // Update job status to failed
    await pool.query(
      'UPDATE research_jobs SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
      ['failed', error instanceof Error ? error.message : 'Unknown error', job.id]
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
```

**Step 2: Add database pool import**

Check if database connection exists:

```bash
ls src/db/index.ts || echo "Need to create database connection module"
```

If doesn't exist, create simple one in `src/db/index.ts`:

```typescript
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
    });
  }
  return pool;
}
```

**Step 3: Verify compiles**

```bash
npm run typecheck
```

Expected: No errors (or may need to install pg: `npm install pg @types/pg`)

**Step 4: Commit**

```bash
git add src/workers/research-worker.ts src/db/
git commit -m "feat(worker): integrate conductor with database

- Call conductor.executeResearchWorkflow
- Update research_jobs status (running -> completed/failed)
- Store hypotheses and evidence in database
- Progress tracking throughout execution"
```

---

## Phase 3: API & Streaming

### Task 7: Research REST Endpoints

**Files:**
- Create: `thesis-validator/src/api/routes/research.ts`
- Modify: `thesis-validator/src/api/server.ts`

**Step 1: Create research routes**

Create `thesis-validator/src/api/routes/research.ts`:

```typescript
/**
 * Research Routes
 *
 * REST API endpoints for research workflow
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  StartResearchRequestSchema,
  ResearchJobSchema,
  type StartResearchRequest,
} from '../../models/index.js';
import { authHook, type AuthenticatedRequest } from '../middleware/index.js';
import { getResearchQueue } from '../../services/job-queue.js';
import { getPool } from '../../db/index.js';

/**
 * Register research routes
 */
export async function registerResearchRoutes(fastify: FastifyInstance): Promise<void> {
  const pool = getPool();
  const queue = getResearchQueue();

  /**
   * Start research for engagement
   * POST /engagements/:id/research/start
   */
  fastify.post(
    '/:id/research/start',
    {
      preHandler: authHook,
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: StartResearchRequestSchema,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: StartResearchRequest;
      }>,
      reply: FastifyReply
    ) => {
      const { id: engagementId } = request.params;
      const { thesis, config } = request.body;
      const user = (request as AuthenticatedRequest).user;

      // Verify engagement exists and user has access
      const engagementResult = await pool.query(
        'SELECT id, name FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (engagementResult.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
      }

      // Update engagement with thesis
      await pool.query(
        `UPDATE engagements
         SET thesis = jsonb_build_object('statement', $1, 'submitted_at', extract(epoch from now()) * 1000)
         WHERE id = $2`,
        [thesis, engagementId]
      );

      // Create research job
      const jobId = uuidv4();
      await pool.query(
        `INSERT INTO research_jobs (id, engagement_id, status, config)
         VALUES ($1, $2, $3, $4)`,
        [jobId, engagementId, 'queued', JSON.stringify(config ?? {})]
      );

      // Add to queue
      await queue.addJob(jobId, {
        engagementId,
        thesis,
        config: config ?? {},
      });

      return reply.status(201).send({
        jobId,
        message: 'Research job started',
      });
    }
  );

  /**
   * Get research job status
   * GET /engagements/:id/research/jobs/:jobId
   */
  fastify.get(
    '/:id/research/jobs/:jobId',
    {
      preHandler: authHook,
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            jobId: { type: 'string', format: 'uuid' },
          },
          required: ['id', 'jobId'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string; jobId: string } }>,
      reply: FastifyReply
    ) => {
      const { id: engagementId, jobId } = request.params;

      // Get job from database
      const result = await pool.query(
        `SELECT
          id, engagement_id, status, started_at, completed_at,
          error_message, config, results, confidence_score,
          extract(epoch from created_at) * 1000 as created_at,
          extract(epoch from updated_at) * 1000 as updated_at
         FROM research_jobs
         WHERE id = $1 AND engagement_id = $2`,
        [jobId, engagementId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Research job not found',
        });
      }

      const job = result.rows[0];

      return reply.send({
        job: {
          id: job.id,
          engagement_id: job.engagement_id,
          status: job.status,
          started_at: job.started_at ? new Date(job.started_at).getTime() : undefined,
          completed_at: job.completed_at ? new Date(job.completed_at).getTime() : undefined,
          error_message: job.error_message,
          config: job.config,
          results: job.results,
          confidence_score: job.confidence_score,
          created_at: job.created_at,
          updated_at: job.updated_at,
        },
      });
    }
  );

  /**
   * List research jobs for engagement
   * GET /engagements/:id/research/jobs
   */
  fastify.get(
    '/:id/research/jobs',
    {
      preHandler: authHook,
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id: engagementId } = request.params;

      const result = await pool.query(
        `SELECT
          id, engagement_id, status, started_at, completed_at,
          error_message, confidence_score,
          extract(epoch from created_at) * 1000 as created_at,
          extract(epoch from updated_at) * 1000 as updated_at
         FROM research_jobs
         WHERE engagement_id = $1
         ORDER BY created_at DESC`,
        [engagementId]
      );

      return reply.send({
        jobs: result.rows.map(job => ({
          id: job.id,
          engagement_id: job.engagement_id,
          status: job.status,
          started_at: job.started_at ? new Date(job.started_at).getTime() : undefined,
          completed_at: job.completed_at ? new Date(job.completed_at).getTime() : undefined,
          error_message: job.error_message,
          confidence_score: job.confidence_score,
          created_at: job.created_at,
          updated_at: job.updated_at,
        })),
      });
    }
  );
}
```

**Step 2: Register routes in server**

Modify `thesis-validator/src/api/server.ts` to add research routes. Find where engagements are registered and add:

```typescript
import { registerResearchRoutes } from './routes/research.js';

// ... in the route registration section:
await fastify.register(registerResearchRoutes, { prefix: '/api/v1/engagements' });
```

**Step 3: Verify compiles**

```bash
npm run typecheck
```

**Step 4: Test with curl (manual)**

```bash
# Generate token
node scripts/generate-dev-token.mjs

# Start research (replace TOKEN and ENGAGEMENT_ID)
curl -X POST http://localhost:3000/api/v1/engagements/<ENGAGEMENT_ID>/research/start \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"thesis": "SaaS companies in healthcare will grow 40% YoY"}'
```

Expected: HTTP 201 with jobId

**Step 5: Commit**

```bash
git add src/api/routes/research.ts src/api/server.ts
git commit -m "feat(api): add research REST endpoints

- POST /engagements/:id/research/start
- GET /engagements/:id/research/jobs/:jobId
- GET /engagements/:id/research/jobs
- Database integration for job tracking"
```

---

### Task 8: WebSocket Progress Streaming

**Files:**
- Create: `thesis-validator/src/api/websocket/research-stream.ts`
- Modify: `thesis-validator/src/api/server.ts`
- Modify: `thesis-validator/src/workers/research-worker.ts`

**Step 1: Install WebSocket dependencies**

```bash
cd thesis-validator
npm list @fastify/websocket || npm install @fastify/websocket
```

**Step 2: Create WebSocket handler**

Create `thesis-validator/src/api/websocket/research-stream.ts`:

```typescript
/**
 * Research Progress WebSocket
 *
 * Real-time progress updates for research jobs
 */

import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import Redis from 'ioredis';

const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];

/**
 * Create Redis subscriber
 */
function createRedisSubscriber(): Redis {
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
  });
}

/**
 * Register research stream WebSocket
 */
export async function registerResearchStream(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/research/:jobId/stream',
    { websocket: true },
    (connection: SocketStream, request) => {
      const { jobId } = request.params as { jobId: string };
      const subscriber = createRedisSubscriber();

      console.log(`[WebSocket] Client connected to job ${jobId}`);

      // Subscribe to job progress channel
      const channel = `research:progress:${jobId}`;
      subscriber.subscribe(channel);

      // Forward messages to WebSocket
      subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          connection.socket.send(message);
        }
      });

      // Handle disconnect
      connection.socket.on('close', () => {
        console.log(`[WebSocket] Client disconnected from job ${jobId}`);
        subscriber.unsubscribe(channel);
        subscriber.quit();
      });

      // Send initial connection message
      connection.socket.send(JSON.stringify({
        type: 'connected',
        jobId,
        timestamp: Date.now(),
      }));
    }
  );
}
```

**Step 3: Register WebSocket in server**

Modify `thesis-validator/src/api/server.ts`:

```typescript
import websocket from '@fastify/websocket';
import { registerResearchStream } from './websocket/research-stream.js';

// ... in server creation:
await fastify.register(websocket);

// ... in route registration:
await fastify.register(registerResearchStream, { prefix: '/api/v1' });
```

**Step 4: Add progress publishing to worker**

Modify `thesis-validator/src/workers/research-worker.ts`, add at top:

```typescript
import Redis from 'ioredis';

const publisher = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
});

/**
 * Publish progress event
 */
async function publishProgress(jobId: string, event: {
  type: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const channel = `research:progress:${jobId}`;
  await publisher.publish(channel, JSON.stringify({
    type: event.type,
    jobId,
    timestamp: Date.now(),
    data: event.data,
  }));
}
```

Then in `processResearchJob`, add progress events:

```typescript
// After each phase
await publishProgress(job.id!, {
  type: 'phase_complete',
  data: { phase: 1, message: 'Core analysis complete' },
});
```

**Step 5: Verify compiles**

```bash
npm run typecheck
```

**Step 6: Commit**

```bash
git add src/api/websocket/ src/api/server.ts src/workers/research-worker.ts
git commit -m "feat(websocket): add real-time research progress streaming

- WebSocket endpoint /research/:jobId/stream
- Redis pub/sub for progress events
- Worker publishes progress to Redis channel
- Clients receive real-time updates"
```

---

## Phase 4: Testing & Verification

### Task 9: Integration Test

**Files:**
- Create: `thesis-validator/tests/integration/research-workflow.test.ts`

**Step 1: Create integration test**

Create `thesis-validator/tests/integration/research-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getResearchQueue } from '../../src/services/job-queue.js';
import { ResearchWorker } from '../../src/workers/research-worker.js';
import { getPool } from '../../src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('Research Workflow Integration', () => {
  let worker: ResearchWorker;
  let queue: ReturnType<typeof getResearchQueue>;
  const pool = getPool();

  beforeAll(async () => {
    queue = getResearchQueue();
    worker = new ResearchWorker(1);
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
  });

  it('should process research job end-to-end', async () => {
    // Create test engagement
    const engagementId = uuidv4();
    await pool.query(
      `INSERT INTO engagements (id, name, target, deal_type, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        engagementId,
        'Test Deal',
        JSON.stringify({ name: 'TestCo', sector: 'Software' }),
        'buyout',
        'pending',
        'test-user',
      ]
    );

    // Create research job
    const jobId = uuidv4();
    await pool.query(
      `INSERT INTO research_jobs (id, engagement_id, status, config)
       VALUES ($1, $2, $3, $4)`,
      [jobId, engagementId, 'queued', JSON.stringify({})]
    );

    // Add to queue
    await queue.addJob(jobId, {
      engagementId,
      thesis: 'SaaS companies will grow 40% YoY',
      config: {},
    });

    // Wait for completion (timeout 30s)
    await queue.waitForCompletion(jobId, 30000);

    // Verify job completed
    const jobResult = await pool.query(
      'SELECT status, confidence_score, results FROM research_jobs WHERE id = $1',
      [jobId]
    );

    expect(jobResult.rows[0]?.status).toBe('completed');
    expect(jobResult.rows[0]?.confidence_score).toBeGreaterThan(0);
    expect(jobResult.rows[0]?.results).toBeDefined();

    // Verify hypotheses created
    const hypothesesResult = await pool.query(
      'SELECT COUNT(*) as count FROM hypotheses WHERE job_id = $1',
      [jobId]
    );

    expect(parseInt(hypothesesResult.rows[0]?.count ?? '0')).toBeGreaterThan(0);

    // Cleanup
    await pool.query('DELETE FROM research_jobs WHERE id = $1', [jobId]);
    await pool.query('DELETE FROM engagements WHERE id = $1', [engagementId]);
  }, 35000); // 35s timeout for test
});
```

**Step 2: Run integration test**

```bash
# Make sure Redis, PostgreSQL, and backend are running
npm test tests/integration/research-workflow.test.ts
```

Expected: Test passes

**Step 3: Commit**

```bash
git add tests/integration/research-workflow.test.ts
git commit -m "test: add research workflow integration test

- End-to-end test from job creation to completion
- Verifies database updates
- Tests hypotheses and evidence storage
- 30s timeout for async processing"
```

---

### Task 10: Manual E2E Verification

**Files:**
- None (manual testing)

**Step 1: Start all services**

```bash
# Terminal 1: Start backend
cd thesis-validator
npm run dev

# Terminal 2: Start worker
cd thesis-validator
tsx src/workers/research-worker.ts

# Terminal 3: Start TUI
cd tui-client
export AUTH_TOKEN="<your-token>"
npm run dev
```

**Step 2: Create engagement via TUI or API**

```bash
# Via API
TOKEN="<your-token>"
curl -X POST http://localhost:3000/api/v1/engagements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Research Deal",
    "target": {"name": "TechCo", "sector": "Software"},
    "deal_type": "buyout"
  }'
```

Save the engagement ID from response.

**Step 3: Start research**

```bash
ENGAGEMENT_ID="<from-step-2>"
curl -X POST http://localhost:3000/api/v1/engagements/$ENGAGEMENT_ID/research/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "thesis": "This SaaS company will achieve 40% YoY growth based on strong product-market fit and expanding TAM",
    "config": {
      "maxHypotheses": 5,
      "enableDeepDive": true,
      "confidenceThreshold": 70
    }
  }'
```

Save the jobId from response.

**Step 4: Monitor progress**

```bash
JOB_ID="<from-step-3>"

# Poll status
watch -n 2 "curl -s http://localhost:3000/api/v1/engagements/$ENGAGEMENT_ID/research/jobs/$JOB_ID \
  -H 'Authorization: Bearer $TOKEN' | jq '.job.status'"
```

Wait for status to change: queued → running → completed

**Step 5: View results**

```bash
curl -s http://localhost:3000/api/v1/engagements/$ENGAGEMENT_ID/research/jobs/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.job.results'
```

Expected: JSON with verdict, summary, key_findings, etc.

**Step 6: Verify in database**

```bash
psql $DATABASE_URL -c "SELECT id, status, confidence_score FROM research_jobs WHERE id = '$JOB_ID';"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM hypotheses WHERE job_id = '$JOB_ID';"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM evidence_items WHERE job_id = '$JOB_ID';"
```

Expected: Job completed, hypotheses and evidence created

**Step 7: Document results**

Create verification note:

```bash
echo "Manual E2E Test - $(date)
Engagement: $ENGAGEMENT_ID
Job: $JOB_ID
Status: $(curl -s http://localhost:3000/api/v1/engagements/$ENGAGEMENT_ID/research/jobs/$JOB_ID -H \"Authorization: Bearer $TOKEN\" | jq -r '.job.status')
Confidence: $(curl -s http://localhost:3000/api/v1/engagements/$ENGAGEMENT_ID/research/jobs/$JOB_ID -H \"Authorization: Bearer $TOKEN\" | jq -r '.job.confidence_score')
" > docs/verification-$(date +%Y%m%d).txt
```

**Step 8: Commit verification**

```bash
git add docs/verification-*.txt
git commit -m "docs: add manual E2E verification results

- Tested full flow: engagement → research → results
- Verified database updates
- Confirmed API endpoints working
- Worker processing successfully"
```

---

## Success Criteria Checklist

Verify all criteria from design document:

- [ ] **Functionality**: User can submit thesis, receive job ID, and get validated results
- [ ] **Quality**: Results contain hypotheses, evidence, confidence score, verdict
- [ ] **Reliability**: Jobs complete successfully or fail with clear error messages
- [ ] **Performance**: Most jobs complete in reasonable time (<30 min for MVP)
- [ ] **Scalability**: System can handle multiple concurrent jobs
- [ ] **Observability**: Status polling works, database tracks all data

## Next Steps After MVP

Once this plan is complete, consider:

1. **Implement real agent calls** - Replace mock methods in conductor with actual HypothesisBuilder, EvidenceGatherer, ContradictionHunter
2. **Add Tavily integration** - Real web search in EvidenceGatherer
3. **Vector memory integration** - Store embeddings, enable comparables finding
4. **Phase 2 agents** - Implement ComparablesFinder and ExpertSynthesizer
5. **TUI integration** - Add research tab to TUI showing job status
6. **Error handling polish** - Better error messages, partial result handling
7. **Performance optimization** - Parallel evidence gathering, caching

## Notes for Engineer

- **Database**: Ensure PostgreSQL is running and `DATABASE_URL` is set
- **Redis**: Must be running for BullMQ and WebSocket pub/sub
- **LLM API Keys**: Set `ANTHROPIC_API_KEY` or configure Vertex AI
- **Testing**: Run worker in separate terminal during development
- **Debugging**: Check worker logs, database, and Redis for issues
- **Commits**: Commit after each task as shown above
