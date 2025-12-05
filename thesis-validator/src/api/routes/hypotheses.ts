/**
 * Hypothesis CRUD Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HypothesisRepository } from '../../repositories/index.js';
import {
  authHook,
  requireEngagementAccess,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { HypothesisTypeSchema, HypothesisStatusSchema, CausalRelationshipSchema } from '../../models/hypothesis.js';

const hypothesisRepo = new HypothesisRepository();

const CreateHypothesisBodySchema = z.object({
  type: HypothesisTypeSchema,
  content: z.string().min(1).max(2000),
  parent_id: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  testability: z.enum(['easy', 'moderate', 'difficult']).optional(),
});

const UpdateHypothesisBodySchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: HypothesisStatusSchema.optional(),
  importance: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  testability: z.enum(['easy', 'moderate', 'difficult']).optional(),
});

const CreateEdgeBodySchema = z.object({
  target_id: z.string().uuid(),
  relationship: CausalRelationshipSchema,
  strength: z.number().min(0).max(1).optional(),
  reasoning: z.string().max(500).optional(),
});

export async function registerHypothesesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authHook);

  /**
   * GET /engagements/:engagementId/hypotheses
   * List all hypotheses for an engagement
   */
  fastify.get(
    '/:engagementId/hypotheses',
    { preHandler: requireEngagementAccess('viewer') },
    async (
      request: FastifyRequest<{ Params: { engagementId: string } }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { hypotheses, edges } = await hypothesisRepo.getTree(engagementId);

      reply.send({
        hypotheses,
        edges,
        count: hypotheses.length,
      });
    }
  );

  /**
   * POST /engagements/:engagementId/hypotheses
   * Create a new hypothesis
   */
  fastify.post(
    '/:engagementId/hypotheses',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: { body: CreateHypothesisBodySchema },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: z.infer<typeof CreateHypothesisBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;
      const body = request.body;

      const hypothesis = await hypothesisRepo.create({
        engagementId,
        parentId: body.parent_id,
        type: body.type,
        content: body.content,
        confidence: body.confidence,
        importance: body.importance,
        testability: body.testability,
        createdBy: user.id,
      });

      reply.status(201).send({ hypothesis });
    }
  );

  /**
   * GET /engagements/:engagementId/hypotheses/:hypothesisId
   * Get a specific hypothesis
   */
  fastify.get(
    '/:engagementId/hypotheses/:hypothesisId',
    { preHandler: requireEngagementAccess('viewer') },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const hypothesis = await hypothesisRepo.getById(hypothesisId);

      if (!hypothesis) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Hypothesis not found',
        });
        return;
      }

      reply.send({ hypothesis });
    }
  );

  /**
   * PATCH /engagements/:engagementId/hypotheses/:hypothesisId
   * Update a hypothesis
   */
  fastify.patch(
    '/:engagementId/hypotheses/:hypothesisId',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: { body: UpdateHypothesisBodySchema },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
        Body: z.infer<typeof UpdateHypothesisBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const body = request.body;

      const hypothesis = await hypothesisRepo.update(hypothesisId, {
        content: body.content,
        confidence: body.confidence,
        status: body.status,
        importance: body.importance,
        testability: body.testability,
      });

      if (!hypothesis) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Hypothesis not found',
        });
        return;
      }

      reply.send({ hypothesis });
    }
  );

  /**
   * DELETE /engagements/:engagementId/hypotheses/:hypothesisId
   * Delete a hypothesis
   */
  fastify.delete(
    '/:engagementId/hypotheses/:hypothesisId',
    { preHandler: requireEngagementAccess('editor') },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const deleted = await hypothesisRepo.delete(hypothesisId);

      if (!deleted) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Hypothesis not found',
        });
        return;
      }

      reply.status(204).send();
    }
  );

  /**
   * POST /engagements/:engagementId/hypotheses/:hypothesisId/edges
   * Create a causal edge from this hypothesis to another
   */
  fastify.post(
    '/:engagementId/hypotheses/:hypothesisId/edges',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: { body: CreateEdgeBodySchema },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
        Body: z.infer<typeof CreateEdgeBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const body = request.body;

      const edge = await hypothesisRepo.addEdge({
        sourceId: hypothesisId,
        targetId: body.target_id,
        relationship: body.relationship,
        strength: body.strength,
        reasoning: body.reasoning,
      });

      reply.status(201).send({ edge });
    }
  );

  /**
   * DELETE /engagements/:engagementId/hypothesis-edges/:edgeId
   * Delete a causal edge
   */
  fastify.delete(
    '/:engagementId/hypothesis-edges/:edgeId',
    { preHandler: requireEngagementAccess('editor') },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; edgeId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { edgeId } = request.params;
      const deleted = await hypothesisRepo.deleteEdge(edgeId);

      if (!deleted) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Edge not found',
        });
        return;
      }

      reply.status(204).send();
    }
  );
}
