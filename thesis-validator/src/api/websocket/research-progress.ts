/**
 * WebSocket Research Progress Handler
 *
 * Real-time progress streaming for research jobs using Redis pub/sub
 */

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

// Redis connection for pub/sub
const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];

const redisSub = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
});

const redisPub = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
});

/**
 * Publish progress event to Redis channel
 */
export async function publishProgressEvent(jobId: string, event: ProgressEvent): Promise<void> {
  const channel = `research:progress:${jobId}`;
  await redisPub.publish(channel, JSON.stringify(event));
}

/**
 * Subscribe to progress events for a job
 */
function subscribeToJob(jobId: string): void {
  const channel = `research:progress:${jobId}`;

  // Check if already subscribed
  if (progressConnections.has(jobId)) {
    return;
  }

  // Subscribe to Redis channel
  redisSub.subscribe(channel, (error) => {
    if (error) {
      console.error(`[ResearchProgress] Failed to subscribe to ${channel}:`, error);
    } else {
      console.log(`[ResearchProgress] Subscribed to ${channel}`);
    }
  });
}

/**
 * Unsubscribe from job progress when no more connections
 */
function unsubscribeFromJob(jobId: string): void {
  const channel = `research:progress:${jobId}`;

  if (!progressConnections.has(jobId) || progressConnections.get(jobId)!.length === 0) {
    redisSub.unsubscribe(channel, (error) => {
      if (error) {
        console.error(`[ResearchProgress] Failed to unsubscribe from ${channel}:`, error);
      } else {
        console.log(`[ResearchProgress] Unsubscribed from ${channel}`);
      }
    });
  }
}

/**
 * Handle incoming Redis messages
 */
redisSub.on('message', (channel: string, message: string) => {
  // Extract jobId from channel name (format: research:progress:<jobId>)
  const match = channel.match(/^research:progress:(.+)$/);
  if (!match) return;

  const jobId = match[1];
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
});

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

      if (!token) {
        socket.close(4001, 'Authentication required');
        return;
      }

      // Verify token
      let user;
      try {
        user = decodeToken(token);
        if (!user) {
          socket.close(4003, 'Invalid token');
          return;
        }
      } catch (error) {
        socket.close(4003, 'Invalid token');
        return;
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

      // Subscribe to Redis channel for this job
      subscribeToJob(jobId);

      console.log(`[ResearchProgress] Client connected to job ${jobId} (user: ${user.id})`);

      // Send initial connection confirmation
      socket.send(JSON.stringify({
        type: 'connected',
        payload: {
          jobId,
          timestamp: Date.now(),
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

  // Close Redis connections
  await redisSub.quit();
  await redisPub.quit();
}
