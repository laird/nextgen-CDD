/**
 * Reflexion Store - Learning episodes for institutional memory
 *
 * Implements the reflexion memory pattern where agents store:
 * - Task outcomes with success/failure assessment
 * - Self-critique explaining what could have been better
 * - Key learnings extracted from the experience
 * - Methodology used for potential reuse
 */

import type { ReflexionEpisode, StoreReflexionRequest } from '../models/index.js';
import { createReflexionEpisode } from '../models/index.js';
import type { RuvectorClient, SearchResult } from './ruvector-client.js';
import { getRuvectorClient } from './ruvector-client.js';

/**
 * Aggregated reflexion insights
 */
export interface ReflexionInsights {
  total_episodes: number;
  success_rate: number;
  common_failures: Array<{
    pattern: string;
    frequency: number;
  }>;
  top_learnings: Array<{
    learning: string;
    frequency: number;
    average_outcome_score: number;
  }>;
  methodology_effectiveness: Array<{
    methodology: string;
    usage_count: number;
    success_rate: number;
    average_outcome_score: number;
  }>;
}

/**
 * Reflexion query filters
 */
export interface ReflexionQueryFilters {
  task_types?: string[];
  sectors?: string[];
  deal_types?: string[];
  min_outcome_score?: number;
  max_outcome_score?: number;
  was_successful?: boolean;
  date_range?: {
    start: number;
    end: number;
  };
}

/**
 * Reflexion Store - Manages learning episodes
 */
export class ReflexionStore {
  private client: RuvectorClient;
  private namespace = 'institutional_reflexions';

  constructor(client?: RuvectorClient) {
    this.client = client ?? getRuvectorClient();
  }

  /**
   * Initialize the reflexion store
   */
  async initialize(): Promise<void> {
    await this.client.createNamespace(this.namespace);
  }

  /**
   * Store a new reflexion episode
   */
  async store(
    engagementId: string,
    request: StoreReflexionRequest,
    agentId?: string,
    embedding?: Float32Array
  ): Promise<ReflexionEpisode> {
    const episode = createReflexionEpisode(engagementId, request, agentId);

    await this.client.insert(this.namespace, {
      id: episode.id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        engagement_id: episode.engagement_id,
        task_type: episode.task_type,
        outcome_score: episode.outcome_score,
        was_successful: episode.was_successful,
        methodology_used: episode.methodology_used,
        sector: episode.metadata.sector,
        deal_type: episode.metadata.deal_type,
        thesis_pattern: episode.metadata.thesis_pattern,
        duration_hours: episode.metadata.duration_hours,
        created_at: episode.metadata.created_at,
        agent_id: episode.metadata.agent_id,
        key_learnings: episode.key_learnings,
      },
      content: episode.self_critique,
    });

    if (embedding !== undefined) {
      return { ...episode, embedding: new Float32Array(embedding) };
    }
    return episode;
  }

  /**
   * Retrieve similar reflexion episodes
   */
  async retrieveSimilar(
    query: Float32Array,
    options: {
      top_k?: number;
      min_score?: number;
      filters?: ReflexionQueryFilters;
    } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: any = {
      top_k: options.top_k ?? 10,
      min_score: options.min_score ?? 0.5,
    };

    // Apply filters
    if (options.filters) {
      searchOptions.filter = {};

      if (options.filters.was_successful !== undefined) {
        searchOptions.filter['was_successful'] = options.filters.was_successful;
      }

      if (options.filters.sectors && options.filters.sectors.length === 1) {
        searchOptions.filter['sector'] = options.filters.sectors[0];
      }

      if (options.filters.deal_types && options.filters.deal_types.length === 1) {
        searchOptions.filter['deal_type'] = options.filters.deal_types[0];
      }
    }

    let results = await this.client.search(this.namespace, query, searchOptions);

    // Apply additional filters that can't be done at the database level
    if (options.filters) {
      if (options.filters.task_types && options.filters.task_types.length > 0) {
        results = results.filter((r) =>
          options.filters!.task_types!.includes(r.metadata['task_type'] as string)
        );
      }

      if (options.filters.sectors && options.filters.sectors.length > 1) {
        results = results.filter((r) =>
          options.filters!.sectors!.includes(r.metadata['sector'] as string)
        );
      }

      if (options.filters.min_outcome_score !== undefined) {
        results = results.filter((r) =>
          (r.metadata['outcome_score'] as number) >= options.filters!.min_outcome_score!
        );
      }

      if (options.filters.max_outcome_score !== undefined) {
        results = results.filter((r) =>
          (r.metadata['outcome_score'] as number) <= options.filters!.max_outcome_score!
        );
      }

      if (options.filters.date_range) {
        results = results.filter((r) => {
          const createdAt = r.metadata['created_at'] as number;
          return createdAt >= options.filters!.date_range!.start &&
                 createdAt <= options.filters!.date_range!.end;
        });
      }
    }

    return results;
  }

  /**
   * Get reflexion episodes by task type
   */
  async getByTaskType(taskType: string, limit = 100): Promise<ReflexionEpisode[]> {
    const results = await this.client.search(this.namespace, new Float32Array(1536), {
      top_k: limit,
      min_score: -Infinity,
      filter: { task_type: taskType },
    });

    return results.map(this.resultToEpisode);
  }

  /**
   * Get successful reflexion episodes for a methodology
   */
  async getSuccessfulMethodologies(methodology: string): Promise<ReflexionEpisode[]> {
    const results = await this.client.search(this.namespace, new Float32Array(1536), {
      top_k: 100,
      min_score: -Infinity,
      filter: {
        methodology_used: methodology,
        was_successful: true,
      },
    });

    return results.map(this.resultToEpisode);
  }

  /**
   * Get failed episodes for learning
   */
  async getFailures(options: {
    limit?: number;
    sector?: string;
    task_type?: string;
  } = {}): Promise<ReflexionEpisode[]> {
    const filter: Record<string, any> = { was_successful: false };
    if (options.sector) filter['sector'] = options.sector;
    if (options.task_type) filter['task_type'] = options.task_type;

    const results = await this.client.search(this.namespace, new Float32Array(1536), {
      top_k: options.limit ?? 50,
      min_score: -Infinity,
      filter,
    });

    return results.map(this.resultToEpisode);
  }

  /**
   * Convert search result to ReflexionEpisode
   */
  private resultToEpisode(result: SearchResult): ReflexionEpisode {
    return {
      id: result.id,
      engagement_id: result.metadata['engagement_id'] as string,
      task_type: result.metadata['task_type'] as string,
      outcome_score: result.metadata['outcome_score'] as number,
      was_successful: result.metadata['was_successful'] as boolean,
      self_critique: result.content ?? '',
      key_learnings: (result.metadata['key_learnings'] as string[]) ?? [],
      methodology_used: result.metadata['methodology_used'] as string,
      metadata: {
        sector: result.metadata['sector'] as string,
        deal_type: result.metadata['deal_type'] as string,
        thesis_pattern: result.metadata['thesis_pattern'] as string,
        duration_hours: result.metadata['duration_hours'] as number,
        created_at: result.metadata['created_at'] as number,
        agent_id: result.metadata['agent_id'] as string | undefined,
      },
    };
  }

  /**
   * Generate aggregated insights from reflexion history
   */
  async generateInsights(filters?: ReflexionQueryFilters): Promise<ReflexionInsights> {
    // Get all relevant episodes
    const allResults = await this.retrieveSimilar(new Float32Array(1536), {
      top_k: 1000,
      min_score: -Infinity,
      ...(filters !== undefined && { filters }),
    });

    const episodes = allResults.map(this.resultToEpisode.bind(this));

    if (episodes.length === 0) {
      return {
        total_episodes: 0,
        success_rate: 0,
        common_failures: [],
        top_learnings: [],
        methodology_effectiveness: [],
      };
    }

    // Calculate success rate
    const successCount = episodes.filter((e) => e.was_successful).length;
    const successRate = successCount / episodes.length;

    // Analyze failure patterns
    const failurePatterns = new Map<string, number>();
    for (const episode of episodes.filter((e) => !e.was_successful)) {
      // Extract pattern from self-critique (simplified)
      const pattern = episode.self_critique.slice(0, 100);
      failurePatterns.set(pattern, (failurePatterns.get(pattern) ?? 0) + 1);
    }

    const commonFailures = Array.from(failurePatterns.entries())
      .map(([pattern, frequency]) => ({ pattern, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Analyze learnings
    const learningStats = new Map<string, { count: number; totalScore: number }>();
    for (const episode of episodes) {
      for (const learning of episode.key_learnings) {
        const stats = learningStats.get(learning) ?? { count: 0, totalScore: 0 };
        stats.count++;
        stats.totalScore += episode.outcome_score;
        learningStats.set(learning, stats);
      }
    }

    const topLearnings = Array.from(learningStats.entries())
      .map(([learning, stats]) => ({
        learning,
        frequency: stats.count,
        average_outcome_score: stats.totalScore / stats.count,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Analyze methodology effectiveness
    const methodologyStats = new Map<string, { count: number; successes: number; totalScore: number }>();
    for (const episode of episodes) {
      const stats = methodologyStats.get(episode.methodology_used) ?? { count: 0, successes: 0, totalScore: 0 };
      stats.count++;
      if (episode.was_successful) stats.successes++;
      stats.totalScore += episode.outcome_score;
      methodologyStats.set(episode.methodology_used, stats);
    }

    const methodologyEffectiveness = Array.from(methodologyStats.entries())
      .map(([methodology, stats]) => ({
        methodology,
        usage_count: stats.count,
        success_rate: stats.successes / stats.count,
        average_outcome_score: stats.totalScore / stats.count,
      }))
      .sort((a, b) => b.success_rate - a.success_rate);

    return {
      total_episodes: episodes.length,
      success_rate: successRate,
      common_failures: commonFailures,
      top_learnings: topLearnings,
      methodology_effectiveness: methodologyEffectiveness,
    };
  }

  /**
   * Find similar past experiences for a new task
   */
  async findSimilarExperiences(
    _taskDescription: string,
    taskEmbedding: Float32Array,
    context: {
      sector?: string;
      deal_type?: string;
      task_type?: string;
    }
  ): Promise<{
    similar_successes: ReflexionEpisode[];
    similar_failures: ReflexionEpisode[];
    recommended_approach: string | null;
  }> {
    const filters: ReflexionQueryFilters = {};
    if (context.sector) filters.sectors = [context.sector];
    if (context.deal_type) filters.deal_types = [context.deal_type];
    if (context.task_type) filters.task_types = [context.task_type];

    // Get similar successful experiences
    const successResults = await this.retrieveSimilar(taskEmbedding, {
      top_k: 5,
      min_score: 0.6,
      filters: { ...filters, was_successful: true },
    });

    // Get similar failed experiences
    const failureResults = await this.retrieveSimilar(taskEmbedding, {
      top_k: 5,
      min_score: 0.6,
      filters: { ...filters, was_successful: false },
    });

    const similarSuccesses = successResults.map(this.resultToEpisode.bind(this));
    const similarFailures = failureResults.map(this.resultToEpisode.bind(this));

    // Generate recommended approach based on successful experiences
    let recommendedApproach: string | null = null;
    if (similarSuccesses.length > 0) {
      // Find most common successful methodology
      const methodologyCounts = new Map<string, number>();
      for (const episode of similarSuccesses) {
        methodologyCounts.set(
          episode.methodology_used,
          (methodologyCounts.get(episode.methodology_used) ?? 0) + 1
        );
      }

      const topMethodology = Array.from(methodologyCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];

      if (topMethodology) {
        recommendedApproach = `Based on ${similarSuccesses.length} similar past experiences, ` +
          `consider using the "${topMethodology[0]}" methodology which was successful ` +
          `${topMethodology[1]} time(s) in comparable situations.`;
      }
    }

    return {
      similar_successes: similarSuccesses,
      similar_failures: similarFailures,
      recommended_approach: recommendedApproach,
    };
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total_episodes: number;
    success_rate: number;
    episodes_by_task_type: Record<string, number>;
    episodes_by_sector: Record<string, number>;
  }> {
    const stats = await this.client.getNamespaceStats(this.namespace);
    const insights = await this.generateInsights();

    // This would need to iterate through all episodes in production
    return {
      total_episodes: stats.vector_count,
      success_rate: insights.success_rate,
      episodes_by_task_type: {},
      episodes_by_sector: {},
    };
  }
}

// Singleton instance
let _reflexionStore: ReflexionStore | null = null;

/**
 * Get the singleton Reflexion Store instance
 */
export function getReflexionStore(): ReflexionStore {
  if (!_reflexionStore) {
    _reflexionStore = new ReflexionStore();
  }
  return _reflexionStore;
}

/**
 * Set a custom Reflexion Store instance (for testing)
 */
export function setReflexionStore(store: ReflexionStore): void {
  _reflexionStore = store;
}
