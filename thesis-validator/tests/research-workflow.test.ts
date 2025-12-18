/**
 * Research Workflow Integration Test
 *
 * End-to-end test for the complete research workflow:
 * - REST API endpoints
 * - BullMQ job processing
 * - WebSocket progress streaming
 * - Database persistence
 */

import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../src/api/index.js';
import { getPool, runMigrations } from '../src/db/index.js';
import { getResearchQueue } from '../src/services/job-queue.js';
import { ResearchWorker } from '../src/workers/research-worker.js';
import WebSocket from 'ws';

describe('Research Workflow Integration', () => {
  let server: FastifyInstance;
  let worker: ResearchWorker;
  let testEngagementId: string;
  let authToken: string;

  // Mock ConductorAgent to avoid real LLM calls
  vi.mock('../src/agents/index.js', () => ({
    ConductorAgent: class MockConductorAgent {
      async executeResearchWorkflow() {
        return {
          hypotheses: [
            { statement: 'Hypothesis 1', priority: 5 },
            { statement: 'Hypothesis 2', priority: 4 }
          ],
          evidence: [
            { type: 'supporting', content: 'Evidence 1', confidence: 0.9 },
            { type: 'neutral', content: 'Evidence 2', confidence: 0.5 }
          ],
          contradictions: [],
          confidence: 85,
          needsDeepDive: false
        };
      }
    }
  }));

  beforeAll(async () => {
    // Initialize database
    await runMigrations();

    // Start server on test port
    server = await createServer({
      port: 3001,
      logLevel: 'error', // Reduce noise in tests
    });

    await server.listen({
      host: '0.0.0.0',
      port: 3001,
    });

    // Start worker with concurrency 1 for testing
    worker = new ResearchWorker(1);

    // Create test engagement
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO engagements (
        id, target_company, sector, description, deal_type, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        randomUUID(),
        'Test Corp',
        'Technology',
        'Test company',
        'buyout',
        'active',
        'test-user',
      ]
    );
    testEngagementId = result.rows[0]?.id as string;

    // Create mock auth token (in real system, this would come from auth service)
    authToken = 'test-token-123';
  });

  afterAll(async () => {
    // Clean up test data
    const pool = getPool();
    await pool.query('DELETE FROM engagements WHERE id = $1', [testEngagementId]);

    // Stop worker
    await worker.close();

    // Stop server
    await server.close();

    // Close queue
    const queue = getResearchQueue();
    await queue.close();
  });

  it('should start a research job via API', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/engagements/${testEngagementId}/research`,
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        thesis: 'AI will revolutionize enterprise software over the next 5 years',
        config: {
          maxHypotheses: 3,
          enableDeepDive: false,
          confidenceThreshold: 70,
          searchDepth: 'quick',
        },
      },
    });

    if (response.statusCode !== 202) {
      console.error('API Error:', response.statusCode, response.body);
    }
    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.job_id).toBeDefined();
    expect(body.status).toBe('queued');
  }, 30000);

  it('should retrieve job status', async () => {
    // Start a job first
    const startResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/engagements/${testEngagementId}/research`,
      payload: {
        thesis: 'Cloud computing adoption will accelerate',
        config: {
          maxHypotheses: 2,
          enableDeepDive: false,
        },
      },
    });

    const { job_id } = JSON.parse(startResponse.body);

    // Get job status
    const statusResponse = await server.inject({
      method: 'GET',
      url: `/api/v1/engagements/${testEngagementId}/research/${job_id}`,
    });

    expect(statusResponse.statusCode).toBe(200);
    const statusBody = JSON.parse(statusResponse.body);
    expect(statusBody.id).toBe(job_id);
    expect(['queued', 'running', 'completed', 'failed']).toContain(statusBody.status);
  }, 30000);

  it('should stream progress via WebSocket', async () => {
    return new Promise<void>(async (resolve, reject) => {
      // Start a research job
      const startResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/engagements/${testEngagementId}/research`,
        payload: {
          thesis: 'Electric vehicles will dominate by 2030',
          config: {
            maxHypotheses: 2,
            enableDeepDive: false,
            searchDepth: 'quick',
          },
        },
      });

      const { job_id } = JSON.parse(startResponse.body);

      // Connect to WebSocket
      const ws = new WebSocket(
        `ws://localhost:3001/research/jobs/${job_id}/progress?token=${authToken}`
      );

      const receivedEvents: string[] = [];
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket timeout - no events received'));
      }, 60000); // 60 second timeout

      ws.on('open', () => {
        console.log('[Test] WebSocket connected');
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        console.log('[Test] Received WebSocket message:', message.type);

        if (message.type === 'connected') {
          expect(message.payload.jobId).toBe(job_id);
        } else if (message.type === 'progress') {
          receivedEvents.push(message.payload.type);

          // Check for completion
          if (message.payload.type === 'completed' || message.payload.type === 'error') {
            clearTimeout(timeout);
            ws.close();

            // Verify we received expected events
            expect(receivedEvents.length).toBeGreaterThan(0);
            expect(receivedEvents).toContain('status_update');

            resolve();
          }
        }
      });

      ws.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      ws.on('close', () => {
        console.log('[Test] WebSocket closed');
      });
    });
  }, 120000); // 2 minute timeout for job completion

  it('should persist research results to database', async () => {
    // Start a job
    const startResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/engagements/${testEngagementId}/research`,
      payload: {
        thesis: 'Renewable energy will become cost-competitive',
        config: {
          maxHypotheses: 2,
          enableDeepDive: false,
          searchDepth: 'quick',
        },
      },
    });

    const { job_id } = JSON.parse(startResponse.body);

    // Wait for job to complete (poll status)
    let attempts = 0;
    const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes
    let completed = false;

    while (attempts < maxAttempts && !completed) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

      const statusResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/engagements/${testEngagementId}/research/${job_id}`,
      });

      const statusBody = JSON.parse(statusResponse.body);
      if (statusBody.status === 'completed' || statusBody.status === 'failed') {
        completed = true;
      }
      attempts++;
    }

    expect(completed).toBe(true);

    // Verify database records
    const pool = getPool();

    // Check job record
    const jobResult = await pool.query(
      'SELECT * FROM research_jobs WHERE id = $1',
      [job_id]
    );
    expect(jobResult.rows).toHaveLength(1);
    const job = jobResult.rows[0];
    expect(job?.status).toBe('completed');
    expect(job?.confidence_score).toBeGreaterThan(0);
    expect(job?.results).toBeDefined();

    // Check hypotheses were created
    const hypothesesResult = await pool.query(
      'SELECT * FROM hypotheses WHERE job_id = $1',
      [job_id]
    );
    expect(hypothesesResult.rows.length).toBeGreaterThan(0);

    // Check evidence items were created
    const evidenceResult = await pool.query(
      'SELECT * FROM evidence_items WHERE job_id = $1',
      [job_id]
    );
    expect(evidenceResult.rows.length).toBeGreaterThan(0);
  }, 180000); // 3 minute timeout

  it('should handle invalid thesis gracefully', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/engagements/${testEngagementId}/research`,
      payload: {
        thesis: 'Too short', // Less than minimum length
        config: {},
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it('should handle non-existent engagement', async () => {
    const fakeEngagementId = randomUUID();
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/engagements/${fakeEngagementId}/research`,
      payload: {
        thesis: 'This engagement does not exist',
        config: {},
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
