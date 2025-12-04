import crypto from 'node:crypto';
import { z } from 'zod';

/**
 * Event types for real-time streaming
 */
export const EventTypeSchema = z.enum([
  'hypothesis.created',
  'hypothesis.updated',
  'hypothesis.deleted',
  'evidence.new',
  'evidence.updated',
  'contradiction.found',
  'contradiction.resolved',
  'research.started',
  'research.progress',
  'research.completed',
  'research.failed',
  'expert_call.started',
  'expert_call.insight',
  'expert_call.ended',
  'agent.started',
  'agent.status',
  'agent.completed',
  'agent.error',
  'workflow.started',
  'workflow.step_completed',
  'workflow.completed',
  'workflow.failed',
  'document.uploaded',
  'document.processed',
  'skill.executed',
  'system.error',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

/**
 * Agent status for tracking
 */
export const AgentStatusSchema = z.enum([
  'idle',
  'thinking',
  'searching',
  'analyzing',
  'writing',
  'waiting',
  'error',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/**
 * Base event structure
 */
export const BaseEventSchema = z.object({
  id: z.string().uuid(),
  type: EventTypeSchema,
  timestamp: z.number(),
  engagement_id: z.string().uuid(),
  agent_id: z.string().optional(),
});
export type BaseEvent = z.infer<typeof BaseEventSchema>;

/**
 * Hypothesis event data
 */
export const HypothesisEventDataSchema = z.object({
  hypothesis_id: z.string().uuid(),
  content: z.string().optional(),
  confidence: z.number().optional(),
  confidence_delta: z.number().optional(),
  status: z.string().optional(),
  previous_status: z.string().optional(),
});
export type HypothesisEventData = z.infer<typeof HypothesisEventDataSchema>;

/**
 * Evidence event data
 */
export const EvidenceEventDataSchema = z.object({
  evidence_id: z.string().uuid(),
  hypothesis_id: z.string().uuid().optional(),
  content_preview: z.string().optional(),
  source_type: z.string().optional(),
  sentiment: z.string().optional(),
  credibility_score: z.number().optional(),
});
export type EvidenceEventData = z.infer<typeof EvidenceEventDataSchema>;

/**
 * Contradiction event data
 */
export const ContradictionEventDataSchema = z.object({
  contradiction_id: z.string().uuid(),
  evidence_id: z.string().uuid(),
  hypothesis_id: z.string().uuid(),
  severity: z.number(),
  explanation: z.string(),
  resolution_status: z.string().optional(),
});
export type ContradictionEventData = z.infer<typeof ContradictionEventDataSchema>;

/**
 * Research progress event data
 */
export const ResearchProgressEventDataSchema = z.object({
  workflow_id: z.string().uuid(),
  current_step: z.string(),
  total_steps: z.number(),
  completed_steps: z.number(),
  progress_percentage: z.number(),
  current_agent: z.string().optional(),
  estimated_remaining_ms: z.number().optional(),
});
export type ResearchProgressEventData = z.infer<typeof ResearchProgressEventDataSchema>;

/**
 * Expert call insight event data
 */
export const ExpertCallInsightEventDataSchema = z.object({
  call_id: z.string().uuid(),
  speaker: z.string(),
  transcript_chunk: z.string(),
  insights: z.array(z.object({
    type: z.enum(['key_point', 'contradiction', 'follow_up', 'data_point']),
    content: z.string(),
    confidence: z.number(),
    related_hypothesis_id: z.string().uuid().optional(),
  })),
  suggested_followups: z.array(z.string()),
  relevant_evidence_ids: z.array(z.string().uuid()),
});
export type ExpertCallInsightEventData = z.infer<typeof ExpertCallInsightEventDataSchema>;

/**
 * Agent status event data
 */
export const AgentStatusEventDataSchema = z.object({
  agent_id: z.string(),
  agent_type: z.string(),
  status: AgentStatusSchema,
  current_task: z.string().optional(),
  progress: z.number().optional(),
  message: z.string().optional(),
});
export type AgentStatusEventData = z.infer<typeof AgentStatusEventDataSchema>;

/**
 * Workflow event data
 */
export const WorkflowEventDataSchema = z.object({
  workflow_id: z.string().uuid(),
  workflow_type: z.string(),
  current_step: z.string().optional(),
  completed_steps: z.array(z.string()).optional(),
  remaining_steps: z.array(z.string()).optional(),
  error: z.string().optional(),
  result: z.any().optional(),
});
export type WorkflowEventData = z.infer<typeof WorkflowEventDataSchema>;

/**
 * Document event data
 */
export const DocumentEventDataSchema = z.object({
  document_id: z.string().uuid(),
  filename: z.string(),
  size_bytes: z.number().optional(),
  mime_type: z.string().optional(),
  page_count: z.number().optional(),
  processing_status: z.enum(['pending', 'processing', 'completed', 'failed']),
  error: z.string().optional(),
});
export type DocumentEventData = z.infer<typeof DocumentEventDataSchema>;

/**
 * Full engagement event
 */
export const EngagementEventSchema = BaseEventSchema.extend({
  data: z.union([
    HypothesisEventDataSchema,
    EvidenceEventDataSchema,
    ContradictionEventDataSchema,
    ResearchProgressEventDataSchema,
    ExpertCallInsightEventDataSchema,
    AgentStatusEventDataSchema,
    WorkflowEventDataSchema,
    DocumentEventDataSchema,
    z.record(z.any()),
  ]),
  metadata: z.object({
    hypothesis_id: z.string().uuid().optional(),
    evidence_id: z.string().uuid().optional(),
    confidence_delta: z.number().optional(),
    source: z.string().optional(),
  }).optional(),
});
export type EngagementEvent = z.infer<typeof EngagementEventSchema>;

/**
 * WebSocket subscription request
 */
export const SubscriptionRequestSchema = z.object({
  action: z.enum(['subscribe', 'unsubscribe']),
  engagement_id: z.string().uuid(),
  event_types: z.array(EventTypeSchema).optional(),
});
export type SubscriptionRequest = z.infer<typeof SubscriptionRequestSchema>;

/**
 * WebSocket message wrapper
 */
export const WebSocketMessageSchema = z.object({
  type: z.enum(['event', 'subscription_ack', 'error', 'ping', 'pong']),
  payload: z.any(),
  request_id: z.string().optional(),
});
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

/**
 * Helper function to create an event
 */
export function createEvent<T extends Record<string, unknown>>(
  type: EventType,
  engagementId: string,
  data: T,
  agentId?: string,
  metadata?: Record<string, unknown>
): EngagementEvent {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    engagement_id: engagementId,
    agent_id: agentId,
    data,
    metadata,
  };
}

/**
 * Helper to create hypothesis updated event
 */
export function createHypothesisUpdatedEvent(
  engagementId: string,
  hypothesisId: string,
  changes: {
    confidence?: number;
    confidence_delta?: number;
    status?: string;
    previous_status?: string;
  },
  agentId?: string
): EngagementEvent {
  return createEvent(
    'hypothesis.updated',
    engagementId,
    {
      hypothesis_id: hypothesisId,
      ...changes,
    },
    agentId,
    {
      hypothesis_id: hypothesisId,
      confidence_delta: changes.confidence_delta,
    }
  );
}

/**
 * Helper to create evidence found event
 */
export function createEvidenceFoundEvent(
  engagementId: string,
  evidenceId: string,
  data: {
    hypothesis_id?: string;
    content_preview: string;
    source_type: string;
    sentiment: string;
    credibility_score: number;
  },
  agentId?: string
): EngagementEvent {
  return createEvent(
    'evidence.new',
    engagementId,
    {
      evidence_id: evidenceId,
      ...data,
    },
    agentId,
    {
      evidence_id: evidenceId,
      hypothesis_id: data.hypothesis_id,
    }
  );
}

/**
 * Helper to create contradiction found event
 */
export function createContradictionFoundEvent(
  engagementId: string,
  data: ContradictionEventData,
  agentId?: string
): EngagementEvent {
  return createEvent(
    'contradiction.found',
    engagementId,
    data,
    agentId,
    {
      evidence_id: data.evidence_id,
      hypothesis_id: data.hypothesis_id,
    }
  );
}

/**
 * Helper to create agent status event
 */
export function createAgentStatusEvent(
  engagementId: string,
  agentId: string,
  agentType: string,
  status: AgentStatus,
  message?: string,
  currentTask?: string
): EngagementEvent {
  return createEvent(
    'agent.status',
    engagementId,
    {
      agent_id: agentId,
      agent_type: agentType,
      status,
      message,
      current_task: currentTask,
    },
    agentId
  );
}

/**
 * Helper to create research progress event
 */
export function createResearchProgressEvent(
  engagementId: string,
  workflowId: string,
  data: Omit<ResearchProgressEventData, 'workflow_id'>
): EngagementEvent {
  return createEvent(
    'research.progress',
    engagementId,
    {
      workflow_id: workflowId,
      ...data,
    }
  );
}

/**
 * Helper to create expert call insight event
 */
export function createExpertCallInsightEvent(
  engagementId: string,
  callId: string,
  data: Omit<ExpertCallInsightEventData, 'call_id'>
): EngagementEvent {
  return createEvent(
    'expert_call.insight',
    engagementId,
    {
      call_id: callId,
      ...data,
    }
  );
}

/**
 * Event filter for subscriptions
 */
export interface EventFilter {
  event_types?: EventType[];
  agent_ids?: string[];
  hypothesis_ids?: string[];
  min_severity?: number;
}

/**
 * Check if an event matches a filter
 */
export function matchesFilter(event: EngagementEvent, filter: EventFilter): boolean {
  if (filter.event_types && !filter.event_types.includes(event.type)) {
    return false;
  }

  if (filter.agent_ids && event.agent_id && !filter.agent_ids.includes(event.agent_id)) {
    return false;
  }

  if (filter.hypothesis_ids && event.metadata?.hypothesis_id) {
    if (!filter.hypothesis_ids.includes(event.metadata.hypothesis_id as string)) {
      return false;
    }
  }

  return true;
}
