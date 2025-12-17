/**
 * Default Configuration
 *
 * Base configuration for all environments
 */

export const defaultConfig = {
  // API Server
  api: {
    host: '0.0.0.0',
    port: 3000,
    logLevel: 'info' as const,
    corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
    rateLimitMax: 100,
    rateLimitWindow: '1 minute',
  },

  // LLM Configuration
  llm: {
    provider: (process.env['LLM_PROVIDER'] ?? 'anthropic') as 'anthropic' | 'vertex-ai',
    model: 'claude-opus-4-5@20251101',
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 60000,
  },

  // Vertex AI Configuration (Google Cloud)
  vertexAi: {
    projectId: process.env['GOOGLE_CLOUD_PROJECT'] ?? '',
    region: process.env['GOOGLE_CLOUD_REGION'] ?? 'us-central1',
    // Model mapping for Vertex AI (uses same Claude models)
    modelMapping: {
      'claude-opus-4-5@20251101': 'claude-opus-4-5@20251101',
      'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-v2@20241022',
      'claude-3-haiku-20240307': 'claude-3-haiku@20240307',
      'claude-3-opus-20240229': 'claude-3-opus@20240229',
    },
  },

  // Embedding Configuration
  embedding: {
    provider: (process.env['EMBEDDING_PROVIDER'] ?? 'vertex-ai') as 'openai' | 'vertex-ai',
    // Vertex AI: text-embedding-005, text-multilingual-embedding-002, gemini-embedding-001
    // OpenAI: text-embedding-3-small, text-embedding-3-large
    model: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-005',
    // Vertex AI default: 768, OpenAI text-embedding-3-large: 3072
    dimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '768', 10),
    batchSize: 5, // Vertex AI limit is 5 texts per request
    cacheEnabled: true,
    // Vertex AI specific
    region: process.env['EMBEDDING_REGION'] ?? 'us-central1',
    taskType: process.env['EMBEDDING_TASK_TYPE'] ?? 'RETRIEVAL_DOCUMENT',
  },

  // Ruvector Configuration
  ruvector: {
    host: 'localhost',
    port: 6333,
    useTls: false,
    collections: {
      hypotheses: 'thesis_validator_hypotheses',
      evidence: 'thesis_validator_evidence',
      skills: 'thesis_validator_skills',
      reflexion: 'thesis_validator_reflexion',
      patterns: 'thesis_validator_patterns',
      market: 'thesis_validator_market',
    },
  },

  // Memory Configuration
  memory: {
    // Deal Memory
    deal: {
      maxDocumentsPerEngagement: 1000,
      chunkSize: 1000,
      chunkOverlap: 200,
    },
    // Institutional Memory
    institutional: {
      patternRetentionDays: 365 * 2, // 2 years
      minPatternConfidence: 0.6,
    },
    // Market Intelligence
    market: {
      signalRetentionDays: 90,
      temporalDecayHalfLife: 30, // days
    },
  },

  // Web Search Configuration
  search: {
    provider: 'tavily' as const,
    maxResultsPerQuery: 10,
    includeRawContent: true,
    searchDepth: 'advanced' as const,
  },

  // Agent Configuration
  agents: {
    conductor: {
      maxConcurrentAgents: 5,
      taskTimeout: 300000, // 5 minutes
    },
    hypothesisBuilder: {
      maxHypothesesPerLevel: 5,
      maxDepth: 3,
    },
    evidenceGatherer: {
      minSourcesPerHypothesis: 3,
      maxSourcesPerHypothesis: 10,
    },
    contradictionHunter: {
      aggressiveness: 0.7, // 0-1 scale
      requiredContradictions: 3,
    },
  },

  // Workflow Configuration
  workflows: {
    research: {
      defaultDepth: 'standard' as const,
      maxIterations: 10,
    },
    stressTest: {
      defaultIntensity: 'moderate' as const,
      devilAdvocateEnabled: true,
    },
    expertCall: {
      chunkProcessingDelayMs: 100,
      insightThreshold: 0.6,
    },
  },

  // Security Configuration
  security: {
    jwtSecret: 'development-secret-change-in-production',
    jwtExpiresIn: '24h',
    bcryptRounds: 10,
  },

  // Logging Configuration
  logging: {
    level: 'info' as const,
    format: 'json' as const,
    includeTimestamp: true,
  },
};

export type Config = typeof defaultConfig;
