/**
 * Embedding Tool - Vector embedding generation using OpenAI
 *
 * Provides text-to-vector conversion for semantic search and similarity.
 * Supports batch processing and caching for efficiency.
 */

import OpenAI from 'openai';
import { createHash } from 'crypto';

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  maxTokens: number;
  batchSize: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}

/**
 * Default embedding configuration
 */
const defaultConfig: EmbeddingConfig = {
  model: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-large',
  dimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '3072', 10),
  maxTokens: 8191,
  batchSize: 100,
  cacheEnabled: true,
  cacheTtlMs: 60 * 60 * 1000, // 1 hour
};

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
 * Embedding Service
 */
export class EmbeddingService {
  private client: OpenAI;
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
    this.config = { ...defaultConfig, ...config };
    this.client = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
    });
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

    try {
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: text,
        dimensions: this.config.dimensions,
      });

      const embedding = new Float32Array(response.data[0]!.embedding);
      const latency = Date.now() - startTime;

      // Update stats
      this.totalLatency += latency;
      this.stats.averageLatencyMs = this.totalLatency / this.stats.totalRequests;
      this.stats.totalTokensUsed += response.usage?.total_tokens ?? 0;

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
        const response = await this.client.embeddings.create({
          model: this.config.model,
          input: batch,
          dimensions: this.config.dimensions,
        });

        const latency = Date.now() - startTime;
        this.totalLatency += latency;
        this.stats.totalTokensUsed += response.usage?.total_tokens ?? 0;

        for (const data of response.data) {
          results.push(new Float32Array(data.embedding));
        }
      } catch (error) {
        console.error('[EmbeddingService] Error in batch embedding:', error);
        throw error;
      }
    }

    return results;
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

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Get statistics
   */
  getStats(): EmbeddingStats {
    this.stats.averageLatencyMs = this.stats.totalRequests > 0
      ? this.totalLatency / this.stats.totalRequests
      : 0;
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
