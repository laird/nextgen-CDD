/**
 * WebSocket Events Handler
 *
 * Real-time event streaming for engagement updates
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import {
  SubscriptionRequestSchema,
  matchesFilter,
  type EngagementEvent,
  type EventFilter,
  type WebSocketMessage,
} from '../../models/index.js';
import { hasEngagementAccess } from '../middleware/index.js';
import { decodeToken } from '../middleware/auth.js';

/**
 * Active WebSocket connections by engagement
 */
interface WebSocketConnection {
  socket: WebSocket;
  userId: string;
  engagementId: string;
  filters: EventFilter;
  subscribedAt: number;
}

const connections = new Map<string, WebSocketConnection[]>();

/**
 * Event bus for publishing events
 */
const eventListeners: ((event: EngagementEvent) => void)[] = [];

/**
 * Subscribe to events
 */
export function onEvent(listener: (event: EngagementEvent) => void): () => void {
  eventListeners.push(listener);
  return () => {
    const index = eventListeners.indexOf(listener);
    if (index > -1) eventListeners.splice(index, 1);
  };
}

/**
 * Publish event to all connected clients
 */
export function publishEvent(event: EngagementEvent): void {
  // Notify internal listeners
  eventListeners.forEach((listener) => listener(event));

  // Send to WebSocket clients
  const engagementConnections = connections.get(event.engagement_id) ?? [];

  for (const conn of engagementConnections) {
    // Check if event matches subscription filter
    if (matchesFilter(event, conn.filters)) {
      const message: WebSocketMessage = {
        type: 'event',
        payload: event,
      };

      try {
        conn.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
      }
    }
  }
}

/**
 * Register WebSocket routes for events
 */
export async function registerEventWebSocket(fastify: FastifyInstance): Promise<void> {
  /**
   * WebSocket endpoint for real-time events
   * WS /engagements/:engagementId/events
   */
  fastify.get(
    '/engagements/:engagementId/events',
    { websocket: true } as any, // Fastify WebSocket plugin typing issue
    (socket: WebSocket, request: FastifyRequest<{ Params: { engagementId: string } }>) => {
      const { engagementId } = request.params;

      // Extract token from query string
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        socket.close(4001, 'Authentication required');
        return;
      }

      // Verify token
      const user = decodeToken(token);
      if (!user) {
        socket.close(4001, 'Invalid token');
        return;
      }

      // Check access
      if (user.role !== 'admin' && !hasEngagementAccess(user.id, engagementId, 'viewer')) {
        socket.close(4003, 'Access denied');
        return;
      }

      // Create connection record
      const connection: WebSocketConnection = {
        socket,
        userId: user.id,
        engagementId,
        filters: {},
        subscribedAt: Date.now(),
      };

      // Add to connections
      const engagementConnections = connections.get(engagementId) ?? [];
      engagementConnections.push(connection);
      connections.set(engagementId, engagementConnections);

      // Send welcome message
      const welcomeMessage = {
        type: 'connected',
        payload: {
          engagement_id: engagementId,
          user_id: user.id,
          connected_at: connection.subscribedAt,
        },
      };
      socket.send(JSON.stringify(welcomeMessage));

      // Handle incoming messages
      socket.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'subscribe') {
            // Update filters
            const subscribeRequest = SubscriptionRequestSchema.safeParse(message.payload);
            if (subscribeRequest.success) {
              // Map event_types from subscription request to filters
              connection.filters = subscribeRequest.data.event_types
                ? { event_types: subscribeRequest.data.event_types }
                : {};

              const ackMessage: WebSocketMessage = {
                type: 'subscription_ack',
                payload: {
                  filters: connection.filters,
                  subscribed_at: Date.now(),
                },
              };
              socket.send(JSON.stringify(ackMessage));
            }
          } else if (message.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (error) {
          console.error('Failed to process WebSocket message:', error);
        }
      });

      // Handle disconnection
      socket.on('close', () => {
        const engagementConns = connections.get(engagementId) ?? [];
        const index = engagementConns.indexOf(connection);
        if (index > -1) {
          engagementConns.splice(index, 1);
          connections.set(engagementId, engagementConns);
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    }
  );
}

/**
 * Get connection stats for monitoring
 */
export function getConnectionStats(): {
  totalConnections: number;
  connectionsByEngagement: Record<string, number>;
} {
  const connectionsByEngagement: Record<string, number> = {};
  let totalConnections = 0;

  for (const [engagementId, conns] of Array.from(connections)) {
    connectionsByEngagement[engagementId] = conns.length;
    totalConnections += conns.length;
  }

  return { totalConnections, connectionsByEngagement };
}

/**
 * Broadcast message to all connections for an engagement
 */
export function broadcastToEngagement(engagementId: string, message: WebSocketMessage): void {
  const engagementConnections = connections.get(engagementId) ?? [];

  for (const conn of engagementConnections) {
    try {
      conn.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to broadcast message:', error);
    }
  }
}

/**
 * Close all connections for an engagement (e.g., when engagement is deleted)
 */
export function closeEngagementConnections(engagementId: string, reason?: string): void {
  const engagementConnections = connections.get(engagementId) ?? [];

  for (const conn of engagementConnections) {
    conn.socket.close(4000, reason ?? 'Engagement closed');
  }

  connections.delete(engagementId);
}
