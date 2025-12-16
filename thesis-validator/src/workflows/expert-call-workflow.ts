/**
 * Expert Call Workflow - Real-time expert call support
 *
 * Real-time processing of expert interviews:
 * 1. Transcript ingestion (real-time or batch)
 * 2. Instant context retrieval
 * 3. Insight extraction
 * 4. Follow-up question generation
 * 5. Contradiction detection
 * 6. Post-call synthesis
 */

import {
  createExpertSynthesizerAgent,
  type ExpertSynthesizerOutput,
} from '../agents/index.js';
import type { DealMemory } from '../memory/deal-memory.js';
import type { EngagementEvent, HypothesisNode } from '../models/index.js';
import { createEvent, createExpertCallInsightEvent } from '../models/events.js';
import type { TranscriptSegment, RealtimeChunk, RealtimeInsight } from '../tools/transcript-processor.js';

/**
 * Expert call configuration
 */
export interface ExpertCallConfig {
  realTimeMode: boolean;
  insightThreshold: number;
  maxFollowUpsPerChunk: number;
  hypothesisRelevanceThreshold: number;
}

/**
 * Default expert call configuration
 */
const defaultConfig: ExpertCallConfig = {
  realTimeMode: true,
  insightThreshold: 0.6,
  maxFollowUpsPerChunk: 3,
  hypothesisRelevanceThreshold: 0.5,
};

/**
 * Real-time chunk result
 */
export interface RealtimeChunkResult {
  insights: RealtimeInsight[];
  suggestedFollowups: string[];
  relevantContext: Array<{
    type: 'hypothesis' | 'evidence' | 'prior_call';
    content: string;
    relevance: number;
  }>;
  contradictionAlerts: Array<{
    type: 'internal' | 'external';
    description: string;
    severity: number;
  }>;
}

/**
 * Expert call session state
 */
export interface ExpertCallSession {
  id: string;
  engagementId: string;
  startTime: number;
  speakers: Set<string>;
  chunks: RealtimeChunk[];
  insights: RealtimeInsight[];
  followUpsAsked: string[];
  isActive: boolean;
}

/**
 * Expert call input
 */
export interface ExpertCallInput {
  engagementId: string;
  callId: string;
  dealMemory: DealMemory;
  hypotheses?: HypothesisNode[];
  focusAreas?: string[];
  /** Investment thesis statement for alignment assessment */
  thesisStatement?: string;
  config?: Partial<ExpertCallConfig>;
  onEvent?: (event: EngagementEvent) => void;
}

/**
 * Batch processing input
 */
export interface BatchTranscriptInput extends ExpertCallInput {
  segments: TranscriptSegment[];
}

/**
 * Expert Call Workflow
 */
export class ExpertCallWorkflow {
  private config: ExpertCallConfig;
  private sessions: Map<string, ExpertCallSession> = new Map();

  constructor(config?: Partial<ExpertCallConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Start a new expert call session
   */
  startSession(input: ExpertCallInput): ExpertCallSession {
    const session: ExpertCallSession = {
      id: input.callId,
      engagementId: input.engagementId,
      startTime: Date.now(),
      speakers: new Set(),
      chunks: [],
      insights: [],
      followUpsAsked: [],
      isActive: true,
    };

    this.sessions.set(input.callId, session);

    // Emit call started event
    this.emitEvent(input, createEvent(
      'expert_call.started',
      input.engagementId,
      { call_id: input.callId, start_time: session.startTime }
    ));

    return session;
  }

  /**
   * Process a real-time transcript chunk
   */
  async processRealtimeChunk(
    input: ExpertCallInput,
    chunk: RealtimeChunk
  ): Promise<RealtimeChunkResult> {
    const config = { ...this.config, ...input.config };
    let session = this.sessions.get(input.callId);

    if (!session) {
      session = this.startSession(input);
    }

    // Add chunk to session
    session.chunks.push(chunk);
    session.speakers.add(chunk.speaker);

    // Create expert synthesizer for processing
    const synthesizer = createExpertSynthesizerAgent();
    synthesizer.setContext({
      engagementId: input.engagementId,
      dealMemory: input.dealMemory,
      ...(input.onEvent !== undefined && { onEvent: input.onEvent }),
    });

    // Get hypotheses for context
    const hypotheses = input.hypotheses ?? await input.dealMemory.getAllHypotheses();

    // Process chunk
    const realtimeResult = await synthesizer.processRealtimeChunk(
      input.callId,
      chunk,
      hypotheses.map((h) => ({ id: h.id, content: h.content }))
    );

    // Get relevant context
    const relevantContext = await this.getRelevantContext(input, chunk);

    // Check for contradictions
    const contradictionAlerts = await this.checkContradictions(chunk, session);

    // Convert and validate insights to proper RealtimeInsight type
    const validatedInsights: RealtimeInsight[] = realtimeResult.insights
      .filter((i): i is RealtimeInsight => {
        const type = i.type as string;
        return type === 'key_point' || type === 'contradiction' || type === 'follow_up' || type === 'data_point';
      });

    // Add insights to session
    session.insights.push(...validatedInsights);

    // Emit real-time insight event if significant insights found
    if (validatedInsights.length > 0) {
      this.emitEvent(input, createExpertCallInsightEvent(
        input.engagementId,
        input.callId,
        {
          speaker: chunk.speaker,
          transcript_chunk: chunk.text,
          insights: validatedInsights.map((i) => ({
            type: i.type,
            content: i.content,
            confidence: i.confidence,
            ...(i.relatedHypothesisId !== undefined && { related_hypothesis_id: i.relatedHypothesisId }),
          })),
          suggested_followups: realtimeResult.suggestedFollowups,
          relevant_evidence_ids: [],
        }
      ));
    }

    return {
      insights: validatedInsights,
      suggestedFollowups: realtimeResult.suggestedFollowups.slice(0, config.maxFollowUpsPerChunk),
      relevantContext,
      contradictionAlerts,
    };
  }

  /**
   * Get relevant context for a chunk
   */
  private async getRelevantContext(
    input: ExpertCallInput,
    chunk: RealtimeChunk
  ): Promise<RealtimeChunkResult['relevantContext']> {
    const context: RealtimeChunkResult['relevantContext'] = [];

    // Search hypotheses
    const hypotheses = input.hypotheses ?? await input.dealMemory.getAllHypotheses();
    for (const hypothesis of hypotheses.slice(0, 5)) {
      const relevance = this.calculateRelevance(chunk.text, hypothesis.content);
      if (relevance > this.config.hypothesisRelevanceThreshold) {
        context.push({
          type: 'hypothesis',
          content: hypothesis.content,
          relevance,
        });
      }
    }

    // Search evidence (simplified - would use embeddings in production)
    // ...

    return context.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
  }

  /**
   * Check for contradictions
   */
  private async checkContradictions(
    chunk: RealtimeChunk,
    session: ExpertCallSession
  ): Promise<RealtimeChunkResult['contradictionAlerts']> {
    const alerts: RealtimeChunkResult['contradictionAlerts'] = [];

    // Check against previous chunks in this call
    for (const prevChunk of session.chunks.slice(-20)) {
      if (prevChunk.speaker !== chunk.speaker) {
        if (this.detectContradiction(prevChunk.text, chunk.text)) {
          alerts.push({
            type: 'internal',
            description: `Potential disagreement between ${prevChunk.speaker} and ${chunk.speaker}`,
            severity: 0.6,
          });
        }
      }
    }

    // Check against existing evidence (simplified)
    // ...

    return alerts;
  }

  /**
   * Simple contradiction detection
   */
  private detectContradiction(text1: string, text2: string): boolean {
    const positiveWords = ['yes', 'agree', 'correct', 'true', 'definitely', 'absolutely'];
    const negativeWords = ['no', 'disagree', 'incorrect', 'false', 'not', 'wrong'];

    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();

    const hasPositive1 = positiveWords.some((w) => lower1.includes(w));
    const hasNegative1 = negativeWords.some((w) => lower1.includes(w));
    const hasPositive2 = positiveWords.some((w) => lower2.includes(w));
    const hasNegative2 = negativeWords.some((w) => lower2.includes(w));

    // Check for topic overlap
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
    let overlap = 0;
    for (const word of words1) {
      if (words2.has(word)) overlap++;
    }

    // Only flag if there's topic overlap and sentiment conflict
    return overlap >= 3 && ((hasPositive1 && hasNegative2) || (hasNegative1 && hasPositive2));
  }

  /**
   * Simple relevance calculation
   */
  private calculateRelevance(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const words2 = text2.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

    let matches = 0;
    for (const word of words2) {
      if (words1.has(word)) matches++;
    }

    return words2.length > 0 ? matches / words2.length : 0;
  }

  /**
   * End a call session and generate synthesis
   */
  async endSession(input: BatchTranscriptInput): Promise<ExpertSynthesizerOutput> {
    const session = this.sessions.get(input.callId);

    // Convert chunks to segments if needed
    const segments: TranscriptSegment[] = input.segments.length > 0
      ? input.segments
      : session?.chunks.map((chunk, index) => ({
          id: `${input.callId}_segment_${index}`,
          speaker: chunk.speaker,
          text: chunk.text,
          startTime: chunk.timestamp,
          endTime: chunk.timestamp + 5000, // Estimate
          confidence: 0.9,
        })) ?? [];

    // Create synthesizer
    const synthesizer = createExpertSynthesizerAgent();
    synthesizer.setContext({
      engagementId: input.engagementId,
      dealMemory: input.dealMemory,
      ...(input.onEvent !== undefined && { onEvent: input.onEvent }),
    });

    // Get hypotheses
    const hypotheses = input.hypotheses ?? await input.dealMemory.getAllHypotheses();

    // Run synthesis
    const result = await synthesizer.execute({
      callId: input.callId,
      segments,
      hypothesisIds: hypotheses.map((h) => h.id),
      ...(input.focusAreas !== undefined && { focusAreas: input.focusAreas }),
      ...(input.thesisStatement !== undefined && { thesisStatement: input.thesisStatement }),
    });

    // Mark session as inactive
    if (session) {
      session.isActive = false;
    }

    // Emit call ended event
    this.emitEvent(input, createEvent(
      'expert_call.ended',
      input.engagementId,
      {
        call_id: input.callId,
        duration: session ? Date.now() - session.startTime : 0,
        insight_count: result.data?.keyInsights.length ?? 0,
      }
    ));

    if (!result.success || !result.data) {
      throw new Error(`Expert synthesis failed: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Process a batch transcript
   */
  async processBatchTranscript(input: BatchTranscriptInput): Promise<ExpertSynthesizerOutput> {
    // Start session
    this.startSession(input);

    // End session with full synthesis
    return this.endSession(input);
  }

  /**
   * Get session state
   */
  getSession(callId: string): ExpertCallSession | undefined {
    return this.sessions.get(callId);
  }

  /**
   * Emit event helper
   */
  private emitEvent(input: ExpertCallInput, event: EngagementEvent): void {
    if (input.onEvent) {
      input.onEvent(event);
    }
  }
}

/**
 * Create expert call workflow instance
 */
export function createExpertCallWorkflow(
  config?: Partial<ExpertCallConfig>
): ExpertCallWorkflow {
  return new ExpertCallWorkflow(config);
}

/**
 * Process a batch transcript
 */
export async function processExpertCallTranscript(
  input: BatchTranscriptInput
): Promise<ExpertSynthesizerOutput> {
  const workflow = new ExpertCallWorkflow(input.config);
  return workflow.processBatchTranscript(input);
}
