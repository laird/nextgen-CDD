/**
 * API Layer - Main Entry Point
 *
 * Fastify server setup with all routes and WebSocket handlers
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerAuth } from './middleware/index.js';
import {
  registerEngagementRoutes,
  registerResearchRoutes,
  registerEvidenceRoutes,
  registerSkillsRoutes,
  registerHypothesesRoutes,
  registerContradictionRoutes,
  registerMetricsRoutes,
  registerStressTestRoutes,
} from './routes/index.js';
import {
  registerEventWebSocket,
  registerExpertCallWebSocket,
  registerResearchProgressWebSocket,
  getConnectionStats,
  getActiveSessions,
  getProgressStats,
} from './websocket/index.js';

/**
 * API server configuration
 */
export interface APIConfig {
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindow: string;
}

/**
 * Default API configuration
 */
export const defaultAPIConfig: APIConfig = {
  host: '0.0.0.0',
  port: 3000,
  logLevel: 'info',
  corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  rateLimitMax: 100,
  rateLimitWindow: '1 minute',
};

/**
 * Create and configure Fastify server
 */
export async function createServer(config: Partial<APIConfig> = {}): Promise<FastifyInstance> {
  const finalConfig = { ...defaultAPIConfig, ...config };

  const fastify = Fastify({
    logger: {
      level: finalConfig.logLevel,
    },
  });

  // Disable schema validation temporarily to get server running
  // TODO: Implement proper Zod-to-JSON-Schema conversion
  fastify.setValidatorCompiler(() => {
    return (data) => ({ value: data });
  });

  fastify.setSerializerCompiler(() => {
    return (data) => JSON.stringify(data);
  });

  // Security plugins
  // TODO: Fix helmet version compatibility with Fastify 4.x
  // await fastify.register(helmet, {
  //   contentSecurityPolicy: false, // Disable for API
  // });

  await fastify.register(cors, {
    origin: finalConfig.corsOrigins,
    credentials: true,
  });

  // TODO: Fix rate-limit version compatibility with Fastify 4.x
  // await fastify.register(rateLimit, {
  //   max: finalConfig.rateLimitMax,
  //   timeWindow: finalConfig.rateLimitWindow,
  // });

  // TODO: Fix multipart version compatibility with Fastify 4.x
  // Multipart for file uploads
  // await fastify.register(multipart, {
  //   limits: {
  //     fileSize: 50 * 1024 * 1024, // 50MB
  //   },
  // });

  // Authentication
  await registerAuth(fastify);

  // Health check endpoint
  fastify.get('/health', async () => ({
    status: 'healthy',
    timestamp: Date.now(),
    version: process.env['npm_package_version'] ?? '1.0.0',
  }));

  // Metrics endpoint (for monitoring)
  fastify.get('/metrics', async () => {
    const wsStats = getConnectionStats();
    const expertSessions = getActiveSessions();
    const progressStats = getProgressStats();

    return {
      timestamp: Date.now(),
      websocket: {
        total_connections: wsStats.totalConnections,
        connections_by_engagement: wsStats.connectionsByEngagement,
      },
      expert_calls: {
        active_sessions: expertSessions.count,
        sessions: expertSessions.sessions,
      },
      research_progress: {
        total_connections: progressStats.totalConnections,
        connections_by_job: progressStats.connectionsByJob,
      },
      memory: {
        heap_used: process.memoryUsage().heapUsed,
        heap_total: process.memoryUsage().heapTotal,
        rss: process.memoryUsage().rss,
      },
      uptime: process.uptime(),
    };
  });

  // Register REST routes
  await fastify.register(
    async (instance) => {
      await registerEngagementRoutes(instance);
    },
    { prefix: '/api/v1/engagements' }
  );

  await fastify.register(
    async (instance) => {
      await registerResearchRoutes(instance);
    },
    { prefix: '/api/v1/engagements' }
  );

  await fastify.register(
    async (instance) => {
      await registerEvidenceRoutes(instance);
    },
    { prefix: '/api/v1/engagements' }
  );

  await fastify.register(
    async (instance) => {
      await registerSkillsRoutes(instance);
    },
    { prefix: '/api/v1/skills' }
  );

  await fastify.register(
    async (instance) => {
      await registerHypothesesRoutes(instance);
    },
    { prefix: '/api/v1/engagements' }
  );

  await fastify.register(
    async (instance) => {
      await registerContradictionRoutes(instance);
    },
    { prefix: '/api/v1/engagements' }
  );

  await fastify.register(
    async (instance) => {
      await registerMetricsRoutes(instance);
    },
    { prefix: '/api/v1/engagements' }
  );

  await fastify.register(
    async (instance) => {
      await registerStressTestRoutes(instance);
    },
    { prefix: '/api/v1/engagements' }
  );

  // Register WebSocket plugin (once for all WebSocket handlers)
  await fastify.register(import('@fastify/websocket'));

  // Register WebSocket handlers
  await registerEventWebSocket(fastify);
  await registerExpertCallWebSocket(fastify);
  await registerResearchProgressWebSocket(fastify);

  // Global error handler
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    // Handle validation errors
    if (error.validation) {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: error.validation,
      });
      return;
    }

    // Handle known error codes
    if (error.statusCode) {
      reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
      return;
    }

    // Generic error
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  return fastify;
}

/**
 * Start the API server
 */
export async function startServer(config: Partial<APIConfig> = {}): Promise<FastifyInstance> {
  const finalConfig = { ...defaultAPIConfig, ...config };
  const fastify = await createServer(config);

  try {
    await fastify.listen({
      host: finalConfig.host,
      port: finalConfig.port,
    });

    fastify.log.info(`Server listening on ${finalConfig.host}:${finalConfig.port}`);

    return fastify;
  } catch (error) {
    fastify.log.error(error);
    throw error;
  }
}

/**
 * Graceful shutdown
 */
export async function stopServer(fastify: FastifyInstance): Promise<void> {
  fastify.log.info('Shutting down server...');
  await fastify.close();
  fastify.log.info('Server stopped');
}

// Re-export middleware and routes
export * from './middleware/index.js';
export * from './routes/index.js';
export * from './websocket/index.js';
