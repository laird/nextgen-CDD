/**
 * Skills Routes
 *
 * REST API endpoints for skill library and comparables search
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  authHook,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { getSkillLibrary, getInstitutionalMemory } from '../../memory/index.js';
import {
  CreateSkillRequestSchema,
  skillTemplates,
  type SkillDefinition,
  type Sector,
} from '../../models/index.js';
import { getEmbeddingService } from '../../tools/index.js';

/**
 * Register skills routes
 */
export async function registerSkillsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authHook);

  /**
   * List all skills
   * GET /skills
   */
  fastify.get(
    '/',
    {
      schema: {
        querystring: z.object({
          category: z.string().optional(),
          query: z.string().optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          category?: string;
          query?: string;
          limit: number;
          offset: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { category, limit, offset } = request.query;
      // Note: query parameter is accepted but not used for now (semantic search would need embeddings)

      const skillLibrary = getSkillLibrary();

      // Build list options, only including category if provided
      const listOptions: Parameters<typeof skillLibrary.list>[0] = {
        limit: limit + offset,
        sort_by: 'usage_count',
      };
      if (category) {
        listOptions.category = category as SkillDefinition['category'];
      }

      const allSkills = await skillLibrary.list(listOptions);

      // Apply pagination
      const total = allSkills.length;
      const paginated = allSkills.slice(offset, offset + limit);

      reply.send({
        skills: paginated.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          version: skill.version,
          success_rate: skill.success_rate,
          usage_count: skill.usage_count,
        })),
        total,
        limit,
        offset,
      });
    }
  );

  /**
   * Get skill by ID
   * GET /skills/:skillId
   */
  fastify.get(
    '/:skillId',
    async (
      request: FastifyRequest<{ Params: { skillId: string } }>,
      reply: FastifyReply
    ) => {
      const { skillId } = request.params;

      const skillLibrary = getSkillLibrary();
      const skill = await skillLibrary.get(skillId);

      if (!skill) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Skill not found',
        });
        return;
      }

      reply.send({ skill });
    }
  );

  /**
   * Create new skill
   * POST /skills
   */
  fastify.post<{ Body: z.infer<typeof CreateSkillRequestSchema> }>(
    '/',
    {
      preHandler: [requireRole('admin', 'manager') as any],
      schema: {
        body: CreateSkillRequestSchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateSkillRequestSchema> }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const skillRequest = request.body;

      const skillLibrary = getSkillLibrary();
      const skill = await skillLibrary.create(skillRequest, user.id);

      reply.status(201).send({
        skill,
        message: 'Skill created successfully',
      });
    }
  );

  /**
   * Execute skill
   * POST /skills/:skillId/execute
   */
  fastify.post(
    '/:skillId/execute',
    {
      schema: {
        body: z.object({
          parameters: z.record(z.any()),
          context: z.object({
            engagement_id: z.string().uuid().optional(),
            hypothesis_id: z.string().uuid().optional(),
            additional_context: z.string().optional(),
          }).optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { skillId: string };
        Body: {
          parameters: Record<string, unknown>;
          context?: {
            engagement_id?: string;
            hypothesis_id?: string;
            additional_context?: string;
          };
        };
      }>,
      reply: FastifyReply
    ) => {
      const { skillId } = request.params;
      const { parameters, context } = request.body;

      const skillLibrary = getSkillLibrary();
      const skill = await skillLibrary.get(skillId);

      if (!skill) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Skill not found',
        });
        return;
      }

      try {
        // execute() takes an ExecuteSkillRequest object
        const result = await skillLibrary.execute({
          skill_id: skillId,
          parameters,
          context,
        });

        reply.send({
          skill_id: skillId,
          success: result.success,
          output: result.output,
          execution_time_ms: result.execution_time_ms,
          metadata: result.metadata,
        });
      } catch (error) {
        reply.status(500).send({
          error: 'Execution Failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Update skill
   * PATCH /skills/:skillId
   */
  fastify.patch<{
    Params: { skillId: string };
    Body: {
      description?: string;
      implementation?: string;
      tags?: string[];
    };
  }>(
    '/:skillId',
    {
      preHandler: [requireRole('admin', 'manager') as any],
      schema: {
        body: z.object({
          description: z.string().optional(),
          implementation: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { skillId: string };
        Body: {
          description?: string;
          implementation?: string;
          tags?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { skillId } = request.params;
      const updates = request.body;

      const skillLibrary = getSkillLibrary();
      const skill = await skillLibrary.get(skillId);

      if (!skill) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Skill not found',
        });
        return;
      }

      const user = (request as AuthenticatedRequest).user;
      // refine() takes updates, refinedBy userId, and changeNotes
      const updated = await skillLibrary.refine(
        skillId,
        updates,
        user.id,
        'Updated via API'
      );

      reply.send({
        skill: updated,
        message: 'Skill updated successfully',
      });
    }
  );

  /**
   * Get skill templates
   * GET /skills/templates
   */
  fastify.get(
    '/templates',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.send({
        templates: Object.entries(skillTemplates).map(([key, template]) => ({
          key,
          ...template,
        })),
      });
    }
  );

  /**
   * Search comparables
   * GET /comparables
   */
  fastify.get(
    '/comparables',
    {
      schema: {
        querystring: z.object({
          query: z.string(),
          sector: z.string().optional(),
          deal_type: z.string().optional(),
          min_relevance: z.coerce.number().min(0).max(1).default(0.5),
          limit: z.coerce.number().min(1).max(50).default(10),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          query: string;
          sector?: string;
          deal_type?: string;
          min_relevance: number;
          limit: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { query, sector, deal_type, min_relevance, limit } = request.query;

      const institutionalMemory = getInstitutionalMemory();
      const embeddingService = getEmbeddingService();

      // Generate embedding for the query
      const queryEmbedding = await embeddingService.embed(query);

      // Search for similar patterns using searchPatterns
      const searchOptions: {
        top_k: number;
        sector?: Sector;
        deal_type?: any;
      } = {
        top_k: limit * 2,
      };
      if (sector) {
        searchOptions.sector = sector as Sector;
      }
      if (deal_type) {
        searchOptions.deal_type = deal_type;
      }
      const searchResults = await institutionalMemory.searchPatterns(queryEmbedding, searchOptions);

      // Filter by relevance and map to comparables format
      const comparables = searchResults
        .filter((result) => result.score >= min_relevance)
        .slice(0, limit)
        .map((result) => ({
          pattern_id: result.id,
          description: result.content ?? '',
          thesis_pattern: result.metadata['thesis_pattern'] as string,
          similarity: result.score,
          outcomes: {
            outcome: result.metadata['outcome'] as string,
            outcome_score: result.metadata['outcome_score'] as number,
          },
          lessons_learned: [],
          sector: result.metadata['sector'] as string,
          deal_type: result.metadata['deal_type'] as string,
        }));

      reply.send({
        comparables,
        count: comparables.length,
        query,
        filters: { sector, deal_type, min_relevance },
      });
    }
  );

  /**
   * Get sector knowledge
   * GET /comparables/sectors/:sector
   */
  fastify.get(
    '/comparables/sectors/:sector',
    async (
      request: FastifyRequest<{ Params: { sector: string } }>,
      reply: FastifyReply
    ) => {
      const { sector } = request.params;

      const institutionalMemory = getInstitutionalMemory();
      const knowledge = await institutionalMemory.getSectorKnowledge(sector as Sector);

      if (!knowledge || knowledge.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Sector knowledge not found',
        });
        return;
      }

      reply.send({ sector, knowledge });
    }
  );

  /**
   * Get methodology suggestions
   * GET /comparables/methodologies
   */
  fastify.get(
    '/comparables/methodologies',
    {
      schema: {
        querystring: z.object({
          task_type: z.string(),
          sector: z.string().optional(),
          limit: z.coerce.number().min(1).max(20).default(5),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          task_type: string;
          sector?: string;
          limit: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { task_type, sector, limit } = request.query;

      const institutionalMemory = getInstitutionalMemory();
      const embeddingService = getEmbeddingService();

      // Generate embedding for the task type
      const taskEmbedding = await embeddingService.embed(task_type);

      // Search for methodology templates
      const methodologyOptions: {
        top_k: number;
        category?: string;
      } = {
        top_k: limit,
      };
      if (sector) {
        methodologyOptions.category = sector;
      }
      const searchResults = await institutionalMemory.searchMethodologies(taskEmbedding, methodologyOptions);

      // Map to methodologies format
      const methodologies = searchResults.map((result) => ({
        id: result.id,
        name: result.metadata['name'] as string,
        description: result.content ?? '',
        category: result.metadata['category'] as string,
        success_rate: result.metadata['success_rate'] as number,
        usage_count: result.metadata['usage_count'] as number,
        average_duration_hours: result.metadata['average_duration_hours'] as number,
        relevance_score: result.score,
      }));

      reply.send({
        methodologies,
        count: methodologies.length,
        task_type,
        sector,
      });
    }
  );
}
