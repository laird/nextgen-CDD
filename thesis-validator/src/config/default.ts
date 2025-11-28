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
    provider: 'anthropic' as const,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 60000,
  },

  // Embedding Configuration
  embedding: {
    provider: 'openai' as const,
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
    cacheEnabled: true,
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
