/**
 * Stress Test Routes
 *
 * REST API endpoints for stress test management and history
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  authHook,
  requireEngagementAccess,
} from '../middleware/index.js';
import {
  StressTestRepository,
  type StressTestIntensity,
  type StressTestStatus,
} from '../../repositories/index.js';
import { getPool } from '../../db/index.js';
import { executeStressTestWorkflow } from '../../workflows/index.js';
import { getResearchQueue } from '../../services/job-queue.js';

const stressTestRepo = new StressTestRepository();

/**
 * Transform stress test DTO to frontend-expected format
 */
function mapStressTestToResponse(dto: ReturnType<typeof stressTestRepo.getById> extends Promise<infer T> ? NonNullable<T> : never) {
  // Extract metrics from results if available
  const results = dto.results as {
    testedHypotheses?: number;
    overallVulnerability?: number;
    summary?: {
      totalContradictions?: number;
      highSeverityContradictions?: number;
      passed?: number;
      challenged?: number;
      failed?: number;
    };
  } | null;

  return {
    id: dto.id,
    engagementId: dto.engagementId,
    intensity: dto.intensity,
    status: dto.status,
    scenariosRun: results?.testedHypotheses ?? 0,
    vulnerabilitiesFound: results?.summary?.totalContradictions ?? 0,
    overallRiskScore: results?.overallVulnerability != null
      ? Math.round(results.overallVulnerability * 100)
      : null,
    results: dto.results,
    startedAt: dto.startedAt,
    completedAt: dto.completedAt,
    createdAt: dto.createdAt,
  };
}

/**
 * Register stress test routes
 */
export async function registerStressTestRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authHook);

  /**
   * Get stress test history for engagement
   * GET /engagements/:engagementId/stress-tests
   */
  fastify.get(
    '/:engagementId/stress-tests',
    {
      preHandler: requireEngagementAccess('viewer'),
      schema: {
        querystring: z.object({
          status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Querystring: { status?: StressTestStatus; limit: number };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { status, limit } = request.query;

      // Verify engagement exists
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (rows.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const stressTests = await stressTestRepo.getByEngagement(engagementId, {
        ...(status ? { status } : {}),
        limit,
      });

      reply.send({
        stressTests: stressTests.map(mapStressTestToResponse),
        count: stressTests.length,
      });
    }
  );

  /**
   * Get stress test statistics
   * GET /engagements/:engagementId/stress-tests/stats
   */
  fastify.get(
    '/:engagementId/stress-tests/stats',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{ Params: { engagementId: string } }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;

      // Verify engagement exists
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (rows.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const repoStats = await stressTestRepo.getStats(engagementId);

      // Get recent completed stress tests to calculate average risk score
      const recentTests = await stressTestRepo.getByEngagement(engagementId, {
        status: 'completed',
        limit: 20,
      });

      // Calculate average risk score from completed tests
      let averageRiskScore = 0;
      if (recentTests.length > 0) {
        const riskScores = recentTests
          .map((t) => {
            const results = t.results as { overallVulnerability?: number } | null;
            return results?.overallVulnerability;
          })
          .filter((v): v is number => v != null);

        if (riskScores.length > 0) {
          averageRiskScore = Math.round(
            (riskScores.reduce((a, b) => a + b, 0) / riskScores.length) * 100
          );
        }
      }

      // Map to frontend-expected format
      const stats = {
        totalTests: repoStats.totalCount,
        averageRiskScore,
        lastTestAt: repoStats.lastRunAt?.toISOString() ?? null,
        vulnerabilitiesByIntensity: repoStats.byIntensity,
      };

      reply.send({
        engagementId,
        stats,
      });
    }
  );

  /**
   * Get a specific stress test by ID
   * GET /engagements/:engagementId/stress-tests/:stressTestId
   */
  fastify.get(
    '/:engagementId/stress-tests/:stressTestId',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; stressTestId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, stressTestId } = request.params;

      const stressTest = await stressTestRepo.getById(stressTestId);

      if (!stressTest || stressTest.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Stress test not found',
        });
        return;
      }

      reply.send({
        stressTest: mapStressTestToResponse(stressTest),
      });
    }
  );

  /**
   * Start a new stress test (with persistence)
   * POST /engagements/:engagementId/stress-tests
   */
  fastify.post(
    '/:engagementId/stress-tests',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          intensity: z.enum(['light', 'moderate', 'aggressive']).default('moderate'),
          hypothesisIds: z.array(z.string().uuid()).optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: { intensity: StressTestIntensity; hypothesisIds?: string[] };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { intensity, hypothesisIds } = request.body;

      // Verify engagement exists
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (rows.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Create stress test record
      const stressTest = await stressTestRepo.create({
        engagementId,
        intensity,
        ...(hypothesisIds ? { hypothesisIds } : {}),
      });

      // Start stress test asynchronously via Queue
      const queue = getResearchQueue();
      await queue.addJob(stressTest.id, {
        type: 'stress_test',
        engagementId,
        stressTestId: stressTest.id,
        config: { intensity },
        ...(hypothesisIds ? { hypothesisIds } : {}),
      });

      reply.status(202).send({
        message: 'Stress test started',
        stressTest: mapStressTestToResponse(stressTest),
        statusUrl: `/api/v1/engagements/${engagementId}/stress-tests/${stressTest.id}`,
      });
    }
  );

  /**
   * Delete a stress test
   * DELETE /engagements/:engagementId/stress-tests/:stressTestId
   */
  fastify.delete(
    '/:engagementId/stress-tests/:stressTestId',
    {
      preHandler: requireEngagementAccess('editor'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; stressTestId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, stressTestId } = request.params;

      const stressTest = await stressTestRepo.getById(stressTestId);

      if (!stressTest || stressTest.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Stress test not found',
        });
        return;
      }

      // Don't allow deleting running tests
      if (stressTest.status === 'running') {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'Cannot delete a running stress test',
        });
        return;
      }

      await stressTestRepo.delete(stressTestId);

      reply.send({
        message: 'Stress test deleted successfully',
      });
    }
  );
}

/**
 * Execute stress test asynchronously and update repository
 */

