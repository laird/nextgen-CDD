/**
 * Research Routes (BullMQ Integration)
 *
 * REST API endpoints for research workflow with job queue
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  StartResearchRequestSchema,
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
