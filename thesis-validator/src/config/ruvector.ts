/**
 * Ruvector Configuration
 *
 * Configuration for vector database collections and indexing
 */

import { defaultConfig } from './default.js';

/**
 * Collection schema definitions
 */
export interface CollectionSchema {
  name: string;
  vectorSize: number;
  distanceMetric: 'Cosine' | 'Euclidean' | 'Dot';
  hnswConfig: {
    m: number;
    efConstruct: number;
  };
  payloadSchema: Record<string, PayloadFieldConfig>;
  indexes: IndexConfig[];
}

/**
 * Payload field configuration
 */
export interface PayloadFieldConfig {
  type: 'keyword' | 'integer' | 'float' | 'bool' | 'text' | 'datetime';
  indexed: boolean;
  stored: boolean;
}

/**
 * Index configuration
 */
export interface IndexConfig {
  field: string;
  type: 'keyword' | 'integer' | 'float' | 'text' | 'datetime';
}

/**
 * Collection schemas for Thesis Validator
 */
export const collectionSchemas: Record<string, CollectionSchema> = {
  hypotheses: {
    name: defaultConfig.ruvector.collections.hypotheses,
    vectorSize: 1536,
    distanceMetric: 'Cosine',
    hnswConfig: {
      m: 16,
      efConstruct: 200,
    },
    payloadSchema: {
      engagement_id: { type: 'keyword', indexed: true, stored: true },
      hypothesis_id: { type: 'keyword', indexed: true, stored: true },
      statement: { type: 'text', indexed: true, stored: true },
      type: { type: 'keyword', indexed: true, stored: true },
      status: { type: 'keyword', indexed: true, stored: true },
      confidence: { type: 'float', indexed: true, stored: true },
      parent_id: { type: 'keyword', indexed: true, stored: true },
      created_at: { type: 'datetime', indexed: true, stored: true },
      updated_at: { type: 'datetime', indexed: true, stored: true },
    },
    indexes: [
      { field: 'engagement_id', type: 'keyword' },
      { field: 'type', type: 'keyword' },
      { field: 'status', type: 'keyword' },
      { field: 'confidence', type: 'float' },
    ],
  },

  evidence: {
    name: defaultConfig.ruvector.collections.evidence,
    vectorSize: 1536,
    distanceMetric: 'Cosine',
    hnswConfig: {
      m: 16,
      efConstruct: 200,
    },
    payloadSchema: {
      engagement_id: { type: 'keyword', indexed: true, stored: true },
      evidence_id: { type: 'keyword', indexed: true, stored: true },
      content: { type: 'text', indexed: true, stored: true },
      source_type: { type: 'keyword', indexed: true, stored: true },
      source_url: { type: 'keyword', indexed: false, stored: true },
      sentiment: { type: 'keyword', indexed: true, stored: true },
      credibility_score: { type: 'float', indexed: true, stored: true },
      hypothesis_ids: { type: 'keyword', indexed: true, stored: true },
      collected_at: { type: 'datetime', indexed: true, stored: true },
    },
    indexes: [
      { field: 'engagement_id', type: 'keyword' },
      { field: 'source_type', type: 'keyword' },
      { field: 'sentiment', type: 'keyword' },
      { field: 'credibility_score', type: 'float' },
    ],
  },

  skills: {
    name: defaultConfig.ruvector.collections.skills,
    vectorSize: 1536,
    distanceMetric: 'Cosine',
    hnswConfig: {
      m: 16,
      efConstruct: 100,
    },
    payloadSchema: {
      skill_id: { type: 'keyword', indexed: true, stored: true },
      name: { type: 'text', indexed: true, stored: true },
      description: { type: 'text', indexed: true, stored: true },
      category: { type: 'keyword', indexed: true, stored: true },
      version: { type: 'keyword', indexed: true, stored: true },
      success_rate: { type: 'float', indexed: true, stored: true },
      usage_count: { type: 'integer', indexed: true, stored: true },
      created_at: { type: 'datetime', indexed: true, stored: true },
      updated_at: { type: 'datetime', indexed: true, stored: true },
    },
    indexes: [
      { field: 'category', type: 'keyword' },
      { field: 'success_rate', type: 'float' },
      { field: 'usage_count', type: 'integer' },
    ],
  },

  reflexion: {
    name: defaultConfig.ruvector.collections.reflexion,
    vectorSize: 1536,
    distanceMetric: 'Cosine',
    hnswConfig: {
      m: 16,
      efConstruct: 100,
    },
    payloadSchema: {
      episode_id: { type: 'keyword', indexed: true, stored: true },
      task_type: { type: 'keyword', indexed: true, stored: true },
      outcome_score: { type: 'float', indexed: true, stored: true },
      was_successful: { type: 'bool', indexed: true, stored: true },
      sector: { type: 'keyword', indexed: true, stored: true },
      deal_type: { type: 'keyword', indexed: true, stored: true },
      thesis_pattern: { type: 'text', indexed: true, stored: true },
      created_at: { type: 'datetime', indexed: true, stored: true },
    },
    indexes: [
      { field: 'task_type', type: 'keyword' },
      { field: 'was_successful', type: 'keyword' },
      { field: 'sector', type: 'keyword' },
      { field: 'outcome_score', type: 'float' },
    ],
  },

  patterns: {
    name: defaultConfig.ruvector.collections.patterns,
    vectorSize: 1536,
    distanceMetric: 'Cosine',
    hnswConfig: {
      m: 16,
      efConstruct: 100,
    },
    payloadSchema: {
      pattern_id: { type: 'keyword', indexed: true, stored: true },
      description: { type: 'text', indexed: true, stored: true },
      thesis_pattern: { type: 'text', indexed: true, stored: true },
      sector: { type: 'keyword', indexed: true, stored: true },
      deal_type: { type: 'keyword', indexed: true, stored: true },
      confidence: { type: 'float', indexed: true, stored: true },
      occurrence_count: { type: 'integer', indexed: true, stored: true },
      created_at: { type: 'datetime', indexed: true, stored: true },
    },
    indexes: [
      { field: 'sector', type: 'keyword' },
      { field: 'deal_type', type: 'keyword' },
      { field: 'confidence', type: 'float' },
    ],
  },

  market: {
    name: defaultConfig.ruvector.collections.market,
    vectorSize: 1536,
    distanceMetric: 'Cosine',
    hnswConfig: {
      m: 16,
      efConstruct: 100,
    },
    payloadSchema: {
      signal_id: { type: 'keyword', indexed: true, stored: true },
      content: { type: 'text', indexed: true, stored: true },
      source: { type: 'keyword', indexed: true, stored: true },
      sector: { type: 'keyword', indexed: true, stored: true },
      signal_type: { type: 'keyword', indexed: true, stored: true },
      strength: { type: 'float', indexed: true, stored: true },
      timestamp: { type: 'datetime', indexed: true, stored: true },
      expires_at: { type: 'datetime', indexed: true, stored: true },
    },
    indexes: [
      { field: 'sector', type: 'keyword' },
      { field: 'signal_type', type: 'keyword' },
      { field: 'strength', type: 'float' },
      { field: 'timestamp', type: 'datetime' },
    ],
  },
};

/**
 * Get collection schema by name
 */
export function getCollectionSchema(collectionKey: keyof typeof defaultConfig.ruvector.collections): CollectionSchema {
  return collectionSchemas[collectionKey]!;
}

/**
 * Generate collection creation payload for Ruvector API
 */
export function generateCollectionPayload(schema: CollectionSchema): object {
  return {
    name: schema.name,
    vectors: {
      size: schema.vectorSize,
      distance: schema.distanceMetric,
    },
    hnsw_config: {
      m: schema.hnswConfig.m,
      ef_construct: schema.hnswConfig.efConstruct,
    },
    payload_schema: schema.payloadSchema,
  };
}

/**
 * Ruvector client configuration
 */
export const ruvectorClientConfig = {
  host: process.env['RUVECTOR_HOST'] ?? defaultConfig.ruvector.host,
  port: parseInt(process.env['RUVECTOR_PORT'] ?? String(defaultConfig.ruvector.port), 10),
  useTls: process.env['RUVECTOR_TLS'] === 'true' || defaultConfig.ruvector.useTls,
  apiKey: process.env['RUVECTOR_API_KEY'],
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};
