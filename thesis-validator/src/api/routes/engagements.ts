/**
 * Engagement Routes
 *
 * REST API endpoints for engagement management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CreateEngagementRequestSchema,
  UpdateEngagementRequestSchema,
  createEngagement,
  type Engagement,
  type EngagementSummary,
} from '../../models/index.js';
import {
  authHook,
  requireRole,
  requireEngagementAccess,
  initializeEngagementAccess,
  getUserEngagements,
  grantEngagementAccess,
  revokeEngagementAccess,
  getEngagementUsers,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { createDealMemory } from '../../memory/index.js';

/**
 * In-memory engagement store (replace with database in production)
 */
const engagementStore = new Map<string, Engagement>();

/**
 * Register engagement routes
 */
export async function registerEngagementRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authHook);

  /**
   * Create new engagement
   * POST /engagements
   */
  fastify.post(
    '/',
    {
      schema: {
        body: CreateEngagementRequestSchema,
        response: {
          201: z.object({
            engagement: z.any(),
            message: z.string(),
          }),
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateEngagementRequestSchema> }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const createRequest = request.body;

      // Create the engagement
      const engagement = createEngagement(createRequest, user.id);

      // Store engagement
      engagementStore.set(engagement.id, engagement);

      // Initialize access control (creator becomes owner)
      initializeEngagementAccess(engagement.id, user.id);

      // Initialize deal memory for this engagement
      const dealMemory = createDealMemory();
      await dealMemory.initialize(engagement.id);

      reply.status(201).send({
        engagement,
        message: 'Engagement created successfully',
      });
    }
  );

  /**
   * List engagements for current user
   * GET /engagements
   */
  fastify.get(
    '/',
    {
      schema: {
        querystring: z.object({
          status: z.string().optional(),
          sector: z.string().optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; sector?: string; limit: number; offset: number };
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { status, sector, limit, offset } = request.query;

      // Get engagements user has access to
      let engagementIds: string[];

      if (user.role === 'admin') {
        // Admins see all engagements
        engagementIds = Array.from(engagementStore.keys());
      } else {
        engagementIds = getUserEngagements(user.id);
      }

      // Filter and map to summaries
      let engagements = engagementIds
        .map((id) => engagementStore.get(id))
        .filter((e): e is Engagement => e !== undefined);

      // Apply filters
      if (status) {
        engagements = engagements.filter((e) => e.status === status);
      }
      if (sector) {
        engagements = engagements.filter((e) => e.target.sector === sector);
      }

      // Sort by updated_at descending
      engagements.sort((a, b) => b.updated_at - a.updated_at);

      // Apply pagination
      const total = engagements.length;
      const paginated = engagements.slice(offset, offset + limit);

      // Map to summaries
      const summaries: EngagementSummary[] = paginated.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        deal_type: e.deal_type,
        target_name: e.target.name,
        sector: e.target.sector,
        hypothesis_count: 0, // Would be populated from deal memory
        evidence_count: 0,
        created_at: e.created_at,
        updated_at: e.updated_at,
      }));

      reply.send({
        engagements: summaries,
        total,
        limit,
        offset,
      });
    }
  );

  /**
   * Get engagement by ID
   * GET /engagements/:engagementId
   */
  fastify.get(
    '/:engagementId',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{ Params: { engagementId: string } }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const engagement = engagementStore.get(engagementId);

      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Get team members with access
      const teamAccess = getEngagementUsers(engagementId);

      reply.send({
        engagement,
        team: teamAccess,
      });
    }
  );

  /**
   * Update engagement
   * PATCH /engagements/:engagementId
   */
  fastify.patch(
    '/:engagementId',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: UpdateEngagementRequestSchema,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: z.infer<typeof UpdateEngagementRequestSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const updates = request.body;
      const engagement = engagementStore.get(engagementId);

      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Apply updates
      const updated: Engagement = {
        ...engagement,
        ...updates,
        updated_at: Date.now(),
      };

      engagementStore.set(engagementId, updated);

      reply.send({
        engagement: updated,
        message: 'Engagement updated successfully',
      });
    }
  );

  /**
   * Delete engagement (soft delete)
   * DELETE /engagements/:engagementId
   */
  fastify.delete(
    '/:engagementId',
    {
      preHandler: requireEngagementAccess('owner'),
    },
    async (
      request: FastifyRequest<{ Params: { engagementId: string } }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const engagement = engagementStore.get(engagementId);

      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Soft delete by updating status
      engagement.status = 'archived';
      engagement.updated_at = Date.now();
      engagementStore.set(engagementId, engagement);

      reply.send({
        message: 'Engagement archived successfully',
      });
    }
  );

  /**
   * Submit investment thesis
   * POST /engagements/:engagementId/thesis
   */
  fastify.post(
    '/:engagementId/thesis',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          thesis_statement: z.string().min(10),
          key_assumptions: z.array(z.string()).optional(),
          target_returns: z.object({
            irr_target: z.number().optional(),
            multiple_target: z.number().optional(),
            holding_period_years: z.number().optional(),
          }).optional(),
          value_creation_levers: z.array(z.string()).optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: {
          thesis_statement: string;
          key_assumptions?: string[];
          target_returns?: {
            irr_target?: number;
            multiple_target?: number;
            holding_period_years?: number;
          };
          value_creation_levers?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const thesisData = request.body;
      const engagement = engagementStore.get(engagementId);

      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Update thesis
      engagement.thesis = {
        statement: thesisData.thesis_statement,
        key_assumptions: thesisData.key_assumptions ?? [],
        target_returns: thesisData.target_returns ?? {},
        value_creation_levers: thesisData.value_creation_levers ?? [],
        submitted_at: Date.now(),
      };
      engagement.status = 'thesis_submitted';
      engagement.updated_at = Date.now();

      engagementStore.set(engagementId, engagement);

      reply.send({
        engagement,
        message: 'Investment thesis submitted successfully',
      });
    }
  );

  /**
   * Add team member to engagement
   * POST /engagements/:engagementId/team
   */
  fastify.post(
    '/:engagementId/team',
    {
      preHandler: requireEngagementAccess('owner'),
      schema: {
        body: z.object({
          user_id: z.string(),
          access_level: z.enum(['owner', 'editor', 'viewer']),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: { user_id: string; access_level: 'owner' | 'editor' | 'viewer' };
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;
      const { user_id, access_level } = request.body;

      const engagement = engagementStore.get(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      grantEngagementAccess(engagementId, user_id, access_level, user.id);

      reply.send({
        message: 'Team member added successfully',
        team: getEngagementUsers(engagementId),
      });
    }
  );

  /**
   * Remove team member from engagement
   * DELETE /engagements/:engagementId/team/:userId
   */
  fastify.delete(
    '/:engagementId/team/:userId',
    {
      preHandler: requireEngagementAccess('owner'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; userId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, userId } = request.params;

      const engagement = engagementStore.get(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const removed = revokeEngagementAccess(engagementId, userId);

      if (!removed) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'User not found in team',
        });
        return;
      }

      reply.send({
        message: 'Team member removed successfully',
        team: getEngagementUsers(engagementId),
      });
    }
  );
}

/**
 * Get engagement from store (for use by other route handlers)
 */
export function getEngagement(engagementId: string): Engagement | undefined {
  return engagementStore.get(engagementId);
}

/**
 * Update engagement in store
 */
export function updateEngagement(engagementId: string, updates: Partial<Engagement>): Engagement | undefined {
  const engagement = engagementStore.get(engagementId);
  if (!engagement) return undefined;

  const updated = { ...engagement, ...updates, updated_at: Date.now() };
  engagementStore.set(engagementId, updated);
  return updated;
}
