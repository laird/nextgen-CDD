/**
 * WebSocket Research Progress Handler
 *
 * Real-time progress streaming for research jobs.
 * Uses in-memory EventEmitter when Redis is not available,
 * or Redis pub/sub for multi-process setups.
 */

import { EventEmitter } from 'node:events';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import Redis from 'ioredis';
import { ProgressEventSchema, type ProgressEvent } from '../../models/index.js';
import { decodeToken } from '../middleware/auth.js';

/**
 * Active progress stream connections
 */
interface ProgressConnection {
  socket: WebSocket;
  userId: string;
  jobId: string;
  subscribedAt: number;
}

const progressConnections = new Map<string, ProgressConnection[]>();

// In-memory event emitter for fallback when Redis is unavailable
const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(100); // Allow many concurrent jobs

// Redis connection for pub/sub
const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];

let redisAvailable = false;
let redisSub: Redis | null = null;
let redisPub: Redis | null = null;

// Try to connect to Redis, but fallback to in-memory if unavailable
async function initializeRedis(): Promise<void> {
  try {
    redisPub = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry, just fail
    });

    redisSub = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    // Test connection
    await redisPub.ping();
    redisAvailable = true;
    console.log('[ResearchProgress] Redis connected successfully');

    // Set up Redis message handler
    redisSub.on('message', handleRedisMessage);
  } catch (_error) {
    console.log('[ResearchProgress] Redis not available, using in-memory event emitter for progress events');
    redisAvailable = false;
    redisPub = null;
    redisSub = null;
  }
}

// Initialize Redis on module load (non-blocking)
initializeRedis().catch(() => {
  console.log('[ResearchProgress] Redis initialization failed, continuing with in-memory fallback');
});

/**
 * Handle incoming Redis messages
 */
function handleRedisMessage(channel: string, message: string): void {
  // Extract jobId from channel name (format: research:progress:<jobId>)
  const match = channel.match(/^research:progress:(.+)$/);
  if (!match) return;

  const jobId = match[1];
  if (jobId) {
    broadcastToConnections(jobId, message);
  }
}

/**
 * Broadcast message to all WebSocket connections for a job
 */
function broadcastToConnections(jobId: string, message: string): void {
  const connections = progressConnections.get(jobId) ?? [];
  if (connections.length === 0) return;

  try {
    const event = JSON.parse(message);
    const validatedEvent = ProgressEventSchema.parse(event);

    // Broadcast to all connections for this job
    for (const conn of connections) {
      if (conn.socket.readyState === 1) { // OPEN
        conn.socket.send(JSON.stringify({
          type: 'progress',
          payload: validatedEvent,
        }));
      }
    }
  } catch (error) {
    console.error('[ResearchProgress] Failed to process message:', error);
  }
}

/**
 * Publish progress event - uses Redis if available, otherwise in-memory emitter
 */
export async function publishProgressEvent(jobId: string, event: ProgressEvent): Promise<void> {
  const message = JSON.stringify(event);

  console.log(`[ResearchProgress] Publishing event for job ${jobId}: ${event.type}`);

  if (redisAvailable && redisPub) {
    const channel = `research:progress:${jobId}`;
    await redisPub.publish(channel, message);
  } else {
    // Use in-memory event emitter
    progressEmitter.emit(`progress:${jobId}`, message);
  }
}

/**
 * Subscribe to progress events for a job
 */
function subscribeToJob(jobId: string): void {
  if (redisAvailable && redisSub) {
    const channel = `research:progress:${jobId}`;
    redisSub.subscribe(channel, (error) => {
      if (error) {
        console.error(`[ResearchProgress] Failed to subscribe to ${channel}:`, error);
      } else {
        console.log(`[ResearchProgress] Subscribed to Redis channel ${channel}`);
      }
    });
  } else {
    // Use in-memory event emitter
    const handler = (message: string) => broadcastToConnections(jobId, message);
    progressEmitter.on(`progress:${jobId}`, handler);
    console.log(`[ResearchProgress] Subscribed to in-memory events for job ${jobId}`);
  }
}

/**
 * Unsubscribe from job progress when no more connections
 */
function unsubscribeFromJob(jobId: string): void {
  if (!progressConnections.has(jobId) || progressConnections.get(jobId)!.length === 0) {
    if (redisAvailable && redisSub) {
      const channel = `research:progress:${jobId}`;
      redisSub.unsubscribe(channel, (error) => {
        if (error) {
          console.error(`[ResearchProgress] Failed to unsubscribe from ${channel}:`, error);
        } else {
          console.log(`[ResearchProgress] Unsubscribed from ${channel}`);
        }
      });
    } else {
      // Remove all listeners for this job
      progressEmitter.removeAllListeners(`progress:${jobId}`);
      console.log(`[ResearchProgress] Unsubscribed from in-memory events for job ${jobId}`);
    }
  }
}

/**
 * Register WebSocket route for research progress
 */
export async function registerResearchProgressWebSocket(fastify: FastifyInstance): Promise<void> {
  /**
   * WebSocket endpoint for research job progress
   * WS /research/jobs/:jobId/progress
   */
  fastify.get(
    '/research/jobs/:jobId/progress',
    { websocket: true },
    (socket: WebSocket, request: FastifyRequest<{ Params: { jobId: string } }>) => {
      const { jobId } = request.params;

      // Extract token from query string
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      console.log(`[ResearchProgress] WS Connection attempt: DISABLE_AUTH=${process.env['DISABLE_AUTH']}, Token=${!!token}`);

      let user;

      // Check if auth is disabled (for development)
      if (process.env['DISABLE_AUTH'] === 'true') {
        if (!token) {
          // Use dev user
          user = {
            id: 'dev-user',
            email: 'dev@localhost',
            name: 'Development User',
            role: 'admin',
            permissions: ['*']
          };
        } else {
          // Try to decode if token provided, but don't fail hard if invalid?
          // actually, if auth is disabled, we can still accept a token if valid, or fallback.
          // For simplicity: if auth disabled and no token/invalid token, use dev user.
          try {
            user = decodeToken(token);
          } catch {
            // ignore
          }

          if (!user) {
            user = {
              id: 'dev-user',
              email: 'dev@localhost',
              name: 'Development User',
              role: 'admin',
              permissions: ['*']
            };
          }
        }
      } else {
        // Auth enabled - enforce token
        if (!token) {
          socket.close(4001, 'Authentication required');
          return;
        }

        // Verify token
        try {
          user = decodeToken(token);
          if (!user) {
            socket.close(4003, 'Invalid token');
            return;
          }
        } catch (_error) {
          socket.close(4003, 'Invalid token');
          return;
        }
      }

      // Create connection record
      const connection: ProgressConnection = {
        socket,
        userId: user.id,
        jobId,
        subscribedAt: Date.now(),
      };

      // Add to connections map
      if (!progressConnections.has(jobId)) {
        progressConnections.set(jobId, []);
      }
      progressConnections.get(jobId)!.push(connection);

      // Subscribe to events for this job
      subscribeToJob(jobId);

      console.log(`[ResearchProgress] Client connected to job ${jobId} (user: ${user.id}, redis: ${redisAvailable})`);

      // Send initial connection confirmation
      socket.send(JSON.stringify({
        type: 'connected',
        payload: {
          jobId,
          timestamp: Date.now(),
          redis: redisAvailable,
        },
      }));

      // Handle disconnection
      socket.on('close', () => {
        const connections = progressConnections.get(jobId);
        if (connections) {
          const index = connections.indexOf(connection);
          if (index > -1) {
            connections.splice(index, 1);
          }

          // Clean up if no more connections
          if (connections.length === 0) {
            progressConnections.delete(jobId);
            unsubscribeFromJob(jobId);
          }
        }

        console.log(`[ResearchProgress] Client disconnected from job ${jobId} (user: ${user.id})`);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        console.error(`[ResearchProgress] WebSocket error for job ${jobId}:`, error);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.pong();
      });
    }
  );
}

/**
 * Get active progress connections stats
 */
export function getProgressStats(): {
  totalConnections: number;
  connectionsByJob: Record<string, number>;
  redisAvailable: boolean;
} {
  const connectionsByJob: Record<string, number> = {};
  let totalConnections = 0;

  for (const [jobId, connections] of progressConnections.entries()) {
    connectionsByJob[jobId] = connections.length;
    totalConnections += connections.length;
  }

  return {
    totalConnections,
    connectionsByJob,
    redisAvailable,
  };
}

/**
 * Close all connections for a specific job
 */
export function closeJobConnections(jobId: string, reason?: string): void {
  const connections = progressConnections.get(jobId);
  if (!connections) return;

  for (const conn of connections) {
    try {
      conn.socket.close(1000, reason ?? 'Job completed');
    } catch (error) {
      console.error('[ResearchProgress] Error closing connection:', error);
    }
  }

  progressConnections.delete(jobId);
  unsubscribeFromJob(jobId);
}

/**
 * Cleanup on shutdown
 */
export async function closeProgressWebSocket(): Promise<void> {
  // Close all connections
  for (const [jobId] of progressConnections.entries()) {
    closeJobConnections(jobId, 'Server shutting down');
  }

  // Close Redis connections if available
  if (redisSub) {
    await redisSub.quit();
  }
  if (redisPub) {
    await redisPub.quit();
  }
}
