/**
 * Institutional Memory - Cross-deal knowledge base
 *
 * Persistent knowledge that accumulates learnings across engagements
 * while respecting confidentiality boundaries:
 * - Anonymized deal patterns indexed by sector, thesis type, and outcome
 * - Reflexion episodes capturing what worked and what was missed
 * - Analytical frameworks stored as parameterized, reusable skills
 * - Sector-specific knowledge graphs
 * - Methodology templates with effectiveness metrics
 */

import type {
  ReflexionEpisode,
  SkillDefinition,
  StoreReflexionRequest,
  CreateSkillRequest,
  Sector,
  DealType,
} from '../models/index.js';
import {
  createReflexionEpisode,
  createSkillDefinition,
  updateSkillMetrics,
} from '../models/index.js';
import type { RuvectorClient, SearchResult, SearchOptions } from './ruvector-client.js';
import { getRuvectorClient } from './ruvector-client.js';

/**
 * Deal pattern - anonymized pattern from past engagements
 */
export interface DealPattern {
  id: string;
  pattern_type: string;
  sector: Sector;
  deal_type: DealType;
  thesis_pattern: string;
  outcome: 'success' | 'partial' | 'failed' | 'unknown';
  outcome_score: number;
  key_factors: string[];
  warnings: string[];
  recommendations: string[];
  frequency: number;
  last_seen: number;
  embedding?: Float32Array;
}

/**
 * Sector knowledge node
 */
export interface SectorKnowledge {
  id: string;
  sector: Sector;
  entity_type: 'market_trend' | 'competitive_dynamic' | 'regulatory_factor' | 'technology_shift';
  name: string;
  description: string;
  relevance_score: number;
  sources: string[];
  last_updated: number;
  embedding?: Float32Array;
}

/**
 * Methodology template
 */
export interface MethodologyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: Array<{
    order: number;
    name: string;
    description: string;
    expected_duration_hours: number;
    tools_required: string[];
  }>;
  success_rate: number;
  usage_count: number;
  average_duration_hours: number;
  embedding?: Float32Array;
}

/**
 * Institutional Memory namespaces
 */
const NAMESPACES = {
  reflexions: 'institutional_reflexions',
  skills: 'skills_library',
  patterns: 'institutional_patterns',
  sectorKnowledge: 'institutional_sector_knowledge',
  methodologies: 'institutional_methodologies',
  entities: 'entities_companies',
} as const;

/**
 * Institutional Memory Manager
 */
export class InstitutionalMemory {
  private client: RuvectorClient;

  constructor(client?: RuvectorClient) {
    this.client = client ?? getRuvectorClient();
  }

  /**
   * Initialize institutional memory namespaces
   */
  async initialize(): Promise<void> {
    for (const ns of Object.values(NAMESPACES)) {
      await this.client.createNamespace(ns);
    }
  }

  // =========== Reflexion Memory ===========

  /**
   * Store a reflexion episode from an engagement
   */
  async storeReflexion(
    engagementId: string,
    request: StoreReflexionRequest,
    agentId?: string,
    embedding?: Float32Array
  ): Promise<ReflexionEpisode> {
    const episode = createReflexionEpisode(engagementId, request, agentId);

    const reflexionEntry = {
      session_id: episode.id,
      task_name: episode.task_type,
      outcome_score: episode.outcome_score,
      was_successful: episode.was_successful,
      self_critique: episode.self_critique,
      context: {
        sector: episode.metadata.sector,
        deal_type: episode.metadata.deal_type,
        thesis_pattern: episode.metadata.thesis_pattern,
        key_learnings: episode.key_learnings,
        methodology_used: episode.methodology_used,
      },
      ...(embedding !== undefined && { embedding }),
    };
    await this.client.reflexionStore(NAMESPACES.reflexions, reflexionEntry);

    if (embedding !== undefined) {
      return { ...episode, embedding } as ReflexionEpisode;
    }
    return episode;
  }

  /**
   * Retrieve similar past reflexions
   */
  async retrieveReflexions(
    query: Float32Array,
    options: { top_k?: number; min_score?: number; sector?: string; deal_type?: string } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 10,
      min_score: options.min_score ?? 0.5,
    };

    if (options.sector || options.deal_type) {
      searchOptions.filter = {};
      if (options.sector) searchOptions.filter['sector'] = options.sector;
      if (options.deal_type) searchOptions.filter['deal_type'] = options.deal_type;
    }

    return this.client.reflexionRetrieve(NAMESPACES.reflexions, query, searchOptions);
  }

  /**
   * Get reflexion episodes by task type
   */
  async getReflexionsByTaskType(taskType: string): Promise<SearchResult[]> {
    return this.client.search(NAMESPACES.reflexions, new Float32Array(1536), {
      top_k: 100,
      min_score: -Infinity,
      filter: { task_name: taskType },
    });
  }

  // =========== Skill Library ===========

  /**
   * Create a new analytical skill
   */
  async createSkill(
    request: CreateSkillRequest,
    createdBy: string,
    embedding?: Float32Array
  ): Promise<SkillDefinition> {
    const skill = createSkillDefinition(request, createdBy);

    const skillEntry = {
      name: skill.name,
      description: skill.description,
      parameters: skill.parameters.map((p) => ({
        name: p.name,
        type: p.type,
        required: p.required,
      })),
      implementation: skill.implementation,
      category: skill.category,
      ...(embedding !== undefined && { embedding }),
    };
    await this.client.skillCreate(NAMESPACES.skills, skillEntry);

    if (embedding !== undefined) {
      return { ...skill, embedding } as SkillDefinition;
    }
    return skill;
  }

  /**
   * Search for applicable skills
   */
  async searchSkills(
    query: Float32Array,
    options: { top_k?: number; category?: string } = {}
  ): Promise<SearchResult[]> {
    const searchOptions = {
      top_k: options.top_k ?? 5,
      ...(options.category !== undefined && { category_filter: options.category }),
    };
    return this.client.skillSearch(NAMESPACES.skills, query, searchOptions);
  }

  /**
   * Get a skill by ID
   */
  async getSkill(id: string): Promise<SkillDefinition | null> {
    const result = await this.client.get(NAMESPACES.skills, id);
    if (!result) return null;

    return {
      id: result.id,
      name: result.metadata['name'] as string,
      description: result.metadata['description'] as string,
      category: result.metadata['category'] as SkillDefinition['category'],
      parameters: [],
      implementation: '',
      version: '1.0.0',
      success_rate: (result.metadata['success_rate'] as number) ?? 0,
      usage_count: (result.metadata['usage_count'] as number) ?? 0,
      created_at: (result.metadata['created_at'] as number) ?? Date.now(),
      updated_at: Date.now(),
      last_refined: Date.now(),
      created_by: 'system',
    };
  }

  /**
   * Record skill execution result
   */
  async recordSkillExecution(
    skillId: string,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    const skill = await this.getSkill(skillId);
    if (!skill) return;

    const newMetrics = updateSkillMetrics(skill, success, durationMs);
    await this.client.skillUpdate(skillId, {
      ...skill,
      metrics: newMetrics,
      success_rate: newMetrics.success_rate,
      usage_count: newMetrics.usage_count,
    } as any);
  }

  // =========== Deal Patterns ===========

  /**
   * Store an anonymized deal pattern
   */
  async storePattern(pattern: Omit<DealPattern, 'id'>, embedding?: Float32Array): Promise<DealPattern> {
    const id = crypto.randomUUID();
    const fullPattern: DealPattern = embedding !== undefined
      ? { id, ...pattern, embedding }
      : { id, ...pattern };

    await this.client.insert(NAMESPACES.patterns, {
      id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        pattern_type: pattern.pattern_type,
        sector: pattern.sector,
        deal_type: pattern.deal_type,
        thesis_pattern: pattern.thesis_pattern,
        outcome: pattern.outcome,
        outcome_score: pattern.outcome_score,
        frequency: pattern.frequency,
        last_seen: pattern.last_seen,
      },
      content: JSON.stringify({
        key_factors: pattern.key_factors,
        warnings: pattern.warnings,
        recommendations: pattern.recommendations,
      }),
    });

    return fullPattern;
  }

  /**
   * Search for similar deal patterns
   */
  async searchPatterns(
    query: Float32Array,
    options: {
      top_k?: number;
      sector?: Sector;
      deal_type?: DealType;
      outcome_weight?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 10,
    };

    if (options.sector || options.deal_type) {
      searchOptions.filter = {};
      if (options.sector) searchOptions.filter['sector'] = options.sector;
      if (options.deal_type) searchOptions.filter['deal_type'] = options.deal_type;
    }

    return this.client.patternSearch(NAMESPACES.patterns, query, {
      ...searchOptions,
      outcome_weight: options.outcome_weight ?? 0.2,
    });
  }

  /**
   * Update pattern frequency
   */
  async incrementPatternFrequency(patternId: string): Promise<void> {
    const existing = await this.client.get(NAMESPACES.patterns, patternId);
    if (existing) {
      await this.client.insert(NAMESPACES.patterns, {
        ...existing,
        metadata: {
          ...existing.metadata,
          frequency: (existing.metadata['frequency'] as number ?? 0) + 1,
          last_seen: Date.now(),
        },
      });
    }
  }

  // =========== Sector Knowledge ===========

  /**
   * Store sector knowledge
   */
  async storeSectorKnowledge(
    knowledge: Omit<SectorKnowledge, 'id'>,
    embedding?: Float32Array
  ): Promise<SectorKnowledge> {
    const id = crypto.randomUUID();
    const fullKnowledge: SectorKnowledge = embedding !== undefined
      ? { id, ...knowledge, embedding }
      : { id, ...knowledge };

    await this.client.insert(NAMESPACES.sectorKnowledge, {
      id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        sector: knowledge.sector,
        entity_type: knowledge.entity_type,
        name: knowledge.name,
        relevance_score: knowledge.relevance_score,
        last_updated: knowledge.last_updated,
      },
      content: knowledge.description,
    });

    return fullKnowledge;
  }

  /**
   * Search sector knowledge
   */
  async searchSectorKnowledge(
    query: Float32Array,
    options: { top_k?: number; sector?: Sector; entity_type?: string } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 10,
    };

    if (options.sector || options.entity_type) {
      searchOptions.filter = {};
      if (options.sector) searchOptions.filter['sector'] = options.sector;
      if (options.entity_type) searchOptions.filter['entity_type'] = options.entity_type;
    }

    return this.client.search(NAMESPACES.sectorKnowledge, query, searchOptions);
  }

  /**
   * Get all knowledge for a sector
   */
  async getSectorKnowledge(sector: Sector): Promise<SectorKnowledge[]> {
    const results = await this.client.search(NAMESPACES.sectorKnowledge, new Float32Array(1536), {
      top_k: 1000,
      min_score: -Infinity,
      filter: { sector },
    });

    return results.map((r) => ({
      id: r.id,
      sector: r.metadata['sector'] as Sector,
      entity_type: r.metadata['entity_type'] as SectorKnowledge['entity_type'],
      name: r.metadata['name'] as string,
      description: r.content ?? '',
      relevance_score: r.metadata['relevance_score'] as number,
      sources: [],
      last_updated: r.metadata['last_updated'] as number,
    }));
  }

  // =========== Methodology Templates ===========

  /**
   * Store a methodology template
   */
  async storeMethodology(
    methodology: Omit<MethodologyTemplate, 'id'>,
    embedding?: Float32Array
  ): Promise<MethodologyTemplate> {
    const id = crypto.randomUUID();
    const fullMethodology: MethodologyTemplate = embedding !== undefined
      ? { id, ...methodology, embedding }
      : { id, ...methodology };

    await this.client.insert(NAMESPACES.methodologies, {
      id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        name: methodology.name,
        category: methodology.category,
        success_rate: methodology.success_rate,
        usage_count: methodology.usage_count,
        average_duration_hours: methodology.average_duration_hours,
      },
      content: JSON.stringify({
        description: methodology.description,
        steps: methodology.steps,
      }),
    });

    return fullMethodology;
  }

  /**
   * Search methodology templates
   */
  async searchMethodologies(
    query: Float32Array,
    options: { top_k?: number; category?: string } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 5,
    };

    if (options.category) {
      searchOptions.filter = { category: options.category };
    }

    return this.client.search(NAMESPACES.methodologies, query, searchOptions);
  }

  /**
   * Get a methodology by ID
   */
  async getMethodology(id: string): Promise<MethodologyTemplate | null> {
    const result = await this.client.get(NAMESPACES.methodologies, id);
    if (!result) return null;

    const contentData = result.content ? JSON.parse(result.content) : {};

    return {
      id: result.id,
      name: result.metadata['name'] as string,
      description: contentData.description ?? '',
      category: result.metadata['category'] as string,
      steps: contentData.steps ?? [],
      success_rate: result.metadata['success_rate'] as number,
      usage_count: result.metadata['usage_count'] as number,
      average_duration_hours: result.metadata['average_duration_hours'] as number,
    };
  }

  /**
   * Record methodology usage
   */
  async recordMethodologyUsage(
    methodologyId: string,
    success: boolean,
    durationHours: number
  ): Promise<void> {
    const methodology = await this.getMethodology(methodologyId);
    if (!methodology) return;

    const newUsageCount = methodology.usage_count + 1;
    const newSuccessRate = success
      ? (methodology.success_rate * methodology.usage_count + 1) / newUsageCount
      : (methodology.success_rate * methodology.usage_count) / newUsageCount;
    const newAverageDuration =
      (methodology.average_duration_hours * methodology.usage_count + durationHours) / newUsageCount;

    const existing = await this.client.get(NAMESPACES.methodologies, methodologyId);
    if (existing) {
      await this.client.insert(NAMESPACES.methodologies, {
        ...existing,
        metadata: {
          ...existing.metadata,
          usage_count: newUsageCount,
          success_rate: newSuccessRate,
          average_duration_hours: newAverageDuration,
        },
      });
    }
  }

  // =========== Entity Resolution ===========

  /**
   * Store a company entity for entity resolution
   */
  async storeCompanyEntity(entity: {
    name: string;
    aliases: string[];
    sector: Sector;
    description: string;
    attributes: Record<string, unknown>;
  }, embedding?: Float32Array): Promise<string> {
    const id = crypto.randomUUID();

    await this.client.insert(NAMESPACES.entities, {
      id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        name: entity.name,
        aliases: entity.aliases,
        sector: entity.sector,
        attributes: entity.attributes,
      },
      content: entity.description,
    });

    return id;
  }

  /**
   * Resolve an entity by name or alias
   */
  async resolveEntity(
    query: Float32Array,
    options: { top_k?: number; sector?: Sector } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 5,
      min_score: 0.7, // High threshold for entity resolution
    };

    if (options.sector) {
      searchOptions.filter = { sector: options.sector };
    }

    return this.client.search(NAMESPACES.entities, query, searchOptions);
  }

  // =========== Statistics ===========

  /**
   * Get institutional memory statistics
   */
  async getStats(): Promise<{
    reflexion_count: number;
    skill_count: number;
    pattern_count: number;
    sector_knowledge_count: number;
    methodology_count: number;
    entity_count: number;
  }> {
    const [reflexions, skills, patterns, sectorKnowledge, methodologies, entities] = await Promise.all([
      this.client.getNamespaceStats(NAMESPACES.reflexions),
      this.client.getNamespaceStats(NAMESPACES.skills),
      this.client.getNamespaceStats(NAMESPACES.patterns),
      this.client.getNamespaceStats(NAMESPACES.sectorKnowledge),
      this.client.getNamespaceStats(NAMESPACES.methodologies),
      this.client.getNamespaceStats(NAMESPACES.entities),
    ]);

    return {
      reflexion_count: reflexions.vector_count,
      skill_count: skills.vector_count,
      pattern_count: patterns.vector_count,
      sector_knowledge_count: sectorKnowledge.vector_count,
      methodology_count: methodologies.vector_count,
      entity_count: entities.vector_count,
    };
  }
}

// Singleton instance
let _institutionalMemory: InstitutionalMemory | null = null;

/**
 * Get the singleton Institutional Memory instance
 */
export function getInstitutionalMemory(): InstitutionalMemory {
  if (!_institutionalMemory) {
    _institutionalMemory = new InstitutionalMemory();
  }
  return _institutionalMemory;
}

/**
 * Set a custom Institutional Memory instance (for testing)
 */
export function setInstitutionalMemory(memory: InstitutionalMemory): void {
  _institutionalMemory = memory;
}
