/**
 * Thesis Validator - Main Entry Point
 *
 * Agentic Commercial and Technical Diligence Research System
 * for Private Equity Investment Analysis
 */

// Load environment variables from .env file
import 'dotenv/config';

import { startServer, stopServer, type APIConfig } from './api/index.js';
import { initializeMemorySystems } from './memory/index.js';

/**
 * Application configuration
 */
export interface AppConfig {
  api: Partial<APIConfig>;
  environment: 'development' | 'staging' | 'production';
}

/**
 * Load configuration from environment
 */
function loadConfig(): AppConfig {
  return {
    environment: (process.env['NODE_ENV'] as AppConfig['environment']) ?? 'development',
    api: {
      host: process.env['API_HOST'] ?? '0.0.0.0',
      port: parseInt(process.env['API_PORT'] ?? '3000', 10),
      logLevel: (process.env['LOG_LEVEL'] as 'info' | 'debug' | 'error') ?? 'info',
      corsOrigins: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
      rateLimitMax: parseInt(process.env['RATE_LIMIT_MAX'] ?? '100', 10),
      rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    },
  };
}

/**
 * Main application bootstrap
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Thesis Validator...');

  const config = loadConfig();
  console.log(`Environment: ${config.environment}`);

  // Initialize memory system
  console.log('Initializing memory system...');
  await initializeMemorySystems();

  // Start API server
  console.log('Starting API server...');
  const server = await startServer(config.api);

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      await stopServer(server);
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('✅ Thesis Validator is ready');
}

// Run application
main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

// Re-export everything for library usage (excluding duplicate exports)
export * from './models/index.js';
export * from './tools/index.js';
export * from './agents/index.js';
export * from './workflows/index.js';
export * from './api/index.js';

// Selectively re-export from memory to avoid duplicates
export {
  DealMemory,
  createDealMemory,
  InstitutionalMemory,
  getInstitutionalMemory,
  setInstitutionalMemory,
  MarketIntelligence,
  getMarketIntelligence,
  setMarketIntelligence,
  initializeMemorySystems,
  getMemoryStats,
  RuvectorClient,
  ReflexionStore,
  getReflexionStore,
  SkillLibrary,
  getSkillLibrary,
} from './memory/index.js';
