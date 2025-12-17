/**
 * Hypothesis Builder Agent - Constructs investment thesis trees
 *
 * Responsibilities:
 * - Decompose investment theses into testable hypotheses
 * - Define causal relationships between hypotheses
 * - Identify key assumptions requiring validation
 * - Build hypothesis trees with confidence scoring
 */

import { BaseAgent, createTool } from './base-agent.js';
import type { AgentResult, AgentTool } from './base-agent.js';
import type {
  HypothesisNode,
  HypothesisDecomposition,
  CausalRelationship,
} from '../models/hypothesis.js';
import { createHypothesisUpdatedEvent, createEvent } from '../models/events.js';
import { HypothesisRepository } from '../repositories/index.js';

/**
 * Hypothesis builder input
 */
export interface HypothesisBuilderInput {
  thesis: string;
  context?: {
    sector?: string;
    dealType?: string;
    targetCompany?: string;
    additionalContext?: string;
  };
  existingHypotheses?: HypothesisNode[];
}

/**
 * Hypothesis builder output
 */
export interface HypothesisBuilderOutput {
  rootThesis: HypothesisNode;
  decomposition: HypothesisDecomposition;
  hypotheses: HypothesisNode[];
  relationships: Array<{
    sourceId: string;
    targetId: string;
    relationship: CausalRelationship;
    strength: number;
    reasoning: string;
  }>;
  keyQuestions: string[];
}

/**
 * Hypothesis Builder Agent implementation
 */
export class HypothesisBuilderAgent extends BaseAgent {
  private hypothesisRepo = new HypothesisRepository();

  constructor() {
    super({
      id: 'hypothesis_builder',
      name: 'Hypothesis Builder',
      systemPrompt: `You are the Hypothesis Builder Agent for Thesis Validator, specializing in structured decomposition of investment theses.

Your role is to:
1. Parse investment theses into explicit, testable hypotheses
2. Identify causal relationships and dependencies
3. Surface hidden assumptions that need validation
4. Create a logical tree structure connecting all elements

When decomposing theses:
- Break down to atomic, testable statements
- Distinguish between market hypotheses, company hypotheses, and value creation hypotheses
- Identify both necessary conditions (AND relationships) and sufficient conditions (OR relationships)
- Flag high-risk assumptions that could invalidate the thesis
- Consider second-order effects and dependencies

For each hypothesis:
- Assign initial confidence (0-1) based on how well-supported it appears
- Identify what evidence would validate or refute it
- Note any analogous situations from past deals

Output structured JSON with clear hierarchy and relationships.`,
    });
  }

  /**
   * Execute hypothesis building
   */
  async execute(input: HypothesisBuilderInput): Promise<AgentResult<HypothesisBuilderOutput>> {
    const startTime = Date.now();

    if (!this.context) {
      return this.createResult(false, undefined, {
        error: 'No context set',
        startTime,
      });
    }

    this.updateStatus('thinking', 'Analyzing investment thesis');

    try {
      // Step 1: Initial decomposition
      const decomposition = await this.decomposeThesis(input);

      // Step 2: Create hypothesis nodes
      const hypotheses = await this.createHypothesisNodes(decomposition, input);

      // Step 3: Build relationships
      const relationships = await this.buildRelationships(hypotheses, decomposition);

      // Step 4: Store in deal memory
      const rootThesis = hypotheses.find((h) => h.type === 'thesis');
      if (!rootThesis) {
        throw new Error('Failed to create root thesis');
      }

      // Store hypotheses in memory and capture the deal memory IDs
      // Map in-memory IDs to deal memory IDs for consistency
      const inMemoryToDealMemoryMap = new Map<string, string>();
      const storedHypotheses: HypothesisNode[] = [];

      for (const hypothesis of hypotheses) {
        const embedding = await this.embed(hypothesis.content);
        const storedHypothesis = await this.context.dealMemory.createHypothesis(
          {
            type: hypothesis.type,
            content: hypothesis.content,
            parent_id: undefined,
          },
          this.config.id,
          embedding
        );
        // Map original in-memory ID to deal memory ID
        inMemoryToDealMemoryMap.set(hypothesis.id, storedHypothesis.id);
        storedHypotheses.push(storedHypothesis);
      }

      // Store relationships using deal memory IDs
      for (const rel of relationships) {
        const dmSourceId = inMemoryToDealMemoryMap.get(rel.sourceId);
        const dmTargetId = inMemoryToDealMemoryMap.get(rel.targetId);

        if (dmSourceId && dmTargetId) {
          await this.context.dealMemory.addCausalEdge({
            source_id: dmSourceId,
            target_id: dmTargetId,
            relationship: rel.relationship,
            strength: rel.strength,
            reasoning: rel.reasoning,
          });
        }
      }

      // Store hypotheses in PostgreSQL using deal memory IDs
      for (const hypothesis of storedHypotheses) {
        await this.hypothesisRepo.create({
          id: hypothesis.id, // Use deal memory ID as PostgreSQL ID for consistency
          engagementId: this.context.engagementId,
          type: hypothesis.type,
          content: hypothesis.content,
          confidence: hypothesis.confidence,
          status: hypothesis.status,
          createdBy: this.config.id,
          metadata: hypothesis.metadata,
        });
      }

      // Store relationships in PostgreSQL using deal memory IDs
      for (const rel of relationships) {
        const dmSourceId = inMemoryToDealMemoryMap.get(rel.sourceId);
        const dmTargetId = inMemoryToDealMemoryMap.get(rel.targetId);

        if (dmSourceId && dmTargetId) {
          await this.hypothesisRepo.addEdge({
            sourceId: dmSourceId,
            targetId: dmTargetId,
            relationship: rel.relationship,
            strength: rel.strength,
            reasoning: rel.reasoning,
          });
        }
      }

      // Update references to use stored hypotheses with deal memory IDs
      const updatedRootThesis = storedHypotheses.find((h) => h.type === 'thesis');
      if (!updatedRootThesis) {
        throw new Error('Failed to find root thesis in stored hypotheses');
      }

      // Emit hypothesis created events
      this.emitEvent(createEvent(
        'hypothesis.created',
        this.context.engagementId,
        {
          hypothesis_id: updatedRootThesis.id,
          content: updatedRootThesis.content,
          type: 'thesis',
          hypothesis_count: storedHypotheses.length,
        },
        this.config.id
      ));

      this.updateStatus('idle', 'Hypothesis tree built');

      // Return stored hypotheses with correct IDs that match deal memory
      return this.createResult(true, {
        rootThesis: updatedRootThesis,
        decomposition,
        hypotheses: storedHypotheses,
        relationships,
        keyQuestions: Array.isArray(decomposition.key_questions) ? decomposition.key_questions : [],
      }, {
        reasoning: `Created hypothesis tree with ${storedHypotheses.length} nodes and ${relationships.length} relationships`,
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
   * Decompose thesis into structured components
   */
  private async decomposeThesis(input: HypothesisBuilderInput): Promise<HypothesisDecomposition> {
    const tools = this.getTools();

    const prompt = `Decompose the following investment thesis into testable hypotheses:

THESIS: ${input.thesis}

${input.context?.sector ? `Sector: ${input.context.sector}` : ''}
${input.context?.dealType ? `Deal Type: ${input.context.dealType}` : ''}
${input.context?.targetCompany ? `Target Company: ${input.context.targetCompany}` : ''}
${input.context?.additionalContext ? `Additional Context: ${input.context.additionalContext}` : ''}

Analyze this thesis and provide:
1. Sub-theses: Major components that must be true for the overall thesis to hold
2. Assumptions: Underlying beliefs that may not be explicitly stated but are critical
3. Key Questions: What we need to answer to validate or refute each component

For each sub-thesis and assumption, rate:
- Importance (0-1): How critical is this to the overall thesis?
- Testability (0-1): How easily can we find evidence to test this?
- Risk Level: low/medium/high based on potential impact if wrong

Output as JSON:
{
  "original_thesis": "...",
  "sub_theses": [
    { "content": "...", "importance": 0.9 }
  ],
  "assumptions": [
    { "content": "...", "testability": 0.7, "risk_level": "high" }
  ],
  "key_questions": ["..."]
}`;

    const response = await this.callLLMWithTools(prompt, tools);
    const decomposition = this.parseJSON<HypothesisDecomposition>(response.content);

    if (!decomposition) {
      throw new Error('Failed to parse thesis decomposition');
    }

    return decomposition;
  }

  /**
   * Create hypothesis nodes from decomposition
   */
  private async createHypothesisNodes(
    decomposition: HypothesisDecomposition,
    input: HypothesisBuilderInput
  ): Promise<HypothesisNode[]> {
    const hypotheses: HypothesisNode[] = [];
    const now = Date.now();

    // Create root thesis node
    const rootThesis: HypothesisNode = {
      id: crypto.randomUUID(),
      type: 'thesis',
      content: decomposition.original_thesis || input.thesis,
      confidence: 0.5, // Start at neutral
      status: 'untested',
      metadata: {
        created_at: now,
        updated_at: now,
        created_by: this.config.id,
        source_refs: [],
      },
    };
    hypotheses.push(rootThesis);

    // Create sub-thesis nodes
    // Use importance as initial confidence - higher importance means more critical to thesis
    const subTheses = Array.isArray(decomposition.sub_theses) ? decomposition.sub_theses : [];
    for (const subThesis of subTheses) {
      // Initial confidence based on importance: 0.4-0.6 range to avoid extremes
      // High importance (0.9) -> 0.45 (needs more validation)
      // Low importance (0.3) -> 0.55 (less critical, slightly more confident by default)
      const initialConfidence = 0.5 - (subThesis.importance - 0.5) * 0.2;
      hypotheses.push({
        id: crypto.randomUUID(),
        type: 'sub_thesis',
        content: subThesis.content,
        confidence: Math.round(initialConfidence * 100) / 100,
        status: 'untested',
        metadata: {
          created_at: now,
          updated_at: now,
          created_by: this.config.id,
          source_refs: [],
          importance: subThesis.importance,
        },
      });
    }

    // Create assumption nodes
    // Use testability and risk_level to compute initial confidence
    const assumptions = Array.isArray(decomposition.assumptions) ? decomposition.assumptions : [];
    for (const assumption of assumptions) {
      // Risk level affects initial confidence:
      // - high risk -> 0.35 (needs significant validation)
      // - medium risk -> 0.45
      // - low risk -> 0.55 (less risky, slightly more confident)
      const riskModifier = assumption.risk_level === 'high' ? -0.15
        : assumption.risk_level === 'medium' ? -0.05
        : 0.05;
      // Testability affects confidence: highly testable = easier to validate
      const testabilityModifier = (assumption.testability - 0.5) * 0.1;
      const initialConfidence = 0.5 + riskModifier + testabilityModifier;
      hypotheses.push({
        id: crypto.randomUUID(),
        type: 'assumption',
        content: assumption.content,
        confidence: Math.round(Math.max(0.2, Math.min(0.7, initialConfidence)) * 100) / 100,
        status: 'untested',
        metadata: {
          created_at: now,
          updated_at: now,
          created_by: this.config.id,
          source_refs: [],
          testability: assumption.testability,
          risk_level: assumption.risk_level,
        },
      });
    }

    return hypotheses;
  }

  /**
   * Build causal relationships between hypotheses
   */
  private async buildRelationships(
    hypotheses: HypothesisNode[],
    _decomposition: HypothesisDecomposition
  ): Promise<Array<{
    sourceId: string;
    targetId: string;
    relationship: CausalRelationship;
    strength: number;
    reasoning: string;
  }>> {
    const relationships: Array<{
      sourceId: string;
      targetId: string;
      relationship: CausalRelationship;
      strength: number;
      reasoning: string;
    }> = [];

    const rootThesis = hypotheses.find((h) => h.type === 'thesis');
    if (!rootThesis) return relationships;

    // Link sub-theses to root
    const subTheses = hypotheses.filter((h) => h.type === 'sub_thesis');
    for (const subThesis of subTheses) {
      relationships.push({
        sourceId: subThesis.id,
        targetId: rootThesis.id,
        relationship: 'supports',
        strength: 0.8,
        reasoning: 'Sub-thesis supports overall thesis',
      });
    }

    // Link assumptions to sub-theses
    const assumptions = hypotheses.filter((h) => h.type === 'assumption');
    for (const assumption of assumptions) {
      // Find most relevant sub-thesis based on content overlap
      let bestMatch = subTheses[0];
      let bestScore = 0;

      for (const subThesis of subTheses) {
        const score = this.calculateContentSimilarity(assumption.content, subThesis.content);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = subThesis;
        }
      }

      if (bestMatch) {
        relationships.push({
          sourceId: assumption.id,
          targetId: bestMatch.id,
          relationship: 'requires',
          strength: 0.7,
          reasoning: 'Assumption required for sub-thesis validity',
        });
      }
    }

    // Use LLM to identify additional relationships
    const additionalRelationships = await this.identifyAdditionalRelationships(hypotheses);
    relationships.push(...additionalRelationships);

    return relationships;
  }

  /**
   * Use LLM to identify additional relationships
   */
  private async identifyAdditionalRelationships(
    hypotheses: HypothesisNode[]
  ): Promise<Array<{
    sourceId: string;
    targetId: string;
    relationship: CausalRelationship;
    strength: number;
    reasoning: string;
  }>> {
    const hypothesisList = hypotheses.map((h) => ({
      id: h.id,
      type: h.type,
      content: h.content,
    }));

    const prompt = `Analyze these hypotheses and identify additional causal relationships:

${JSON.stringify(hypothesisList, null, 2)}

For each relationship, specify:
- source_id: The hypothesis that provides support/evidence
- target_id: The hypothesis that depends on the source
- relationship: "requires" | "supports" | "contradicts" | "implies"
- strength: 0-1 indicating relationship strength
- reasoning: Brief explanation

Focus on:
- Dependencies that might not be obvious
- Potential contradictions between hypotheses
- Implications that follow from combinations of hypotheses

Output as JSON array:
[
  { "source_id": "...", "target_id": "...", "relationship": "...", "strength": 0.8, "reasoning": "..." }
]`;

    const response = await this.callLLM(prompt);
    const parsed = this.parseJSON<Array<{
      source_id: string;
      target_id: string;
      relationship: CausalRelationship;
      strength: number;
      reasoning: string;
    }>>(response.content);

    if (!parsed || !Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((r) => ({
      sourceId: r.source_id,
      targetId: r.target_id,
      relationship: r.relationship,
      strength: r.strength,
      reasoning: r.reasoning,
    }));
  }

  /**
   * Calculate content similarity (simple word overlap)
   */
  private calculateContentSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter((w) => w.length > 3));

    let overlap = 0;
    for (const word of words1) {
      if (words2.has(word)) overlap++;
    }

    return overlap / Math.max(words1.size, words2.size, 1);
  }

  /**
   * Get builder tools for thesis decomposition
   */
  private getTools(): AgentTool[] {
    return [
      createTool(
        'search_similar_theses',
        'Search for similar historical theses in institutional memory',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            sector: { type: 'string', description: 'Sector filter' },
          },
          required: ['query'],
        },
        async (input) => {
          if (!this.context?.institutionalMemory) {
            return { results: [] };
          }
          const embedding = await this.embed(input['query'] as string);
          const results = await this.context.institutionalMemory.searchPatterns(embedding, {
            top_k: 5,
            sector: input['sector'] as any,
          });
          return { results };
        }
      ),

      createTool(
        'get_existing_hypotheses',
        'Get existing hypotheses for the engagement',
        { type: 'object', properties: {} },
        async () => {
          if (!this.context) {
            return { hypotheses: [] };
          }
          const hypotheses = await this.context.dealMemory.getAllHypotheses();
          return { hypotheses };
        }
      ),

      createTool(
        'check_assumption_validity',
        'Check if an assumption has been tested in past deals',
        {
          type: 'object',
          properties: {
            assumption: { type: 'string', description: 'The assumption to check' },
          },
          required: ['assumption'],
        },
        async (input) => {
          if (!this.context?.institutionalMemory) {
            return { found: false };
          }
          const embedding = await this.embed(input['assumption'] as string);
          const results = await this.context.institutionalMemory.retrieveReflexions(embedding, {
            top_k: 3,
            min_score: 0.7,
          });
          return {
            found: results.length > 0,
            similar_experiences: results.map((r) => ({
              content: r.content,
              outcome: r.metadata['was_successful'],
            })),
          };
        }
      ),
    ];
  }

  /**
   * Refine hypotheses based on new evidence
   */
  async refineHypotheses(
    hypothesisIds: string[],
    newEvidence: Array<{ content: string; sentiment: 'supporting' | 'contradicting' | 'neutral' }>
  ): Promise<void> {
    if (!this.context) return;

    for (const hypothesisId of hypothesisIds) {
      const hypothesis = await this.context.dealMemory.getHypothesis(hypothesisId);
      if (!hypothesis) continue;

      // Calculate confidence adjustment based on evidence
      let confidenceDelta = 0;
      for (const evidence of newEvidence) {
        if (evidence.sentiment === 'supporting') {
          confidenceDelta += 0.05;
        } else if (evidence.sentiment === 'contradicting') {
          confidenceDelta -= 0.1;
        }
      }

      const newConfidence = Math.max(0, Math.min(1, hypothesis.confidence + confidenceDelta));
      let newStatus = hypothesis.status;

      if (newConfidence >= 0.8) {
        newStatus = 'supported';
      } else if (newConfidence <= 0.2) {
        newStatus = 'refuted';
      } else if (newEvidence.some((e) => e.sentiment === 'contradicting')) {
        newStatus = 'challenged';
      }

      await this.context.dealMemory.updateHypothesisConfidence(
        hypothesisId,
        newConfidence,
        newStatus
      );

      // Emit update event
      this.emitEvent(createHypothesisUpdatedEvent(
        this.context.engagementId,
        hypothesisId,
        {
          confidence: newConfidence,
          confidence_delta: confidenceDelta,
          status: newStatus,
          previous_status: hypothesis.status,
        },
        this.config.id
      ));
    }
  }
}

/**
 * Create a hypothesis builder agent instance
 */
export function createHypothesisBuilderAgent(): HypothesisBuilderAgent {
  return new HypothesisBuilderAgent();
}
