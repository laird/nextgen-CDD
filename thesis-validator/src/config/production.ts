/**
 * Production Configuration
 *
 * Configuration overrides for production environment
 */

import { defaultConfig, type Config } from './default.js';

/**
 * Deep merge utility
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Production configuration overrides
 */
const productionOverrides: Partial<Config> = {
  api: {
    host: '0.0.0.0',
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    logLevel: 'warn',
    corsOrigins: process.env['CORS_ORIGINS']?.split(',') ?? [],
    rateLimitMax: 50, // Stricter rate limiting in production
    rateLimitWindow: '1 minute',
  },

  llm: {
    provider: 'anthropic',
    model: process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.5, // Lower temperature for more consistent outputs
    timeout: 120000, // Longer timeout for production
  },

  ruvector: {
    host: process.env['RUVECTOR_HOST'] ?? 'ruvector',
    port: parseInt(process.env['RUVECTOR_PORT'] ?? '6333', 10),
    useTls: process.env['RUVECTOR_TLS'] === 'true',
    collections: {
      hypotheses: process.env['RUVECTOR_COLLECTION_PREFIX']
        ? `${process.env['RUVECTOR_COLLECTION_PREFIX']}_hypotheses`
        : 'prod_thesis_validator_hypotheses',
      evidence: process.env['RUVECTOR_COLLECTION_PREFIX']
        ? `${process.env['RUVECTOR_COLLECTION_PREFIX']}_evidence`
        : 'prod_thesis_validator_evidence',
      skills: process.env['RUVECTOR_COLLECTION_PREFIX']
        ? `${process.env['RUVECTOR_COLLECTION_PREFIX']}_skills`
        : 'prod_thesis_validator_skills',
      reflexion: process.env['RUVECTOR_COLLECTION_PREFIX']
        ? `${process.env['RUVECTOR_COLLECTION_PREFIX']}_reflexion`
        : 'prod_thesis_validator_reflexion',
      patterns: process.env['RUVECTOR_COLLECTION_PREFIX']
        ? `${process.env['RUVECTOR_COLLECTION_PREFIX']}_patterns`
        : 'prod_thesis_validator_patterns',
      market: process.env['RUVECTOR_COLLECTION_PREFIX']
        ? `${process.env['RUVECTOR_COLLECTION_PREFIX']}_market`
        : 'prod_thesis_validator_market',
    },
  },

  memory: {
    deal: {
      maxDocumentsPerEngagement: 5000,
      chunkSize: 1000,
      chunkOverlap: 200,
    },
    institutional: {
      patternRetentionDays: 365 * 5, // 5 years in production
      minPatternConfidence: 0.7, // Higher threshold in production
    },
    market: {
      signalRetentionDays: 180, // 6 months
      temporalDecayHalfLife: 45,
    },
  },

  agents: {
    conductor: {
      maxConcurrentAgents: 10, // Allow more concurrency in production
      taskTimeout: 600000, // 10 minutes
    },
    hypothesisBuilder: {
      maxHypothesesPerLevel: 7,
      maxDepth: 4,
    },
    evidenceGatherer: {
      minSourcesPerHypothesis: 5,
      maxSourcesPerHypothesis: 15,
    },
    contradictionHunter: {
      aggressiveness: 0.8,
      requiredContradictions: 5,
    },
  },

  security: {
    jwtSecret: process.env['JWT_SECRET'] ?? '', // Must be set in production
    jwtExpiresIn: '8h', // Shorter session in production
    bcryptRounds: 12,
  },

  logging: {
    level: 'warn',
    format: 'json',
    includeTimestamp: true,
  },
};

/**
 * Validate production configuration
 */
function validateProductionConfig(): void {
  const requiredEnvVars = [
    'JWT_SECRET',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
  ];

  const missing = requiredEnvVars.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for production: ${missing.join(', ')}`
    );
  }

  if ((process.env['JWT_SECRET']?.length ?? 0) < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
}

/**
 * Get production configuration
 */
export function getProductionConfig(): Config {
  validateProductionConfig();
  return deepMerge(defaultConfig, productionOverrides);
}

export const productionConfig = productionOverrides;
