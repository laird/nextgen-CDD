/**
 * Embedding Tool - Vector embedding generation using OpenAI or Vertex AI
 *
 * Provides text-to-vector conversion for semantic search and similarity.
 * Supports batch processing and caching for efficiency.
 */

import OpenAI from 'openai';
import { createHash } from 'crypto';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import type { google } from '@google-cloud/aiplatform/build/protos/protos.js';

type IValue = google.protobuf.IValue;

/**
 * Embedding provider type
 */
export type EmbeddingProvider = 'openai' | 'vertex-ai';

/**
 * Vertex AI task types for embeddings
 */
export type VertexTaskType =
  | 'RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING'
  | 'QUESTION_ANSWERING'
  | 'FACT_VERIFICATION';

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  maxTokens: number;
  batchSize: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  // Vertex AI specific
  projectId: string;
  region: string;
  taskType: VertexTaskType;
}

/**
 * Get default embedding configuration from environment
 */
function getDefaultConfig(): EmbeddingConfig {
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  if (!projectId && (process.env['EMBEDDING_PROVIDER'] ?? 'vertex-ai') === 'vertex-ai') {
    console.warn('[EmbeddingService] GOOGLE_CLOUD_PROJECT not set, Vertex AI embeddings may fail');
  }

  return {
    provider: (process.env['EMBEDDING_PROVIDER'] as EmbeddingProvider) ?? 'vertex-ai',
    model: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-005',
    dimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '768', 10),
    maxTokens: 3072,
    batchSize: 5, // Vertex AI has a limit of 5 texts per request
    cacheEnabled: true,
    cacheTtlMs: 60 * 60 * 1000, // 1 hour
    // Vertex AI specific
    projectId: projectId ?? '',
    region: process.env['EMBEDDING_REGION'] ?? 'us-central1',
    taskType: (process.env['EMBEDDING_TASK_TYPE'] as VertexTaskType) ?? 'RETRIEVAL_DOCUMENT',
  };
}

/**
 * Cache entry for embeddings
 */
interface CacheEntry {
  embedding: Float32Array;
  timestamp: number;
}

/**
 * Embedding statistics
 */
export interface EmbeddingStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  totalTokensUsed: number;
  averageLatencyMs: number;
}

/**
 * Embedding Service - supports both OpenAI and Vertex AI
 */
export class EmbeddingService {
  private openaiClient: OpenAI | null = null;
  private vertexClient: PredictionServiceClient | null = null;
  private config: EmbeddingConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private stats: EmbeddingStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalTokensUsed: 0,
    averageLatencyMs: 0,
  };
  private totalLatency = 0;

  constructor(config?: Partial<EmbeddingConfig>) {
    const defaultConfig = getDefaultConfig();
    this.config = { ...defaultConfig, ...config };
    this.initializeClient();
  }

  /**
   * Initialize the appropriate client based on provider
   */
  private initializeClient(): void {
    if (this.config.provider === 'openai') {
      this.openaiClient = new OpenAI({
        apiKey: process.env['OPENAI_API_KEY'],
      });
      console.log('[EmbeddingService] Initialized OpenAI client');
    } else {
      const apiEndpoint = `${this.config.region}-aiplatform.googleapis.com`;
      this.vertexClient = new PredictionServiceClient({
        apiEndpoint,
      });
      console.log(
        `[EmbeddingService] Initialized Vertex AI client for project: ${this.config.projectId}, region: ${this.config.region}`
      );
    }
  }

  /**
   * Generate embedding hash for caching
   */
  private getHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Check if cache entry is valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.config.cacheTtlMs;
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp >= this.config.cacheTtlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Embed a single text
   */
  async embed(text: string): Promise<Float32Array> {
    this.stats.totalRequests++;

    // Check cache
    if (this.config.cacheEnabled) {
      const hash = this.getHash(text);
      const cached = this.cache.get(hash);
      if (cached && this.isCacheValid(cached)) {
        this.stats.cacheHits++;
        return cached.embedding;
      }
      this.stats.cacheMisses++;
    }

    const startTime = Date.now();
    let embedding: Float32Array;

    try {
      if (this.config.provider === 'openai') {
        embedding = await this.embedWithOpenAI(text);
      } else {
        embedding = await this.embedWithVertexAI(text);
      }

      const latency = Date.now() - startTime;
      this.totalLatency += latency;
      this.stats.averageLatencyMs = this.totalLatency / this.stats.totalRequests;

      // Cache result
      if (this.config.cacheEnabled) {
        const hash = this.getHash(text);
        this.cache.set(hash, {
          embedding,
          timestamp: Date.now(),
        });

        // Periodic cache cleanup
        if (this.cache.size > 10000) {
          this.cleanCache();
        }
      }

      return embedding;
    } catch (error) {
      console.error('[EmbeddingService] Error embedding text:', error);
      throw error;
    }
  }

  /**
   * Embed text using OpenAI
   */
  private async embedWithOpenAI(text: string): Promise<Float32Array> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openaiClient.embeddings.create({
      model: this.config.model,
      input: text,
      dimensions: this.config.dimensions,
    });

    this.stats.totalTokensUsed += response.usage?.total_tokens ?? 0;
    return new Float32Array(response.data[0]!.embedding);
  }

  /**
   * Embed text using Vertex AI
   */
  private async embedWithVertexAI(text: string): Promise<Float32Array> {
    if (!this.vertexClient) {
      throw new Error('Vertex AI client not initialized');
    }

    const endpoint = `projects/${this.config.projectId}/locations/${this.config.region}/publishers/google/models/${this.config.model}`;

    const instance = helpers.toValue({
      content: text,
      task_type: this.config.taskType,
    });

    const parameters = helpers.toValue(
      this.config.dimensions ? { outputDimensionality: this.config.dimensions } : {}
    );

    const request = {
      endpoint,
      instances: [instance as IValue],
      parameters: parameters as IValue,
    };

    const response = await this.vertexClient.predict(request);
    const predictions = response[0]?.predictions;

    if (!predictions || predictions.length === 0) {
      throw new Error('No predictions returned from Vertex AI');
    }

    // Extract embedding from response
    const prediction = predictions[0];
    if (!prediction) {
      throw new Error('No prediction returned from Vertex AI');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const embeddingValues = helpers.fromValue(prediction as any);

    // The response structure has embeddings.values containing the vector
    const values = (embeddingValues as { embeddings?: { values?: number[] } })?.embeddings?.values;
    if (!values || !Array.isArray(values)) {
      throw new Error('Invalid embedding response structure from Vertex AI');
    }

    return new Float32Array(values);
  }

  /**
   * Embed multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    // Check cache for all texts first
    const results: (Float32Array | null)[] = new Array(texts.length).fill(null);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    if (this.config.cacheEnabled) {
      for (let i = 0; i < texts.length; i++) {
        const hash = this.getHash(texts[i]!);
        const cached = this.cache.get(hash);
        if (cached && this.isCacheValid(cached)) {
          results[i] = cached.embedding;
          this.stats.cacheHits++;
        } else {
          uncachedIndices.push(i);
          uncachedTexts.push(texts[i]!);
          this.stats.cacheMisses++;
        }
      }
    } else {
      for (let i = 0; i < texts.length; i++) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]!);
      }
    }

    this.stats.totalRequests += texts.length;

    // Batch embed uncached texts
    if (uncachedTexts.length > 0) {
      const embeddings = await this.embedBatchUncached(uncachedTexts);

      for (let i = 0; i < embeddings.length; i++) {
        const originalIndex = uncachedIndices[i]!;
        results[originalIndex] = embeddings[i]!;

        // Cache result
        if (this.config.cacheEnabled) {
          const hash = this.getHash(uncachedTexts[i]!);
          this.cache.set(hash, {
            embedding: embeddings[i]!,
            timestamp: Date.now(),
          });
        }
      }
    }

    return results as Float32Array[];
  }

  /**
   * Batch embed without cache
   */
  private async embedBatchUncached(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const startTime = Date.now();

      try {
        let batchEmbeddings: Float32Array[];

        if (this.config.provider === 'openai') {
          batchEmbeddings = await this.embedBatchWithOpenAI(batch);
        } else {
          batchEmbeddings = await this.embedBatchWithVertexAI(batch);
        }

        const latency = Date.now() - startTime;
        this.totalLatency += latency;

        results.push(...batchEmbeddings);
      } catch (error) {
        console.error('[EmbeddingService] Error in batch embedding:', error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Batch embed using OpenAI
   */
  private async embedBatchWithOpenAI(texts: string[]): Promise<Float32Array[]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openaiClient.embeddings.create({
      model: this.config.model,
      input: texts,
      dimensions: this.config.dimensions,
    });

    this.stats.totalTokensUsed += response.usage?.total_tokens ?? 0;

    return response.data.map((d) => new Float32Array(d.embedding));
  }

  /**
   * Batch embed using Vertex AI
   */
  private async embedBatchWithVertexAI(texts: string[]): Promise<Float32Array[]> {
    if (!this.vertexClient) {
      throw new Error('Vertex AI client not initialized');
    }

    const endpoint = `projects/${this.config.projectId}/locations/${this.config.region}/publishers/google/models/${this.config.model}`;

    const instances: IValue[] = texts.map((text) =>
      helpers.toValue({
        content: text,
        task_type: this.config.taskType,
      }) as IValue
    );

    const parameters = helpers.toValue(
      this.config.dimensions ? { outputDimensionality: this.config.dimensions } : {}
    ) as IValue;

    const request = {
      endpoint,
      instances,
      parameters,
    };

    const response = await this.vertexClient.predict(request);
    const predictions = response[0]?.predictions;

    if (!predictions || predictions.length === 0) {
      throw new Error('No predictions returned from Vertex AI');
    }

    return predictions.map((prediction) => {
      if (!prediction) {
        throw new Error('Empty prediction in Vertex AI response');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const embeddingValues = helpers.fromValue(prediction as any);
      const values = (embeddingValues as { embeddings?: { values?: number[] } })?.embeddings?.values;
      if (!values || !Array.isArray(values)) {
        throw new Error('Invalid embedding response structure from Vertex AI');
      }
      return new Float32Array(values);
    });
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  /**
   * Find most similar embedding
   */
  findMostSimilar(
    query: Float32Array,
    candidates: Float32Array[],
    topK = 5
  ): Array<{ index: number; score: number }> {
    const scores = candidates.map((candidate, index) => ({
      index,
      score: this.cosineSimilarity(query, candidate),
    }));

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Get statistics
   */
  getStats(): EmbeddingStats {
    this.stats.averageLatencyMs =
      this.stats.totalRequests > 0 ? this.totalLatency / this.stats.totalRequests : 0;
    return { ...this.stats };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get current provider
   */
  getProvider(): EmbeddingProvider {
    return this.config.provider;
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.config.model;
  }
}

// Singleton instance
let _embeddingService: EmbeddingService | null = null;

/**
 * Get the singleton Embedding Service
 */
export function getEmbeddingService(): EmbeddingService {
  if (!_embeddingService) {
    _embeddingService = new EmbeddingService();
  }
  return _embeddingService;
}

/**
 * Set a custom Embedding Service (for testing)
 */
export function setEmbeddingService(service: EmbeddingService): void {
  _embeddingService = service;
}

/**
 * Helper function to embed text
 */
export async function embed(text: string): Promise<Float32Array> {
  return getEmbeddingService().embed(text);
}

/**
 * Helper function to embed multiple texts
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  return getEmbeddingService().embedBatch(texts);
}
