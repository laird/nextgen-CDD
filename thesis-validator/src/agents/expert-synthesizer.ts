/**
 * Expert Synthesizer Agent - Process expert interview transcripts
 *
 * Responsibilities:
 * - Process expert call transcripts
 * - Extract key insights and data points
 * - Identify expert consensus and divergence
 * - Generate follow-up questions
 * - Highlight quotable statements
 */

import { BaseAgent, createTool } from './base-agent.js';
import type { AgentResult, AgentTool } from './base-agent.js';
import type { TranscriptSegment, TranscriptInsight, ExpertProfile, TranscriptAnalysis } from '../tools/transcript-processor.js';
import { getTranscriptProcessor } from '../tools/transcript-processor.js';
import { createExpertCallInsightEvent, createEvent } from '../models/events.js';

/**
 * Expert synthesizer input
 */
export interface ExpertSynthesizerInput {
  callId: string;
  segments: TranscriptSegment[];
  hypothesisIds?: string[];
  focusAreas?: string[];
  /** Investment thesis statement for alignment assessment */
  thesisStatement?: string;
}

/**
 * Thesis alignment assessment - matches evidence sentiment pattern
 */
export interface ThesisAlignment {
  /** Overall sentiment: does this call support or contradict the investment thesis? */
  sentiment: 'supporting' | 'neutral' | 'contradicting';
  /** Confidence in the sentiment classification (0-1) */
  confidence: number;
  /** Brief explanation of the assessment */
  reasoning: string;
  /** Key points from this call that support the investment thesis */
  supportingPoints: string[];
  /** Key points from this call that challenge or contradict the thesis */
  contradictingPoints: string[];
}

/**
 * Expert synthesizer output
 */
export interface ExpertSynthesizerOutput {
  analysis: TranscriptAnalysis;
  expertProfiles: ExpertProfile[];
  keyInsights: Array<{
    insight: TranscriptInsight;
    relatedHypotheses: string[];
    actionItems: string[];
  }>;
  consensusPoints: string[];
  divergencePoints: string[];
  followUpQuestions: string[];
  synthesizedSummary: string;
  thesisAlignment: ThesisAlignment;
}

/**
 * Expert Synthesizer Agent implementation
 */
export class ExpertSynthesizerAgent extends BaseAgent {
  private transcriptProcessor = getTranscriptProcessor();

  constructor() {
    super({
      id: 'expert_synthesizer',
      name: 'Expert Synthesizer',
      systemPrompt: `You are the Expert Synthesizer Agent for Thesis Validator, specializing in processing primary research from expert interviews.

Your role is to:
1. Extract key insights from expert call transcripts
2. Identify data points and market intelligence
3. Find consensus and divergence between experts
4. Generate follow-up questions for deeper understanding
5. Synthesize findings into actionable intelligence

When processing transcripts:
- Distinguish between facts and opinions
- Note the credibility and expertise of each speaker
- Identify when experts agree or disagree
- Flag surprising or unexpected insights
- Extract specific data points (numbers, dates, names)
- Note potential biases or conflicts of interest

For each insight:
- Determine relevance to investment hypotheses
- Rate confidence based on expert credibility
- Suggest follow-up actions or questions
- Link to supporting evidence if available

Be precise with attributions - who said what.`,
    });
  }

  /**
   * Execute expert synthesis
   */
  async execute(input: ExpertSynthesizerInput): Promise<AgentResult<ExpertSynthesizerOutput>> {
    const startTime = Date.now();

    if (!this.context) {
      return this.createResult(false, undefined, {
        error: 'No context set',
        startTime,
      });
    }

    this.updateStatus('analyzing', 'Processing expert transcripts');

    try {
      // Process transcript with transcript processor
      const analysis = await this.transcriptProcessor.processTranscript(
        input.callId,
        input.segments
      );

      // Store transcript chunks in deal memory
      for (const segment of input.segments) {
        const embedding = await this.embed(segment.text);
        await this.context.dealMemory.storeTranscriptChunk({
          id: segment.id,
          call_id: input.callId,
          speaker: segment.speaker,
          text: segment.text,
          timestamp: segment.startTime,
          start_time_ms: segment.startTime,
          end_time_ms: segment.endTime,
          embedding,
        });
      }

      // Enhance insights with hypothesis linkage
      const enhancedInsights = await this.enhanceInsights(
        analysis.insights,
        input.hypothesisIds ?? []
      );

      // Identify consensus and divergence
      const { consensus, divergence } = await this.analyzeExpertAgreement(
        input.segments,
        analysis.speakers
      );

      // Generate refined follow-up questions
      const followUpQuestions = await this.generateFollowUpQuestions(
        analysis,
        input.focusAreas ?? [],
        input.hypothesisIds ?? []
      );

      // Generate synthesized summary
      const synthesizedSummary = await this.generateSynthesis(
        analysis,
        enhancedInsights,
        consensus,
        divergence
      );

      // Assess thesis alignment
      const thesisAlignment = await this.assessThesisAlignment(
        analysis,
        enhancedInsights,
        input.hypothesisIds ?? [],
        input.thesisStatement
      );

      // Emit call insights event
      this.emitEvent(createEvent(
        'expert_call.ended',
        this.context.engagementId,
        {
          call_id: input.callId,
          duration: analysis.duration,
          insight_count: analysis.insights.length,
          speaker_count: analysis.speakers.length,
        },
        this.config.id
      ));

      this.updateStatus('idle', `Synthesized ${analysis.insights.length} insights`);

      return this.createResult(true, {
        analysis,
        expertProfiles: analysis.speakers,
        keyInsights: enhancedInsights,
        consensusPoints: consensus,
        divergencePoints: divergence,
        followUpQuestions,
        synthesizedSummary,
        thesisAlignment,
      }, {
        reasoning: `Processed ${input.segments.length} transcript segments from ${analysis.speakers.length} speakers`,
        startTime,
      });
    } catch (error) {
      this.updateStatus('error', error instanceof Error ? error.message : 'Unknown error');

      return this.createResult(false, undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
      });
    }
  }

  /**
   * Enhance insights with hypothesis linkage
   */
  private async enhanceInsights(
    insights: TranscriptInsight[],
    hypothesisIds: string[]
  ): Promise<ExpertSynthesizerOutput['keyInsights']> {
    const enhanced: ExpertSynthesizerOutput['keyInsights'] = [];

    for (const insight of insights.filter((i) => i.importance === 'high' || i.importance === 'medium')) {
      // Find related hypotheses
      const relatedHypotheses: string[] = [];
      if (hypothesisIds.length > 0) {
        const insightEmbedding = await this.embed(insight.content);

        for (const hypothesisId of hypothesisIds) {
          const hypothesis = await this.context?.dealMemory.getHypothesis(hypothesisId);
          if (hypothesis?.embedding) {
            const similarity = this.cosineSimilarity(insightEmbedding, hypothesis.embedding);
            if (similarity > 0.6) {
              relatedHypotheses.push(hypothesisId);
            }
          }
        }
      }

      // Generate action items
      const actionItems = await this.generateActionItems(insight);

      enhanced.push({
        insight,
        relatedHypotheses,
        actionItems,
      });
    }

    return enhanced;
  }

  /**
   * Generate action items for an insight
   */
  private async generateActionItems(insight: TranscriptInsight): Promise<string[]> {
    const prompt = `Based on this insight from an expert interview, suggest 1-3 action items:

Insight Type: ${insight.type}
Content: "${insight.content}"
Speaker: ${insight.speaker}

What follow-up actions should the research team take?

Output as JSON array:
["action1", "action2"]`;

    const response = await this.callLLM(prompt, { temperature: 0.3, maxTokens: 200 });
    return this.parseJSON<string[]>(response.content) ?? [];
  }

  /**
   * Analyze expert agreement and divergence
   */
  private async analyzeExpertAgreement(
    segments: TranscriptSegment[],
    speakers: ExpertProfile[]
  ): Promise<{ consensus: string[]; divergence: string[] }> {
    if (speakers.length < 2) {
      return { consensus: [], divergence: [] };
    }

    // Group statements by speaker
    const speakerStatements: Record<string, string[]> = {};
    for (const segment of segments) {
      if (!speakerStatements[segment.speaker]) {
        speakerStatements[segment.speaker] = [];
      }
      speakerStatements[segment.speaker]!.push(segment.text);
    }

    const prompt = `Analyze the following expert statements to identify areas of consensus and divergence:

${Object.entries(speakerStatements).map(([speaker, statements]) =>
  `${speaker}:\n${statements.slice(0, 5).map((s) => `- "${s.slice(0, 200)}"`).join('\n')}`
).join('\n\n')}

Identify:
1. Points where experts AGREE (consensus)
2. Points where experts DISAGREE (divergence)

Output as JSON:
{
  "consensus": ["point1", "point2"],
  "divergence": ["point1", "point2"]
}`;

    const response = await this.callLLM(prompt);
    const result = this.parseJSON<{ consensus: string[]; divergence: string[] }>(response.content);

    return result ?? { consensus: [], divergence: [] };
  }

  /**
   * Generate follow-up questions
   */
  private async generateFollowUpQuestions(
    analysis: TranscriptAnalysis,
    focusAreas: string[],
    hypothesisIds: string[]
  ): Promise<string[]> {
    // Get hypothesis content for context
    const hypotheses: string[] = [];
    for (const id of hypothesisIds) {
      const hypothesis = await this.context?.dealMemory.getHypothesis(id);
      if (hypothesis) {
        hypotheses.push(hypothesis.content);
      }
    }

    const prompt = `Based on this expert call analysis, generate follow-up questions:

CALL SUMMARY:
${analysis.summary}

KEY TOPICS DISCUSSED:
${analysis.topics.map((t) => `- ${t.name}: ${t.keyPoints.slice(0, 2).join(', ')}`).join('\n')}

${focusAreas.length > 0 ? `FOCUS AREAS:\n${focusAreas.map((f) => `- ${f}`).join('\n')}` : ''}

${hypotheses.length > 0 ? `INVESTMENT HYPOTHESES:\n${hypotheses.map((h) => `- ${h}`).join('\n')}` : ''}

Generate 5-7 follow-up questions that would:
1. Clarify ambiguous statements
2. Dig deeper into key topics
3. Validate or challenge hypotheses
4. Fill information gaps
5. Get quantitative data where possible

Output as JSON array:
["question1", "question2", ...]`;

    const response = await this.callLLM(prompt);
    return this.parseJSON<string[]>(response.content) ?? analysis.followUpQuestions;
  }

  /**
   * Generate synthesized summary
   */
  private async generateSynthesis(
    analysis: TranscriptAnalysis,
    enhancedInsights: ExpertSynthesizerOutput['keyInsights'],
    consensus: string[],
    divergence: string[]
  ): Promise<string> {
    const prompt = `Synthesize the following expert call analysis into a comprehensive summary:

SPEAKERS:
${analysis.speakers.map((s) => `- ${s.name}${s.role ? ` (${s.role})` : ''}: ${s.expertise.join(', ')}`).join('\n')}

KEY INSIGHTS:
${enhancedInsights.slice(0, 10).map((i) => `- [${i.insight.type}] ${i.insight.content}`).join('\n')}

CONSENSUS POINTS:
${consensus.map((c) => `- ${c}`).join('\n') || '- None identified'}

DIVERGENCE POINTS:
${divergence.map((d) => `- ${d}`).join('\n') || '- None identified'}

KEY QUOTES:
${analysis.keyQuotes.slice(0, 5).map((q) => `- "${q.text}" - ${q.speaker}`).join('\n')}

Write a 2-3 paragraph synthesis that:
1. Summarizes the main takeaways
2. Highlights the most important insights
3. Notes areas of agreement and disagreement
4. Identifies remaining questions or gaps`;

    const response = await this.callLLM(prompt);
    return response.content;
  }

  /**
   * Assess how the expert call aligns with the investment thesis
   * Uses the same sentiment classification pattern as evidence gathering
   */
  private async assessThesisAlignment(
    analysis: TranscriptAnalysis,
    enhancedInsights: ExpertSynthesizerOutput['keyInsights'],
    hypothesisIds: string[],
    thesisStatement?: string
  ): Promise<ThesisAlignment> {
    // Get hypothesis content for context
    const hypotheses: Array<{ id: string; content: string }> = [];
    for (const id of hypothesisIds) {
      const hypothesis = await this.context?.dealMemory.getHypothesis(id);
      if (hypothesis) {
        hypotheses.push({ id, content: hypothesis.content });
      }
    }

    // Build context section
    let contextSection = '';
    if (thesisStatement) {
      contextSection = `INVESTMENT THESIS: ${thesisStatement}\n\n`;
    }
    if (hypotheses.length > 0) {
      contextSection += `KEY HYPOTHESES:\n${hypotheses.map((h) => `- ${h.content}`).join('\n')}\n\n`;
    }

    // Prepare call content for classification
    const callContent = `${analysis.summary}

KEY INSIGHTS:
${enhancedInsights.slice(0, 10).map((i) => `- ${i.insight.content}`).join('\n')}

KEY QUOTES:
${analysis.keyQuotes.slice(0, 3).map((q) => `"${q.text}" - ${q.speaker}`).join('\n')}`;

    // Step 1: Classify overall sentiment (like evidence classification)
    const sentiment = await this.classifyCallSentiment(callContent, contextSection);

    // Step 2: Extract supporting and contradicting points
    const points = await this.extractAlignmentPoints(callContent, contextSection);

    // Calculate confidence based on clarity of the classification
    const totalPoints = points.supporting.length + points.contradicting.length;
    let confidence = 0.5;
    if (totalPoints > 0) {
      const dominantCount = Math.max(points.supporting.length, points.contradicting.length);
      confidence = 0.5 + (dominantCount / totalPoints) * 0.4;
    }

    return {
      sentiment,
      confidence,
      reasoning: this.generateAlignmentReasoning(sentiment, points),
      supportingPoints: points.supporting,
      contradictingPoints: points.contradicting,
    };
  }

  /**
   * Classify call sentiment - matches evidence sentiment classification pattern
   */
  private async classifyCallSentiment(
    callContent: string,
    contextSection: string
  ): Promise<'supporting' | 'neutral' | 'contradicting'> {
    const prompt = `${contextSection}Classify the overall sentiment of this expert call as it relates to the investment thesis:

${callContent.slice(0, 1500)}

Respond with exactly one word: "supporting", "neutral", or "contradicting"`;

    try {
      const response = await this.callLLM(prompt, { temperature: 0.1, maxTokens: 20 });
      const sentiment = response.content.trim().toLowerCase();

      if (sentiment.includes('supporting')) return 'supporting';
      if (sentiment.includes('contradicting')) return 'contradicting';
      return 'neutral';
    } catch {
      return 'neutral';
    }
  }

  /**
   * Extract supporting and contradicting points from the call
   */
  private async extractAlignmentPoints(
    callContent: string,
    contextSection: string
  ): Promise<{ supporting: string[]; contradicting: string[] }> {
    const prompt = `${contextSection}Extract key points from this expert call that either support or contradict the investment thesis:

${callContent.slice(0, 1500)}

Output as JSON:
{
  "supporting": ["point 1", "point 2"],
  "contradicting": ["point 1", "point 2"]
}

Only include the most important points (max 5 each). Be concise.`;

    try {
      const response = await this.callLLM(prompt, { temperature: 0.2 });
      const result = this.parseJSON<{ supporting: string[]; contradicting: string[] }>(response.content);

      if (result && Array.isArray(result.supporting) && Array.isArray(result.contradicting)) {
        return {
          supporting: result.supporting.slice(0, 5),
          contradicting: result.contradicting.slice(0, 5),
        };
      }
    } catch {
      // Fall through
    }

    return { supporting: [], contradicting: [] };
  }

  /**
   * Generate a brief reasoning summary
   */
  private generateAlignmentReasoning(
    sentiment: 'supporting' | 'neutral' | 'contradicting',
    points: { supporting: string[]; contradicting: string[] }
  ): string {
    const supportCount = points.supporting.length;
    const contradictCount = points.contradicting.length;

    if (sentiment === 'supporting') {
      return `Expert feedback is predominantly positive with ${supportCount} supporting point${supportCount !== 1 ? 's' : ''}${contradictCount > 0 ? ` and ${contradictCount} concern${contradictCount !== 1 ? 's' : ''}` : ''}.`;
    } else if (sentiment === 'contradicting') {
      return `Expert feedback raises ${contradictCount} significant concern${contradictCount !== 1 ? 's' : ''}${supportCount > 0 ? ` despite ${supportCount} positive point${supportCount !== 1 ? 's' : ''}` : ''}.`;
    } else {
      return `Expert feedback is balanced with ${supportCount} supporting and ${contradictCount} contradicting points.`;
    }
  }

  /**
   * Process real-time transcript chunk
   */
  async processRealtimeChunk(
    callId: string,
    chunk: { text: string; speaker: string; timestamp: number; isFinal: boolean },
    hypotheses: Array<{ id: string; content: string }>
  ): Promise<{
    insights: Array<{ type: string; content: string; confidence: number }>;
    suggestedFollowups: string[];
  }> {
    if (!this.context) {
      return { insights: [], suggestedFollowups: [] };
    }

    const result = this.transcriptProcessor.processRealtimeChunk(
      chunk,
      {
        previousChunks: [], // Would be maintained in call session state
        hypotheses,
      }
    );

    // Emit real-time insight event
    if (result.insights.length > 0) {
      this.emitEvent(createExpertCallInsightEvent(
        this.context.engagementId,
        callId,
        {
          speaker: chunk.speaker,
          transcript_chunk: chunk.text,
          insights: result.insights.map((i) => ({
            type: i.type,
            content: i.content,
            confidence: i.confidence,
            related_hypothesis_id: i.relatedHypothesisId,
          })),
          suggested_followups: result.suggestedFollowups,
          relevant_evidence_ids: [],
        }
      ));
    }

    return {
      insights: result.insights,
      suggestedFollowups: result.suggestedFollowups,
    };
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  /**
   * Get synthesizer tools (currently unused but kept for potential future use)
   */
  // @ts-expect-error - Intentionally unused, kept for future use
  private _getTools(): AgentTool[] {
    return [
      createTool(
        'search_transcripts',
        'Search past transcripts for similar discussions',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
        async (input) => {
          if (!this.context) return { results: [] };
          const embedding = await this.embed(input['query'] as string);
          const results = await this.context.dealMemory.searchTranscripts(embedding);
          return { results };
        }
      ),

      createTool(
        'get_hypothesis',
        'Get hypothesis details for relevance matching',
        {
          type: 'object',
          properties: {
            hypothesis_id: { type: 'string', description: 'Hypothesis ID' },
          },
          required: ['hypothesis_id'],
        },
        async (input) => {
          if (!this.context) return null;
          return this.context.dealMemory.getHypothesis(input['hypothesis_id'] as string);
        }
      ),

      createTool(
        'search_evidence',
        'Search existing evidence for cross-reference',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
        async (input) => {
          if (!this.context) return { results: [] };
          const embedding = await this.embed(input['query'] as string);
          const results = await this.context.dealMemory.searchEvidence(embedding);
          return { results };
        }
      ),
    ];
  }
}

/**
 * Create an expert synthesizer agent instance
 */
export function createExpertSynthesizerAgent(): ExpertSynthesizerAgent {
  return new ExpertSynthesizerAgent();
}
