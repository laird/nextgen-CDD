/**
 * Contradiction Routes
 *
 * REST API endpoints for contradiction management and resolution workflow
 * Uses PostgreSQL repositories for persistence
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  authHook,
  requireEngagementAccess,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { ContradictionRepository } from '../../repositories/index.js';
import type {
  ContradictionSeverity,
  ContradictionStatus,
} from '../../repositories/contradiction-repository.js';

// Initialize repository
const contradictionRepo = new ContradictionRepository();

/**
 * Register contradiction routes
 */
export async function registerContradictionRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authHook);

  /**
   * Get contradictions for engagement
   * GET /engagements/:engagementId/contradictions
   */
  fastify.get(
    '/:engagementId/contradictions',
    {
      preHandler: requireEngagementAccess('viewer'),
      schema: {
        querystring: z.object({
          severity: z.enum(['low', 'medium', 'high']).optional(),
          status: z.enum(['unresolved', 'explained', 'dismissed', 'critical']).optional(),
          hypothesis_id: z.string().uuid().optional(),
          limit: z.coerce.number().min(1).max(100).default(50),
          offset: z.coerce.number().min(0).default(0),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Querystring: {
          severity?: ContradictionSeverity;
          status?: ContradictionStatus;
          hypothesis_id?: string;
          limit: number;
          offset: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { severity, status, hypothesis_id, limit, offset } = request.query;

      const contradictions = await contradictionRepo.getByEngagement(engagementId, {
        ...(severity ? { severity } : {}),
        ...(status ? { status } : {}),
        ...(hypothesis_id ? { hypothesisId: hypothesis_id } : {}),
        limit,
        offset,
      });

      reply.send({
        contradictions,
        total: contradictions.length,
        limit,
        offset,
      });
    }
  );

  /**
   * Get single contradiction
   * GET /engagements/:engagementId/contradictions/:contradictionId
   */
  fastify.get(
    '/:engagementId/contradictions/:contradictionId',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; contradictionId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, contradictionId } = request.params;

      const contradiction = await contradictionRepo.getById(contradictionId);
      if (!contradiction || contradiction.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Contradiction not found',
        });
        return;
      }

      reply.send({ contradiction });
    }
  );

  /**
   * Create contradiction manually
   * POST /engagements/:engagementId/contradictions
   */
  fastify.post(
    '/:engagementId/contradictions',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          hypothesisId: z.string().uuid().optional(),
          evidenceId: z.string().uuid().optional(),
          description: z.string().min(10),
          severity: z.enum(['low', 'medium', 'high']),
          bearCaseTheme: z.string().optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: {
          hypothesisId?: string;
          evidenceId?: string;
          description: string;
          severity: ContradictionSeverity;
          bearCaseTheme?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { hypothesisId, evidenceId, description, severity, bearCaseTheme } = request.body;

      const contradiction = await contradictionRepo.create({
        engagementId,
        description,
        severity,
        ...(hypothesisId !== undefined && { hypothesisId }),
        ...(evidenceId !== undefined && { evidenceId }),
        ...(bearCaseTheme !== undefined && { bearCaseTheme }),
      });

      reply.status(201).send({ contradiction });
    }
  );

  /**
   * Update contradiction
   * PATCH /engagements/:engagementId/contradictions/:contradictionId
   */
  fastify.patch(
    '/:engagementId/contradictions/:contradictionId',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          description: z.string().min(10).optional(),
          severity: z.enum(['low', 'medium', 'high']).optional(),
          bearCaseTheme: z.string().optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; contradictionId: string };
        Body: {
          description?: string;
          severity?: ContradictionSeverity;
          bearCaseTheme?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, contradictionId } = request.params;
      const updates = request.body;

      const existing = await contradictionRepo.getById(contradictionId);
      if (!existing || existing.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Contradiction not found',
        });
        return;
      }

      const contradiction = await contradictionRepo.update(contradictionId, updates);
      reply.send({ contradiction });
    }
  );

  /**
   * Resolve contradiction
   * POST /engagements/:engagementId/contradictions/:contradictionId/resolve
   */
  fastify.post(
    '/:engagementId/contradictions/:contradictionId/resolve',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          status: z.enum(['explained', 'dismissed']),
          resolutionNotes: z.string().min(10),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; contradictionId: string };
        Body: {
          status: 'explained' | 'dismissed';
          resolutionNotes: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId, contradictionId } = request.params;
      const { status, resolutionNotes } = request.body;

      const existing = await contradictionRepo.getById(contradictionId);
      if (!existing || existing.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Contradiction not found',
        });
        return;
      }

      if (existing.status !== 'unresolved' && existing.status !== 'critical') {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'Contradiction is already resolved',
        });
        return;
      }

      const contradiction = await contradictionRepo.resolve(
        contradictionId,
        status,
        resolutionNotes,
        user.id
      );

      reply.send({
        contradiction,
        message: `Contradiction marked as ${status}`,
      });
    }
  );

  /**
   * Mark contradiction as critical
   * POST /engagements/:engagementId/contradictions/:contradictionId/critical
   */
  fastify.post(
    '/:engagementId/contradictions/:contradictionId/critical',
    {
      preHandler: requireEngagementAccess('editor'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; contradictionId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, contradictionId } = request.params;

      const existing = await contradictionRepo.getById(contradictionId);
      if (!existing || existing.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Contradiction not found',
        });
        return;
      }

      const contradiction = await contradictionRepo.markCritical(contradictionId);

      reply.send({
        contradiction,
        message: 'Contradiction marked as critical',
      });
    }
  );

  /**
   * Delete contradiction
   * DELETE /engagements/:engagementId/contradictions/:contradictionId
   */
  fastify.delete(
    '/:engagementId/contradictions/:contradictionId',
    {
      preHandler: requireEngagementAccess('editor'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; contradictionId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, contradictionId } = request.params;

      const existing = await contradictionRepo.getById(contradictionId);
      if (!existing || existing.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Contradiction not found',
        });
        return;
      }

      await contradictionRepo.delete(contradictionId);

      reply.send({
        message: 'Contradiction deleted successfully',
      });
    }
  );

  /**
   * Get contradiction statistics
   * GET /engagements/:engagementId/contradictions/stats
   */
  fastify.get(
    '/:engagementId/contradictions/stats',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;

      const stats = await contradictionRepo.getStats(engagementId);

      reply.send({ stats });
    }
  );
}
