/**
 * Skill Library - Reusable analytical patterns
 *
 * Collection of parameterized analytical skills that can be:
 * - Searched semantically by task description
 * - Executed with specific parameters
 * - Refined based on usage feedback
 * - Versioned for reproducibility
 */

import type {
  SkillDefinition,
  SkillCategory,
  CreateSkillRequest,
  ExecuteSkillRequest,
  SkillExecutionResult,
  SkillParameter,
} from '../models/index.js';
import { createSkillDefinition, updateSkillMetrics, skillTemplates } from '../models/index.js';
import type { RuvectorClient, SearchResult } from './ruvector-client.js';
import { getRuvectorClient } from './ruvector-client.js';

/**
 * Skill version entry
 */
export interface SkillVersion {
  version: string;
  implementation: string;
  parameters: SkillParameter[];
  created_at: number;
  created_by: string;
  change_notes: string;
}

/**
 * Skill execution context
 */
export interface SkillExecutionContext {
  engagement_id?: string;
  hypothesis_id?: string;
  additional_context?: string;
  timeout_ms?: number;
  model?: string;
}

/**
 * Skill execution callback
 */
export type SkillExecutor = (
  implementation: string,
  parameters: Record<string, unknown>,
  context: SkillExecutionContext
) => Promise<SkillExecutionResult>;

/**
 * Skill Library Manager
 */
export class SkillLibrary {
  private client: RuvectorClient;
  private namespace = 'skills_library';
  private skillCache = new Map<string, SkillDefinition>();
  private versionHistory = new Map<string, SkillVersion[]>();
  private executor: SkillExecutor | null = null;

  constructor(client?: RuvectorClient) {
    this.client = client ?? getRuvectorClient();
  }

  /**
   * Initialize the skill library
   */
  async initialize(): Promise<void> {
    await this.client.createNamespace(this.namespace);
  }

  /**
   * Set the skill executor (typically an LLM-based executor)
   */
  setExecutor(executor: SkillExecutor): void {
    this.executor = executor;
  }

  /**
   * Create a new skill
   */
  async create(
    request: CreateSkillRequest,
    createdBy: string,
    embedding?: Float32Array
  ): Promise<SkillDefinition> {
    const skill = createSkillDefinition(request, createdBy);

    await this.client.insert(this.namespace, {
      id: skill.id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        name: skill.name,
        description: skill.description,
        category: skill.category,
        version: skill.version,
        success_rate: skill.success_rate,
        usage_count: skill.usage_count,
        created_at: skill.created_at,
        created_by: skill.created_by,
        tags: skill.tags,
      },
      content: `${skill.name}: ${skill.description}\n\nImplementation:\n${skill.implementation}`,
    });

    this.skillCache.set(skill.id, skill);
    console.log(`[SkillLibrary] Added skill to cache: ${skill.name}, cache size: ${this.skillCache.size}`);

    // Store initial version
    this.versionHistory.set(skill.id, [{
      version: skill.version,
      implementation: skill.implementation,
      parameters: skill.parameters,
      created_at: skill.created_at,
      created_by: skill.created_by,
      change_notes: 'Initial version',
    }]);

    if (embedding !== undefined) {
      return { ...skill, embedding: new Float32Array(embedding) };
    }
    return skill;
  }

  /**
   * Search for applicable skills
   */
  async search(
    query: Float32Array,
    options: {
      top_k?: number;
      category?: SkillCategory;
      min_success_rate?: number;
    } = {}
  ): Promise<SearchResult[]> {
    let results = await this.client.search(this.namespace, query, {
      top_k: (options.top_k ?? 5) * 2, // Over-fetch for filtering
      ...(options.category !== undefined && { filter: { category: options.category } }),
    });

    // Filter by minimum success rate
    if (options.min_success_rate !== undefined) {
      results = results.filter((r) =>
        (r.metadata['success_rate'] as number) >= options.min_success_rate!
      );
    }

    return results.slice(0, options.top_k ?? 5);
  }

  /**
   * Get a skill by ID
   */
  async get(id: string): Promise<SkillDefinition | null> {
    // Check cache first
    if (this.skillCache.has(id)) {
      return this.skillCache.get(id)!;
    }

    const result = await this.client.get(this.namespace, id);
    if (!result) return null;

    const skill: SkillDefinition = {
      id: result.id,
      name: result.metadata['name'] as string,
      description: result.metadata['description'] as string,
      category: result.metadata['category'] as SkillCategory,
      parameters: [],
      implementation: '',
      version: result.metadata['version'] as string,
      success_rate: result.metadata['success_rate'] as number,
      usage_count: result.metadata['usage_count'] as number,
      created_at: result.metadata['created_at'] as number,
      updated_at: Date.now(),
      last_refined: Date.now(),
      created_by: result.metadata['created_by'] as string,
      tags: result.metadata['tags'] as string[],
    };

    this.skillCache.set(id, skill);
    return skill;
  }

  /**
   * Get a skill by name
   */
  async getByName(name: string): Promise<SkillDefinition | null> {
    const results = await this.client.search(this.namespace, new Float32Array(1536), {
      top_k: 100,
      min_score: -Infinity,
      filter: { name },
    });

    if (results.length === 0) return null;
    return this.get(results[0]!.id);
  }

  /**
   * Execute a skill with parameters
   */
  async execute(request: ExecuteSkillRequest): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    const skill = await this.get(request.skill_id);
    if (!skill) {
      return {
        skill_id: request.skill_id,
        success: false,
        output: null,
        execution_time_ms: Date.now() - startTime,
        error: `Skill not found: ${request.skill_id}`,
      };
    }

    // Validate required parameters
    for (const param of skill.parameters) {
      if (param.required && !(param.name in request.parameters)) {
        return {
          skill_id: request.skill_id,
          success: false,
          output: null,
          execution_time_ms: Date.now() - startTime,
          error: `Missing required parameter: ${param.name}`,
        };
      }
    }

    // Apply default values
    const params = { ...request.parameters };
    for (const param of skill.parameters) {
      if (!(param.name in params) && param.default !== undefined) {
        params[param.name] = param.default;
      }
    }

    // Execute the skill
    if (!this.executor) {
      return {
        skill_id: request.skill_id,
        success: false,
        output: null,
        execution_time_ms: Date.now() - startTime,
        error: 'No executor configured. Call setExecutor() first.',
      };
    }

    try {
      const context: SkillExecutionContext = {
        ...(request.context?.engagement_id !== undefined && { engagement_id: request.context.engagement_id }),
        ...(request.context?.hypothesis_id !== undefined && { hypothesis_id: request.context.hypothesis_id }),
        ...(request.context?.additional_context !== undefined && { additional_context: request.context.additional_context }),
      };

      const result = await this.executor(
        skill.implementation,
        params,
        context
      );

      // Record execution
      await this.recordExecution(request.skill_id, result.success, Date.now() - startTime);

      // Ensure skill_id is set on the result
      return { ...result, skill_id: request.skill_id };
    } catch (error) {
      const execTime = Date.now() - startTime;
      await this.recordExecution(request.skill_id, false, execTime);

      return {
        skill_id: request.skill_id,
        success: false,
        output: null,
        execution_time_ms: execTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Record skill execution for metrics
   */
  async recordExecution(skillId: string, success: boolean, durationMs: number): Promise<void> {
    const skill = await this.get(skillId);
    if (!skill) return;

    const newMetrics = updateSkillMetrics(skill, success, durationMs);

    const existing = await this.client.get(this.namespace, skillId);
    if (existing) {
      await this.client.insert(this.namespace, {
        ...existing,
        metadata: {
          ...existing.metadata,
          success_rate: newMetrics.success_rate,
          usage_count: newMetrics.usage_count,
        },
      });
    }

    // Update cache
    if (this.skillCache.has(skillId)) {
      const cached = this.skillCache.get(skillId)!;
      cached.success_rate = newMetrics.success_rate;
      cached.usage_count = newMetrics.usage_count;
      cached.metrics = newMetrics;
    }
  }

  /**
   * Refine a skill with new implementation
   */
  async refine(
    skillId: string,
    updates: {
      implementation?: string;
      parameters?: SkillParameter[];
      description?: string;
    },
    refinedBy: string,
    changeNotes: string
  ): Promise<SkillDefinition | null> {
    const skill = await this.get(skillId);
    if (!skill) return null;

    // Increment version
    const versionParts = skill.version.split('.').map(Number);
    versionParts[2] = (versionParts[2] ?? 0) + 1;
    const newVersion = versionParts.join('.');

    // Create updated skill
    const updated: SkillDefinition = {
      ...skill,
      implementation: updates.implementation ?? skill.implementation,
      parameters: updates.parameters ?? skill.parameters,
      description: updates.description ?? skill.description,
      version: newVersion,
      updated_at: Date.now(),
      last_refined: Date.now(),
    };

    // Store updated version
    const existing = await this.client.get(this.namespace, skillId);
    if (existing) {
      await this.client.insert(this.namespace, {
        ...existing,
        metadata: {
          ...existing.metadata,
          description: updated.description,
          version: updated.version,
        },
        content: `${updated.name}: ${updated.description}\n\nImplementation:\n${updated.implementation}`,
      });
    }

    // Record version history
    const versions = this.versionHistory.get(skillId) ?? [];
    versions.push({
      version: newVersion,
      implementation: updated.implementation,
      parameters: updated.parameters,
      created_at: Date.now(),
      created_by: refinedBy,
      change_notes: changeNotes,
    });
    this.versionHistory.set(skillId, versions);

    // Update cache
    this.skillCache.set(skillId, updated);

    return updated;
  }

  /**
   * Get version history for a skill
   */
  getVersionHistory(skillId: string): SkillVersion[] {
    return this.versionHistory.get(skillId) ?? [];
  }

  /**
   * List all skills
   */
  async list(options: {
    category?: SkillCategory;
    limit?: number;
    sort_by?: 'usage_count' | 'success_rate' | 'created_at';
  } = {}): Promise<SkillDefinition[]> {
    // Use cached skills directly for reliability (vector search with zero vectors can be unreliable)
    console.log(`[SkillLibrary] list() called, cache size: ${this.skillCache.size}`);
    let skills = Array.from(this.skillCache.values());
    console.log(`[SkillLibrary] skills from cache: ${skills.length}`);

    // Apply category filter
    if (options.category !== undefined) {
      skills = skills.filter(s => s.category === options.category);
    }

    // Sort by specified field
    if (options.sort_by) {
      skills.sort((a, b) => {
        switch (options.sort_by) {
          case 'usage_count':
            return b.usage_count - a.usage_count;
          case 'success_rate':
            return b.success_rate - a.success_rate;
          case 'created_at':
            return b.created_at - a.created_at;
          default:
            return 0;
        }
      });
    }

    // Apply limit
    if (options.limit !== undefined) {
      skills = skills.slice(0, options.limit);
    }

    return skills;
  }

  /**
   * Delete a skill
   */
  async delete(skillId: string): Promise<boolean> {
    await this.client.delete(this.namespace, skillId);
    this.skillCache.delete(skillId);
    this.versionHistory.delete(skillId);
    return true;
  }

  /**
   * Seed default skills from templates
   */
  async seedDefaultSkills(createdBy: string, embedder?: (text: string) => Promise<Float32Array>): Promise<number> {
    let seeded = 0;

    for (const [, template] of Object.entries(skillTemplates)) {
      // Check if skill already exists
      const existing = await this.getByName(template.name);
      if (existing) continue;

      const embedding = embedder
        ? await embedder(`${template.name}: ${template.description}`)
        : undefined;

      await this.create({
        name: template.name,
        description: template.description,
        category: template.category,
        parameters: template.parameters,
        implementation: template.implementation,
      }, createdBy, embedding);

      seeded++;
    }

    return seeded;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total_skills: number;
    by_category: Record<SkillCategory, number>;
    average_success_rate: number;
    total_executions: number;
  }> {
    const skills = await this.list();

    const byCategory: Record<string, number> = {};
    let totalSuccessRate = 0;
    let totalExecutions = 0;

    for (const skill of skills) {
      byCategory[skill.category] = (byCategory[skill.category] ?? 0) + 1;
      totalSuccessRate += skill.success_rate;
      totalExecutions += skill.usage_count;
    }

    return {
      total_skills: skills.length,
      by_category: byCategory as Record<SkillCategory, number>,
      average_success_rate: skills.length > 0 ? totalSuccessRate / skills.length : 0,
      total_executions: totalExecutions,
    };
  }
}

// Singleton instance
let _skillLibrary: SkillLibrary | null = null;

/**
 * Get the singleton Skill Library instance
 */
export function getSkillLibrary(): SkillLibrary {
  if (!_skillLibrary) {
    _skillLibrary = new SkillLibrary();
  }
  return _skillLibrary;
}

/**
 * Set a custom Skill Library instance (for testing)
 */
export function setSkillLibrary(library: SkillLibrary): void {
  _skillLibrary = library;
}
