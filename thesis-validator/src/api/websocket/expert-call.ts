/**
 * Expert Call WebSocket Handler
 *
 * Real-time expert call assistance with transcript processing
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import {
  createExpertCallWorkflow,
  processExpertCallTranscript,
  type ExpertCallSession,
  type RealtimeChunkResult,
} from '../../workflows/index.js';
import { hasEngagementAccess } from '../middleware/index.js';
import { decodeToken, type UserPayload } from '../middleware/auth.js';
import { publishEvent } from './events.js';
import { createExpertCallInsightEvent } from '../../models/index.js';

/**
 * Active expert call sessions
 */
interface ActiveSession {
  session: ExpertCallSession;
  socket: WebSocket;
  userId: string;
  engagementId: string;
  startedAt: number;
  chunkCount: number;
  insights: RealtimeChunkResult[];
}

const activeSessions = new Map<string, ActiveSession>();

/**
 * Transcript chunk from client
 */
const TranscriptChunkSchema = z.object({
  type: z.literal('transcript_chunk'),
  speaker: z.enum(['expert', 'analyst', 'unknown']),
  text: z.string(),
  timestamp: z.number().optional(),
  is_final: z.boolean().default(false),
});

/**
 * Question request from client
 */
const QuestionRequestSchema = z.object({
  type: z.literal('question_request'),
  context: z.string().optional(),
});

/**
 * Session control messages
 */
const SessionControlSchema = z.object({
  type: z.enum(['start_session', 'end_session', 'pause', 'resume']),
  metadata: z.record(z.any()).optional(),
});

/**
 * Register WebSocket routes for expert calls
 */
export async function registerExpertCallWebSocket(fastify: FastifyInstance): Promise<void> {
  /**
   * WebSocket endpoint for expert call assistance
   * WS /engagements/:engagementId/expert-call
   */
  fastify.get(
    '/engagements/:engagementId/expert-call',
    { websocket: true },
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

      // Check access (need editor access for expert calls)
      if (user.role !== 'admin' && !hasEngagementAccess(user.id, engagementId, 'editor')) {
        socket.close(4003, 'Access denied');
        return;
      }

      // Create expert call workflow
      const workflow = createExpertCallWorkflow({
        engagement_id: engagementId,
        realtime_mode: true,
      });

      // Create active session
      const sessionId = crypto.randomUUID();
      const activeSession: ActiveSession = {
        session: {
          id: sessionId,
          engagement_id: engagementId,
          status: 'active',
          started_at: Date.now(),
          chunks_processed: 0,
          insights_generated: 0,
          questions_suggested: 0,
        },
        socket,
        userId: user.id,
        engagementId,
        startedAt: Date.now(),
        chunkCount: 0,
        insights: [],
      };

      activeSessions.set(sessionId, activeSession);

      // Send session started message
      socket.send(JSON.stringify({
        type: 'session_started',
        session_id: sessionId,
        engagement_id: engagementId,
        started_at: activeSession.startedAt,
      }));

      // Handle incoming messages
      socket.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle transcript chunks
          const chunkResult = TranscriptChunkSchema.safeParse(message);
          if (chunkResult.success) {
            await handleTranscriptChunk(activeSession, chunkResult.data);
            return;
          }

          // Handle question requests
          const questionResult = QuestionRequestSchema.safeParse(message);
          if (questionResult.success) {
            await handleQuestionRequest(activeSession, questionResult.data);
            return;
          }

          // Handle session control
          const controlResult = SessionControlSchema.safeParse(message);
          if (controlResult.success) {
            await handleSessionControl(activeSession, controlResult.data);
            return;
          }

          // Handle ping
          if (message.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }

          // Unknown message type
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
          }));
        } catch (error) {
          console.error('Failed to process expert call message:', error);
          socket.send(JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Processing error',
          }));
        }
      });

      // Handle disconnection
      socket.on('close', async () => {
        // Finalize session
        await finalizeSession(activeSession);
        activeSessions.delete(sessionId);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error('Expert call WebSocket error:', error);
      });
    }
  );
}

/**
 * Handle incoming transcript chunk
 */
async function handleTranscriptChunk(
  session: ActiveSession,
  chunk: z.infer<typeof TranscriptChunkSchema>
): Promise<void> {
  session.chunkCount++;
  session.session.chunks_processed++;

  // Process chunk through workflow
  const result = await processExpertCallTranscript({
    engagement_id: session.engagementId,
    transcript_chunks: [{
      speaker: chunk.speaker,
      text: chunk.text,
      timestamp: chunk.timestamp ?? Date.now(),
    }],
    realtime_mode: true,
  });

  // Send processing acknowledgment
  session.socket.send(JSON.stringify({
    type: 'chunk_processed',
    chunk_index: session.chunkCount,
    timestamp: Date.now(),
  }));

  // If insights were generated, send them
  if (result.insights && result.insights.length > 0) {
    session.session.insights_generated += result.insights.length;

    for (const insight of result.insights) {
      session.insights.push(insight as RealtimeChunkResult);

      // Send insight to client
      session.socket.send(JSON.stringify({
        type: 'insight',
        insight: {
          type: insight.type,
          content: insight.content,
          confidence: insight.confidence,
          hypothesis_relevance: insight.hypothesis_relevance,
          timestamp: Date.now(),
        },
      }));

      // Publish event for other subscribers
      publishEvent(createExpertCallInsightEvent(
        session.engagementId,
        session.session.id,
        insight.type,
        insight.content,
        insight.confidence,
        insight.hypothesis_relevance
      ));
    }
  }

  // If suggested questions were generated, send them
  if (result.suggested_questions && result.suggested_questions.length > 0) {
    session.session.questions_suggested += result.suggested_questions.length;

    session.socket.send(JSON.stringify({
      type: 'suggested_questions',
      questions: result.suggested_questions.map((q) => ({
        question: q.question,
        rationale: q.rationale,
        hypothesis_link: q.hypothesis_link,
        priority: q.priority,
      })),
    }));
  }
}

/**
 * Handle question request
 */
async function handleQuestionRequest(
  session: ActiveSession,
  request: z.infer<typeof QuestionRequestSchema>
): Promise<void> {
  // Generate questions based on current context
  const result = await processExpertCallTranscript({
    engagement_id: session.engagementId,
    transcript_chunks: [],
    realtime_mode: true,
    generate_questions: true,
    context: request.context,
  });

  if (result.suggested_questions && result.suggested_questions.length > 0) {
    session.socket.send(JSON.stringify({
      type: 'suggested_questions',
      questions: result.suggested_questions.map((q) => ({
        question: q.question,
        rationale: q.rationale,
        hypothesis_link: q.hypothesis_link,
        priority: q.priority,
      })),
      requested: true,
    }));
  } else {
    session.socket.send(JSON.stringify({
      type: 'suggested_questions',
      questions: [],
      message: 'No additional questions suggested at this time',
    }));
  }
}

/**
 * Handle session control messages
 */
async function handleSessionControl(
  session: ActiveSession,
  control: z.infer<typeof SessionControlSchema>
): Promise<void> {
  switch (control.type) {
    case 'pause':
      session.session.status = 'paused';
      session.socket.send(JSON.stringify({
        type: 'session_paused',
        timestamp: Date.now(),
      }));
      break;

    case 'resume':
      session.session.status = 'active';
      session.socket.send(JSON.stringify({
        type: 'session_resumed',
        timestamp: Date.now(),
      }));
      break;

    case 'end_session':
      await finalizeSession(session);
      session.socket.send(JSON.stringify({
        type: 'session_ended',
        summary: getSessionSummary(session),
      }));
      session.socket.close(1000, 'Session ended');
      break;

    case 'start_session':
      // Already started on connection
      session.socket.send(JSON.stringify({
        type: 'session_active',
        session_id: session.session.id,
      }));
      break;
  }
}

/**
 * Finalize session and store results
 */
async function finalizeSession(session: ActiveSession): Promise<void> {
  session.session.status = 'completed';
  session.session.ended_at = Date.now();

  // Generate final summary
  const summary = getSessionSummary(session);

  // Store session results (would go to deal memory in production)
  console.log('Expert call session completed:', summary);
}

/**
 * Get session summary
 */
function getSessionSummary(session: ActiveSession): {
  session_id: string;
  engagement_id: string;
  duration_ms: number;
  chunks_processed: number;
  insights_generated: number;
  questions_suggested: number;
  key_insights: { type: string; content: string }[];
} {
  return {
    session_id: session.session.id,
    engagement_id: session.engagementId,
    duration_ms: Date.now() - session.startedAt,
    chunks_processed: session.chunkCount,
    insights_generated: session.session.insights_generated,
    questions_suggested: session.session.questions_suggested,
    key_insights: session.insights.slice(0, 5).map((i) => ({
      type: i.type,
      content: i.content,
    })),
  };
}

/**
 * Get active sessions for monitoring
 */
export function getActiveSessions(): {
  count: number;
  sessions: {
    session_id: string;
    engagement_id: string;
    user_id: string;
    started_at: number;
    chunks_processed: number;
  }[];
} {
  const sessions = Array.from(activeSessions.values()).map((s) => ({
    session_id: s.session.id,
    engagement_id: s.engagementId,
    user_id: s.userId,
    started_at: s.startedAt,
    chunks_processed: s.chunkCount,
  }));

  return {
    count: sessions.length,
    sessions,
  };
}
