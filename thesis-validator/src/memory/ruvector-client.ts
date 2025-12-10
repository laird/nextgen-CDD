/**
 * Ruvector Client - Vector database wrapper for Thesis Validator
 *
 * This module provides a high-level interface to the Ruvector vector database,
 * supporting the memory system architecture with deal memory, institutional memory,
 * and market intelligence tiers.
 */

import { createHash } from 'crypto';

/**
 * Ruvector configuration options
 */
export interface RuvectorConfig {
  path: string;
  dimensions: number;
  metric: 'cosine' | 'euclidean' | 'dot_product';
  hnsw: {
    m: number;
    ef_construction: number;
    ef_search: number;
  };
  quantization?: {
    enabled: boolean;
    type: 'product' | 'scalar';
    num_subvectors?: number;
  };
  persistence?: {
    enabled: boolean;
    sync_interval_ms: number;
  };
}

/**
 * Vector entry with metadata
 */
export interface VectorEntry<T = Record<string, unknown>> {
  id: string;
  vector: Float32Array | number[];
  metadata: T;
  content?: string;
}

/**
 * Search result with score and provenance
 */
export interface SearchResult<T = Record<string, unknown>> {
  id: string;
  score: number;
  metadata: T;
  content?: string;
  certificate?: ProvenanceCertificate;
}

/**
 * Provenance certificate for explainable retrieval
 */
export interface ProvenanceCertificate {
  merkle_proof: string;
  explanation: string;
  retrieval_timestamp: number;
  similarity_score: number;
  query_embedding_hash: string;
}

/**
 * Causal edge for graph operations
 */
export interface CausalEdgeEntry {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  strength: number;
  metadata?: Record<string, unknown>;
}

/**
 * Reflexion episode for learning
 */
export interface ReflexionEntry {
  session_id: string;
  task_name: string;
  outcome_score: number;
  was_successful: boolean;
  self_critique: string;
  context: Record<string, unknown>;
  embedding?: Float32Array | number[];
}

/**
 * Skill entry for the skill library
 */
export interface SkillEntry {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  implementation: string;
  category: string;
  embedding?: Float32Array | number[];
}

/**
 * Search options for vector queries
 */
export interface SearchOptions {
  top_k: number;
  ef_search?: number;
  filter?: Record<string, unknown>;
  include_metadata?: boolean;
  include_vectors?: boolean;
  similarity_weight?: number;
  recency_weight?: number;
  credibility_weight?: number;
  diversity_weight?: number;
  min_score?: number;
}

/**
 * Causal query options
 */
export interface CausalQueryOptions {
  direction: 'upstream' | 'downstream' | 'both';
  max_depth: number;
  relationship_filter?: string[];
}

/**
 * In-memory namespace storage
 */
interface Namespace {
  vectors: Map<string, VectorEntry>;
  causalEdges: Map<string, CausalEdgeEntry>;
}

/**
 * RuvectorClient - Main vector database client
 *
 * This is an in-memory implementation that mirrors the expected Ruvector API.
 * In production, this would connect to the actual Ruvector Rust core.
 */
export class RuvectorClient {
  private config: RuvectorConfig;
  private namespaces: Map<string, Namespace> = new Map();
  private reflexions: Map<string, ReflexionEntry[]> = new Map();
  private skills: Map<string, SkillEntry> = new Map();
  private initialized = false;

  constructor(config: RuvectorConfig) {
    this.config = config;
  }

  /**
   * Initialize the Ruvector client
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // In a real implementation, this would:
    // 1. Connect to the Ruvector native library
    // 2. Load persisted data from disk
    // 3. Initialize HNSW indices

    this.initialized = true;
    console.log(`[RuvectorClient] Initialized with config:`, {
      path: this.config.path,
      dimensions: this.config.dimensions,
      metric: this.config.metric,
    });
  }

  /**
   * Ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('RuvectorClient not initialized. Call initialize() first.');
    }
  }

  /**
   * Get or create a namespace
   */
  private getNamespace(name: string): Namespace {
    let ns = this.namespaces.get(name);
    if (!ns) {
      ns = {
        vectors: new Map(),
        causalEdges: new Map(),
      };
      this.namespaces.set(name, ns);
    }
    return ns;
  }

  /**
   * Create a namespace
   */
  async createNamespace(name: string): Promise<void> {
    this.ensureInitialized();
    if (!this.namespaces.has(name)) {
      this.namespaces.set(name, {
        vectors: new Map(),
        causalEdges: new Map(),
      });
    }
  }

  /**
   * Delete a namespace
   */
  async deleteNamespace(name: string): Promise<void> {
    this.ensureInitialized();
    this.namespaces.delete(name);
  }

  /**
   * List all namespaces
   */
  async listNamespaces(): Promise<string[]> {
    this.ensureInitialized();
    return Array.from(this.namespaces.keys());
  }

  /**
   * Insert a single vector
   */
  async insert<T = Record<string, unknown>>(
    namespace: string,
    entry: VectorEntry<T>
  ): Promise<void> {
    this.ensureInitialized();
    const ns = this.getNamespace(namespace);
    ns.vectors.set(entry.id, entry as VectorEntry);
  }

  /**
   * Insert multiple vectors in batch
   */
  async insertBatch<T = Record<string, unknown>>(
    namespace: string,
    entries: VectorEntry<T>[]
  ): Promise<void> {
    this.ensureInitialized();
    const ns = this.getNamespace(namespace);
    for (const entry of entries) {
      ns.vectors.set(entry.id, entry as VectorEntry);
    }
  }

  /**
   * Get a vector by ID
   */
  async get<T = Record<string, unknown>>(
    namespace: string,
    id: string
  ): Promise<VectorEntry<T> | null> {
    this.ensureInitialized();
    const ns = this.namespaces.get(namespace);
    if (!ns) return null;
    return (ns.vectors.get(id) as VectorEntry<T>) ?? null;
  }

  /**
   * Delete a vector by ID
   */
  async delete(namespace: string, id: string): Promise<void> {
    this.ensureInitialized();
    const ns = this.namespaces.get(namespace);
    if (ns) {
      ns.vectors.delete(id);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  /**
   * Search for similar vectors
   */
  async search<T = Record<string, unknown>>(
    namespace: string,
    query: Float32Array | number[],
    options: SearchOptions
  ): Promise<SearchResult<T>[]> {
    this.ensureInitialized();
    const ns = this.namespaces.get(namespace);
    if (!ns) return [];

    const results: SearchResult<T>[] = [];
    const queryHash = createHash('sha256')
      .update(Buffer.from(new Float32Array(query).buffer))
      .digest('hex')
      .slice(0, 16);

    for (const [id, entry] of ns.vectors) {
      const similarity = this.cosineSimilarity(query, entry.vector);

      // Apply minimum score filter
      if (options.min_score && similarity < options.min_score) {
        continue;
      }

      // Apply metadata filter
      if (options.filter) {
        let matches = true;
        for (const [key, value] of Object.entries(options.filter)) {
          if (entry.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      // Calculate weighted score
      let score = similarity * (options.similarity_weight ?? 1.0);

      // Apply recency weighting if metadata has timestamp
      if (options.recency_weight && entry.metadata['timestamp']) {
        const age = Date.now() - (entry.metadata['timestamp'] as number);
        const recencyScore = Math.exp(-age / (30 * 24 * 60 * 60 * 1000)); // 30-day decay
        score += recencyScore * options.recency_weight;
      }

      // Apply credibility weighting
      if (options.credibility_weight && entry.metadata['credibility_score']) {
        score += (entry.metadata['credibility_score'] as number) * options.credibility_weight;
      }

      results.push({
        id,
        score,
        metadata: entry.metadata as T,
        ...(entry.content !== undefined && { content: entry.content }),
        ...(true && {
          certificate: {
            merkle_proof: createHash('sha256').update(id).digest('hex'),
            explanation: `Retrieved based on semantic similarity (${(similarity * 100).toFixed(1)}% match)`,
            retrieval_timestamp: Date.now(),
            similarity_score: similarity,
            query_embedding_hash: queryHash,
          }
        }),
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply MMR diversity if requested
    if (options.diversity_weight && options.diversity_weight > 0) {
      return this.applyMMR(results, query, ns, options.diversity_weight, options.top_k);
    }

    return results.slice(0, options.top_k);
  }

  /**
   * Apply Maximal Marginal Relevance for diversity
   */
  private applyMMR<T>(
    results: SearchResult<T>[],
    _query: number[] | Float32Array,
    ns: Namespace,
    diversityWeight: number,
    topK: number
  ): SearchResult<T>[] {
    const selected: SearchResult<T>[] = [];
    const remaining = [...results];

    while (selected.length < topK && remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;
        const relevance = candidate.score;

        // Calculate max similarity to already selected
        let maxSimilarity = 0;
        for (const sel of selected) {
          const selVector = ns.vectors.get(sel.id)?.vector;
          const candVector = ns.vectors.get(candidate.id)?.vector;
          if (selVector && candVector) {
            const sim = this.cosineSimilarity(selVector, candVector);
            maxSimilarity = Math.max(maxSimilarity, sim);
          }
        }

        const mmrScore = (1 - diversityWeight) * relevance - diversityWeight * maxSimilarity;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining[bestIdx]!);
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }

  /**
   * Search across multiple namespaces
   */
  async searchMultiple<T = Record<string, unknown>>(
    namespaces: string[],
    query: Float32Array | number[],
    options: SearchOptions
  ): Promise<SearchResult<T>[]> {
    this.ensureInitialized();
    const allResults: SearchResult<T>[] = [];

    for (const ns of namespaces) {
      const results = await this.search<T>(ns, query, { ...options, top_k: options.top_k * 2 });
      allResults.push(...results);
    }

    // Sort combined results and return top_k
    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, options.top_k);
  }

  /**
   * Recall with provenance certificate
   */
  async recallWithCertificate<T = Record<string, unknown>>(
    namespace: string,
    query: Float32Array | number[],
    options: SearchOptions
  ): Promise<SearchResult<T>[]> {
    // The search method already includes certificates
    return this.search<T>(namespace, query, options);
  }

  // =========== Causal Graph Operations ===========

  /**
   * Add a causal edge between nodes
   */
  async causalAddEdge(
    namespace: string,
    edge: Omit<CausalEdgeEntry, 'id'>
  ): Promise<string> {
    this.ensureInitialized();
    const ns = this.getNamespace(namespace);
    const id = crypto.randomUUID();
    ns.causalEdges.set(id, { id, ...edge });
    return id;
  }

  /**
   * Query causal dependencies
   */
  async causalQuery(
    namespace: string,
    nodeId: string,
    options: CausalQueryOptions
  ): Promise<CausalEdgeEntry[]> {
    this.ensureInitialized();
    const ns = this.namespaces.get(namespace);
    if (!ns) return [];

    const results: CausalEdgeEntry[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id) || current.depth > options.max_depth) continue;
      visited.add(current.id);

      for (const edge of ns.causalEdges.values()) {
        // Apply relationship filter
        if (options.relationship_filter && !options.relationship_filter.includes(edge.relationship)) {
          continue;
        }

        let matches = false;
        let nextId: string | null = null;

        if (options.direction === 'upstream' || options.direction === 'both') {
          if (edge.target_id === current.id) {
            matches = true;
            nextId = edge.source_id;
          }
        }

        if (options.direction === 'downstream' || options.direction === 'both') {
          if (edge.source_id === current.id) {
            matches = true;
            nextId = edge.target_id;
          }
        }

        if (matches) {
          results.push(edge);
          if (nextId && !visited.has(nextId)) {
            queue.push({ id: nextId, depth: current.depth + 1 });
          }
        }
      }
    }

    return results;
  }

  /**
   * Get all causal edges for a node
   */
  async causalGetEdges(namespace: string, nodeId: string): Promise<CausalEdgeEntry[]> {
    this.ensureInitialized();
    const ns = this.namespaces.get(namespace);
    if (!ns) return [];

    return Array.from(ns.causalEdges.values()).filter(
      (edge) => edge.source_id === nodeId || edge.target_id === nodeId
    );
  }

  /**
   * Delete a causal edge
   */
  async causalDeleteEdge(namespace: string, edgeId: string): Promise<void> {
    this.ensureInitialized();
    const ns = this.namespaces.get(namespace);
    if (ns) {
      ns.causalEdges.delete(edgeId);
    }
  }

  // =========== Reflexion Memory Operations ===========

  /**
   * Store a reflexion episode
   */
  async reflexionStore(namespace: string, episode: ReflexionEntry): Promise<void> {
    this.ensureInitialized();
    const episodes = this.reflexions.get(namespace) ?? [];
    episodes.push(episode);
    this.reflexions.set(namespace, episodes);

    // Also store as vector for semantic search
    if (episode.embedding) {
      await this.insert(namespace, {
        id: episode.session_id,
        vector: episode.embedding,
        metadata: {
          task_name: episode.task_name,
          outcome_score: episode.outcome_score,
          was_successful: episode.was_successful,
          self_critique: episode.self_critique,
          ...episode.context,
        },
        content: episode.self_critique,
      });
    }
  }

  /**
   * Retrieve similar reflexion episodes
   */
  async reflexionRetrieve(
    namespace: string,
    query: Float32Array | number[],
    options: { top_k: number; min_score?: number }
  ): Promise<SearchResult[]> {
    return this.search(namespace, query, {
      top_k: options.top_k,
      ...(options.min_score !== undefined && { min_score: options.min_score }),
    });
  }

  // =========== Skill Library Operations ===========

  /**
   * Create a new skill
   */
  async skillCreate(namespace: string, skill: SkillEntry): Promise<string> {
    this.ensureInitialized();
    const id = crypto.randomUUID();
    this.skills.set(id, skill);

    // Store in vector namespace for semantic search
    if (skill.embedding) {
      await this.insert(namespace, {
        id,
        vector: skill.embedding,
        metadata: {
          name: skill.name,
          description: skill.description,
          category: skill.category,
        },
        content: `${skill.name}: ${skill.description}`,
      });
    }

    return id;
  }

  /**
   * Search for relevant skills
   */
  async skillSearch(
    namespace: string,
    query: Float32Array | number[],
    options: { top_k: number; category_filter?: string }
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k,
    };

    if (options.category_filter) {
      searchOptions.filter = { category: options.category_filter };
    }

    return this.search(namespace, query, searchOptions);
  }

  /**
   * Get a skill by ID
   */
  async skillGet(id: string): Promise<SkillEntry | null> {
    return this.skills.get(id) ?? null;
  }

  /**
   * Update a skill
   */
  async skillUpdate(id: string, updates: Partial<SkillEntry>): Promise<void> {
    const skill = this.skills.get(id);
    if (skill) {
      this.skills.set(id, { ...skill, ...updates });
    }
  }

  // =========== Pattern Search ===========

  /**
   * Search for similar patterns in institutional memory
   */
  async patternSearch<T = Record<string, unknown>>(
    namespace: string,
    query: Float32Array | number[],
    options: SearchOptions & { outcome_weight?: number }
  ): Promise<SearchResult<T>[]> {
    const results = await this.search<T>(namespace, query, options);

    // Apply outcome weighting if specified
    if (options.outcome_weight) {
      for (const result of results) {
        const outcomeScore = (result.metadata as Record<string, unknown>)['outcome_score'];
        if (typeof outcomeScore === 'number') {
          result.score = result.score * (1 - options.outcome_weight) +
                         outcomeScore * options.outcome_weight;
        }
      }
      results.sort((a, b) => b.score - a.score);
    }

    return results;
  }

  // =========== Utility Methods ===========

  /**
   * Get namespace statistics
   */
  async getNamespaceStats(namespace: string): Promise<{
    vector_count: number;
    edge_count: number;
  }> {
    this.ensureInitialized();
    const ns = this.namespaces.get(namespace);
    return {
      vector_count: ns?.vectors.size ?? 0,
      edge_count: ns?.causalEdges.size ?? 0,
    };
  }

  /**
   * Flush changes to disk (if persistence enabled)
   */
  async flush(): Promise<void> {
    this.ensureInitialized();
    if (this.config.persistence?.enabled) {
      // In production, this would serialize and write to disk
      console.log('[RuvectorClient] Flushing to disk...');
    }
  }

  /**
   * Close the client
   */
  async close(): Promise<void> {
    await this.flush();
    this.namespaces.clear();
    this.reflexions.clear();
    this.skills.clear();
    this.initialized = false;
    console.log('[RuvectorClient] Closed');
  }
}

/**
 * Create a Ruvector client with default configuration
 */
export function createRuvectorClient(config?: Partial<RuvectorConfig>): RuvectorClient {
  const defaultConfig: RuvectorConfig = {
    path: process.env['RUVECTOR_PATH'] ?? './data/ruvector',
    dimensions: parseInt(process.env['RUVECTOR_DIMENSIONS'] ?? '1536', 10),
    metric: (process.env['RUVECTOR_METRIC'] as RuvectorConfig['metric']) ?? 'cosine',
    hnsw: {
      m: parseInt(process.env['RUVECTOR_HNSW_M'] ?? '16', 10),
      ef_construction: parseInt(process.env['RUVECTOR_HNSW_EF_CONSTRUCTION'] ?? '200', 10),
      ef_search: parseInt(process.env['RUVECTOR_HNSW_EF_SEARCH'] ?? '100', 10),
    },
    quantization: {
      enabled: true,
      type: 'product',
      num_subvectors: 8,
    },
    persistence: {
      enabled: true,
      sync_interval_ms: 1000,
    },
  };

  return new RuvectorClient({ ...defaultConfig, ...config });
}

// Singleton instance
let _client: RuvectorClient | null = null;

/**
 * Get the singleton Ruvector client
 */
export function getRuvectorClient(): RuvectorClient {
  if (!_client) {
    _client = createRuvectorClient();
  }
  return _client;
}

/**
 * Set a custom Ruvector client (for testing)
 */
export function setRuvectorClient(client: RuvectorClient): void {
  _client = client;
}
