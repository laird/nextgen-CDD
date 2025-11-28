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
  ExecuteSkillRequestSchema,
  skillTemplates,
  type SkillDefinition,
  type SkillSearchResult,
} from '../../models/index.js';

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
      const { category, query, limit, offset } = request.query;

      const skillLibrary = getSkillLibrary();

      let skills: SkillSearchResult[];

      if (query) {
        // Semantic search
        skills = await skillLibrary.searchSkills(query, limit + offset);
      } else {
        // List all (would need a listAll method in production)
        skills = await skillLibrary.searchSkills('', limit + offset);
      }

      // Filter by category if specified
      if (category) {
        skills = skills.filter((s) => s.skill.category === category);
      }

      // Apply pagination
      const total = skills.length;
      const paginated = skills.slice(offset, offset + limit);

      reply.send({
        skills: paginated.map((s) => ({
          id: s.skill.id,
          name: s.skill.name,
          description: s.skill.description,
          category: s.skill.category,
          version: s.skill.version,
          success_rate: s.skill.success_rate,
          usage_count: s.skill.usage_count,
          similarity_score: s.similarity_score,
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
      const skill = await skillLibrary.getSkill(skillId);

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
  fastify.post(
    '/',
    {
      preHandler: requireRole('admin', 'manager'),
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
      const skill = await skillLibrary.registerSkill(skillRequest, user.id);

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
      const skill = await skillLibrary.getSkill(skillId);

      if (!skill) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Skill not found',
        });
        return;
      }

      try {
        const result = await skillLibrary.executeSkill(skillId, parameters, context);

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
  fastify.patch(
    '/:skillId',
    {
      preHandler: requireRole('admin', 'manager'),
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
      const skill = await skillLibrary.getSkill(skillId);

      if (!skill) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Skill not found',
        });
        return;
      }

      const updated = await skillLibrary.updateSkill(skillId, updates);

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

      // Search for similar patterns
      const patterns = await institutionalMemory.findSimilarPatterns(query, limit * 2);

      // Filter and map to comparables format
      const comparables = patterns
        .filter((p) => p.similarity >= min_relevance)
        .filter((p) => !sector || p.pattern.metadata?.sector === sector)
        .filter((p) => !deal_type || p.pattern.metadata?.deal_type === deal_type)
        .slice(0, limit)
        .map((p) => ({
          pattern_id: p.pattern.id,
          description: p.pattern.description,
          thesis_pattern: p.pattern.thesis_pattern,
          similarity: p.similarity,
          outcomes: p.pattern.outcomes,
          lessons_learned: p.pattern.lessons_learned,
          sector: p.pattern.metadata?.sector,
          deal_type: p.pattern.metadata?.deal_type,
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
      const knowledge = await institutionalMemory.getSectorKnowledge(sector);

      if (!knowledge) {
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
      const methodologies = await institutionalMemory.getMethodologySuggestions(
        task_type,
        sector,
        limit
      );

      reply.send({
        methodologies,
        count: methodologies.length,
        task_type,
        sector,
      });
    }
  );
}
