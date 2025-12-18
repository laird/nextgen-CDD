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
} from '../../models/index.js';
import {
  authHook,
  requireEngagementAccess,
  initializeEngagementAccess,
  getUserEngagements,
  grantEngagementAccess,
  revokeEngagementAccess,
  getEngagementUsers,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { createDealMemory, DealMemory } from '../../memory/index.js';
import { EngagementRepository, type EngagementDTO } from '../../repositories/index.js';

/**
 * In-memory engagement store for backwards compatibility
 * PostgreSQL is now the primary storage via EngagementRepository
 */
const engagementStore = new Map<string, Engagement>();

/**
 * Engagement repository for PostgreSQL persistence
 */
const engagementRepo = new EngagementRepository();

/**
 * Convert EngagementDTO from repository to API-compatible format
 * Adds `target` alias for frontend compatibility
 */
function dtoToApiEngagement(dto: EngagementDTO): Engagement & { target: { name: string; sector: string; description?: string } } {
  return {
    id: dto.id,
    name: dto.name,
    client_name: 'Unknown Client',
    deal_type: dto.deal_type as 'platform' | 'add_on' | 'growth_equity' | 'buyout' | 'carve_out' | 'recapitalization',
    status: dto.status as 'draft' | 'active' | 'in_review' | 'completed' | 'archived',
    target_company: {
      name: dto.target_company.name,
      sector: dto.target_company.sector as 'technology' | 'healthcare' | 'industrials' | 'consumer' | 'financial_services' | 'energy' | 'real_estate' | 'media' | 'telecommunications' | 'materials' | 'utilities' | 'other',
      description: dto.target_company.description,
    },
    target: {
      name: dto.target_company.name,
      sector: dto.target_company.sector,
      ...(dto.target_company.description ? { description: dto.target_company.description } : {}),
    },
    investment_thesis: dto.thesis ? {
      summary: dto.thesis.statement,
      key_value_drivers: [],
      key_risks: [],
      key_questions: dto.thesis.key_questions ?? [],
    } : undefined,
    thesis: dto.thesis ? {
      statement: dto.thesis.statement,
      submitted_at: dto.thesis.submitted_at,
    } : undefined,
    team: [],
    config: {
      enable_real_time_support: true,
      enable_contradiction_analysis: true,
      enable_comparables_search: true,
      auto_refresh_market_intel: true,
    },
    retention_policy: {
      deal_memory_days: 365,
      allow_institutional_learning: true,
      anonymization_required: true,
      auto_archive: true,
    },
    deal_namespace: `deal_${dto.id}`,
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    created_by: dto.created_by,
  };
}

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

      // Create the engagement (generates ID and timestamps)
      const engagement = createEngagement(createRequest, user.id);

      // Store engagement in memory for backward compatibility
      engagementStore.set(engagement.id, engagement);

      // Persist to PostgreSQL (primary storage)
      try {
        await engagementRepo.create({
          id: engagement.id,
          targetCompanyName: engagement.target_company.name,
          sector: engagement.target_company.sector,
          ...(engagement.target_company.description ? { description: engagement.target_company.description } : {}),
          dealType: engagement.deal_type,
          createdBy: user.id,
          ...(engagement.investment_thesis?.summary ? { thesis: engagement.investment_thesis.summary } : {}),
        });
      } catch (dbError) {
        fastify.log.warn({ err: dbError }, 'Failed to persist engagement to PostgreSQL');
        // Continue - in-memory store is still updated for this session
      }

      // Initialize access control (creator becomes owner)
      initializeEngagementAccess(engagement.id, user.id);

      // Initialize deal memory for this engagement
      await createDealMemory(engagement.id);

      reply.status(201).send({
        engagement: {
          ...engagement,
          target: engagement.target_company,
        },
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
        Querystring: { status?: string; sector?: string; limit?: number; offset?: number };
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { status, sector } = request.query;
      const limit = request.query.limit ?? 20;
      const offset = request.query.offset ?? 0;

      try {
        if (user.role === 'admin') {
          // Admins see all engagements from PostgreSQL
          const { engagements: dbEngagements, total } = await engagementRepo.getAll({
            ...(status ? { status } : {}),
            ...(sector ? { sector } : {}),
            limit,
            offset,
          });

          // Also sync to memory for backward compatibility
          for (const dto of dbEngagements) {
            if (!engagementStore.has(dto.id)) {
              engagementStore.set(dto.id, dtoToApiEngagement(dto));
            }
          }

          reply.send({
            engagements: dbEngagements.map(dtoToApiEngagement),
            total,
            limit,
            offset,
          });
        } else {
          // Non-admins: get IDs they have access to, then fetch from DB
          const engagementIds = getUserEngagements(user.id);

          if (engagementIds.length === 0) {
            reply.send({ engagements: [], total: 0, limit, offset });
            return;
          }

          // Fetch from PostgreSQL
          const dbEngagements = await engagementRepo.getByIds(engagementIds);

          // Apply filters
          let filtered = dbEngagements;
          if (status) {
            filtered = filtered.filter((e) => e.status === status);
          }
          if (sector) {
            filtered = filtered.filter((e) => e.target_company.sector === sector);
          }

          // Apply pagination
          const total = filtered.length;
          const paginated = filtered.slice(offset, offset + limit);

          // Sync to memory for backward compatibility
          for (const dto of paginated) {
            if (!engagementStore.has(dto.id)) {
              engagementStore.set(dto.id, dtoToApiEngagement(dto));
            }
          }

          reply.send({
            engagements: paginated.map(dtoToApiEngagement),
            total,
            limit,
            offset,
          });
        }
      } catch (dbError) {
        // Fallback to in-memory store if DB fails
        fastify.log.warn({ err: dbError }, 'Failed to read engagements from PostgreSQL, using memory');

        let engagementIds: string[];
        if (user.role === 'admin') {
          engagementIds = Array.from(engagementStore.keys());
        } else {
          engagementIds = getUserEngagements(user.id);
        }

        let engagements = engagementIds
          .map((id) => engagementStore.get(id))
          .filter((e): e is Engagement => e !== undefined);

        if (status) {
          engagements = engagements.filter((e) => e.status === status);
        }
        if (sector) {
          engagements = engagements.filter((e) => e.target_company.sector === sector);
        }

        engagements.sort((a, b) => b.updated_at - a.updated_at);
        const total = engagements.length;
        const paginated = engagements.slice(offset, offset + limit);

        reply.send({
          engagements: paginated.map((e) => ({ ...e, target: e.target_company })),
          total,
          limit,
          offset,
        });
      }
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

      // Try memory first, then PostgreSQL
      let engagement = engagementStore.get(engagementId);

      if (!engagement) {
        // Try fetching from PostgreSQL
        try {
          const dto = await engagementRepo.getById(engagementId);
          if (dto) {
            engagement = dtoToApiEngagement(dto);
            // Sync to memory
            engagementStore.set(engagementId, engagement);
          }
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to read engagement from PostgreSQL');
        }
      }

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
        engagement: { ...engagement, target: engagement.target_company },
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

      // Try memory first, then PostgreSQL
      let engagement = engagementStore.get(engagementId);
      if (!engagement) {
        try {
          const dto = await engagementRepo.getById(engagementId);
          if (dto) {
            engagement = dtoToApiEngagement(dto);
          }
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to read engagement from PostgreSQL');
        }
      }

      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Apply updates - merge carefully to maintain type safety
      const updated = {
        ...engagement,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
        ...(updates.target_company !== undefined ? {
          target_company: { ...engagement.target_company, ...updates.target_company }
        } : {}),
        ...(updates.investment_thesis !== undefined ? { investment_thesis: updates.investment_thesis } : {}),
        ...(updates.config !== undefined ? {
          config: { ...engagement.config, ...updates.config }
        } : {}),
        ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        updated_at: Date.now(),
      } as Engagement;

      // Update in memory
      engagementStore.set(engagementId, updated);

      // Persist to PostgreSQL
      try {
        const repoUpdate: Parameters<typeof engagementRepo.update>[1] = {};
        if (updates.target_company?.name) repoUpdate.targetCompanyName = updates.target_company.name;
        if (updates.target_company?.sector) repoUpdate.sector = updates.target_company.sector;
        if (updates.target_company?.description) repoUpdate.description = updates.target_company.description;
        if (updates.status) repoUpdate.status = updates.status;

        await engagementRepo.update(engagementId, repoUpdate);
      } catch (dbError) {
        fastify.log.warn({ err: dbError }, 'Failed to update engagement in PostgreSQL');
      }

      reply.send({
        engagement: { ...updated, target: updated.target_company },
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

      // Try memory first, then PostgreSQL
      let engagement = engagementStore.get(engagementId);
      if (!engagement) {
        try {
          const dto = await engagementRepo.getById(engagementId);
          if (dto) {
            engagement = dtoToApiEngagement(dto);
          }
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to read engagement from PostgreSQL');
        }
      }

      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Update in memory first (soft delete behavior for the store)
      engagement.status = 'archived';
      engagement.updated_at = Date.now();
      engagementStore.set(engagementId, engagement);

      // Persist to PostgreSQL (Soft Delete)
      try {
        await engagementRepo.update(engagementId, { status: 'archived' });
      } catch (dbError) {
        fastify.log.warn({ err: dbError }, 'Failed to archive engagement in PostgreSQL');
      }

      // Cleanup Deal Memory (Vector Store, Graph, etc.)
      try {
        const dealMemory = new DealMemory(engagementId);
        await dealMemory.destroy();
        fastify.log.info({ engagementId }, 'Cleaned up deal memory');
      } catch (memError) {
        fastify.log.error({ err: memError }, 'Failed to cleanup deal memory');
        // We don't fail the request here as the primary action (archiving) succeeded
      }

      reply.send({
        message: 'Engagement archived and memory cleaned up successfully',
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

      // Try memory first, then PostgreSQL
      let engagement = engagementStore.get(engagementId);
      if (!engagement) {
        try {
          const dto = await engagementRepo.getById(engagementId);
          if (dto) {
            engagement = dtoToApiEngagement(dto);
          }
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to read engagement from PostgreSQL');
        }
      }

      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const now = Date.now();

      // Update investment thesis
      engagement.investment_thesis = {
        summary: thesisData.thesis_statement,
        key_value_drivers: thesisData.value_creation_levers ?? [],
        key_risks: [],
        value_creation_levers: thesisData.value_creation_levers ?? [],
      };
      engagement.status = 'active';  // Move to active when thesis is submitted
      engagement.updated_at = now;

      engagementStore.set(engagementId, engagement);

      // Persist thesis to PostgreSQL
      try {
        await engagementRepo.update(engagementId, {
          status: 'active',
          thesis: {
            statement: thesisData.thesis_statement,
            submitted_at: now,
          },
        });
      } catch (dbError) {
        fastify.log.warn({ err: dbError }, 'Failed to update thesis in PostgreSQL');
      }

      reply.send({
        engagement: { ...engagement, target: engagement.target_company },
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
 * Get engagement from store or PostgreSQL (for use by other route handlers)
 * Tries memory first for performance, falls back to PostgreSQL
 */
export async function getEngagement(engagementId: string): Promise<Engagement | undefined> {
  // Try memory first
  let engagement = engagementStore.get(engagementId);
  if (engagement) return engagement;

  // Try PostgreSQL
  try {
    const dto = await engagementRepo.getById(engagementId);
    if (dto) {
      engagement = dtoToApiEngagement(dto);
      engagementStore.set(engagementId, engagement);
      return engagement;
    }
  } catch {
    // Ignore DB errors, return undefined
  }

  return undefined;
}

/**
 * Synchronous version for backward compatibility
 * Only checks memory, not PostgreSQL
 */
export function getEngagementSync(engagementId: string): Engagement | undefined {
  return engagementStore.get(engagementId);
}

/**
 * Update engagement in store and PostgreSQL
 */
export async function updateEngagement(engagementId: string, updates: Partial<Engagement>): Promise<Engagement | undefined> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) return undefined;

  const updated = { ...engagement, ...updates, updated_at: Date.now() };
  engagementStore.set(engagementId, updated);

  // Persist to PostgreSQL
  try {
    const repoUpdate: Parameters<typeof engagementRepo.update>[1] = {};
    if (updates.status) repoUpdate.status = updates.status;
    await engagementRepo.update(engagementId, repoUpdate);
  } catch {
    // Ignore DB errors, memory is already updated
  }

  return updated;
}
