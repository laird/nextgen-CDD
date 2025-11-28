/**
 * Contradiction Hunter Agent - Adversarial research for disconfirmation
 *
 * Responsibilities:
 * - Actively seek disconfirming evidence
 * - Identify thesis vulnerabilities
 * - Surface counterarguments
 * - Generate bear case scenarios
 */

import { BaseAgent, createTool } from './base-agent.js';
import type { AgentResult, AgentTool } from './base-agent.js';
import type { HypothesisNode, ContradictionNode } from '../models/index.js';
import { createContradictionFoundEvent, createHypothesisUpdatedEvent } from '../models/events.js';
import { webSearch } from '../tools/web-search.js';

/**
 * Contradiction hunter input
 */
export interface ContradictionHunterInput {
  hypothesisId?: string;
  hypotheses?: HypothesisNode[];
  intensity?: 'light' | 'moderate' | 'aggressive';
}

/**
 * Contradiction hunter output
 */
export interface ContradictionHunterOutput {
  contradictions: Array<{
    hypothesisId: string;
    hypothesisContent: string;
    contradiction: ContradictionNode;
    evidenceContent: string;
  }>;
  bearCaseThemes: string[];
  riskFactors: Array<{
    category: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    mitigation?: string;
  }>;
  overallVulnerability: number;
}

/**
 * Contradiction Hunter Agent implementation
 */
export class ContradictionHunterAgent extends BaseAgent {
  constructor() {
    super({
      id: 'contradiction_hunter',
      name: 'Contradiction Hunter',
      systemPrompt: `You are the Contradiction Hunter Agent for Thesis Validator, an adversarial research agent that actively challenges investment theses.

Your role is to:
1. Find evidence that contradicts or challenges hypotheses
2. Identify hidden risks and vulnerabilities
3. Generate bear case scenarios
4. Surface counterarguments that bulls might dismiss
5. Test the robustness of the investment thesis

Your mindset:
- Be skeptical of every assumption
- Actively look for reasons why the thesis could be wrong
- Consider what could go wrong in different scenarios
- Think about what information might be missing
- Challenge confirmation bias

When searching for contradictions:
- Use adversarial search queries (e.g., "company name problems", "industry challenges")
- Look for negative news, failed competitors, regulatory risks
- Search for expert opinions that disagree with the thesis
- Find historical examples where similar theses failed
- Consider macroeconomic and market timing risks

For each contradiction found:
- Rate severity (how much it damages the thesis)
- Assess credibility of the contradicting evidence
- Note if it can be explained away or is fundamental
- Suggest what additional diligence is needed`,
    });
  }

  /**
   * Execute contradiction hunting
   */
  async execute(input: ContradictionHunterInput): Promise<AgentResult<ContradictionHunterOutput>> {
    const startTime = Date.now();

    if (!this.context) {
      return this.createResult(false, undefined, {
        error: 'No context set',
        startTime,
      });
    }

    this.updateStatus('searching', 'Hunting for contradictions');

    try {
      // Get hypotheses to challenge
      let hypotheses: HypothesisNode[] = [];

      if (input.hypotheses) {
        hypotheses = input.hypotheses;
      } else if (input.hypothesisId) {
        const hypothesis = await this.context.dealMemory.getHypothesis(input.hypothesisId);
        if (hypothesis) {
          hypotheses = [hypothesis];
        }
      } else {
        hypotheses = await this.context.dealMemory.getAllHypotheses();
      }

      if (hypotheses.length === 0) {
        return this.createResult(true, {
          contradictions: [],
          bearCaseThemes: [],
          riskFactors: [],
          overallVulnerability: 0,
        }, {
          reasoning: 'No hypotheses to challenge',
          startTime,
        });
      }

      const intensity = input.intensity ?? 'moderate';
      const contradictions: ContradictionHunterOutput['contradictions'] = [];

      // Hunt for contradictions for each hypothesis
      for (const hypothesis of hypotheses) {
        const hypothesisContradictions = await this.huntContradictions(hypothesis, intensity);
        contradictions.push(...hypothesisContradictions);

        // Update hypothesis confidence if contradictions found
        if (hypothesisContradictions.length > 0) {
          const avgSeverity = hypothesisContradictions.reduce(
            (sum, c) => sum + c.contradiction.severity, 0
          ) / hypothesisContradictions.length;

          const confidenceDelta = -avgSeverity * 0.2;
          const newConfidence = Math.max(0, Math.min(1, hypothesis.confidence + confidenceDelta));

          await this.context.dealMemory.updateHypothesisConfidence(
            hypothesis.id,
            newConfidence,
            hypothesisContradictions.some((c) => c.contradiction.severity > 0.7) ? 'challenged' : hypothesis.status
          );

          this.emitEvent(createHypothesisUpdatedEvent(
            this.context.engagementId,
            hypothesis.id,
            {
              confidence: newConfidence,
              confidence_delta: confidenceDelta,
              status: 'challenged',
              previous_status: hypothesis.status,
            },
            this.config.id
          ));
        }
      }

      // Generate bear case themes
      const bearCaseThemes = await this.generateBearCaseThemes(hypotheses, contradictions);

      // Identify risk factors
      const riskFactors = await this.identifyRiskFactors(hypotheses, contradictions);

      // Calculate overall vulnerability
      const overallVulnerability = this.calculateVulnerability(contradictions, riskFactors);

      this.updateStatus('idle', `Found ${contradictions.length} contradictions`);

      return this.createResult(true, {
        contradictions,
        bearCaseThemes,
        riskFactors,
        overallVulnerability,
      }, {
        reasoning: `Found ${contradictions.length} contradictions, ${bearCaseThemes.length} bear case themes, ${riskFactors.length} risk factors`,
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
   * Hunt for contradictions to a specific hypothesis
   */
  private async huntContradictions(
    hypothesis: HypothesisNode,
    intensity: 'light' | 'moderate' | 'aggressive'
  ): Promise<ContradictionHunterOutput['contradictions']> {
    const contradictions: ContradictionHunterOutput['contradictions'] = [];

    // Generate adversarial search queries
    const queries = await this.generateAdversarialQueries(hypothesis.content, intensity);

    // Search for contradicting evidence
    for (const query of queries) {
      try {
        const searchResult = await webSearch(query, {
          maxResults: intensity === 'aggressive' ? 10 : intensity === 'moderate' ? 5 : 3,
          searchDepth: intensity === 'aggressive' ? 'advanced' : 'basic',
        });

        for (const result of searchResult.results) {
          // Analyze if this actually contradicts
          const analysis = await this.analyzeContradiction(hypothesis.content, result.content);

          if (analysis.isContradiction && analysis.severity > 0.3) {
            // Store contradiction
            const contradiction = await this.context!.dealMemory.addContradiction({
              evidence_id: crypto.randomUUID(),
              hypothesis_id: hypothesis.id,
              severity: analysis.severity,
              explanation: analysis.explanation,
            });

            contradictions.push({
              hypothesisId: hypothesis.id,
              hypothesisContent: hypothesis.content,
              contradiction,
              evidenceContent: result.content,
            });

            // Emit contradiction event
            this.emitEvent(createContradictionFoundEvent(
              this.context!.engagementId,
              {
                contradiction_id: contradiction.id,
                evidence_id: contradiction.evidence_id,
                hypothesis_id: hypothesis.id,
                severity: contradiction.severity,
                explanation: contradiction.explanation,
              },
              this.config.id
            ));
          }
        }
      } catch (error) {
        console.error(`[ContradictionHunter] Search error for "${query}":`, error);
      }
    }

    return contradictions;
  }

  /**
   * Generate adversarial search queries
   */
  private async generateAdversarialQueries(
    hypothesis: string,
    intensity: 'light' | 'moderate' | 'aggressive'
  ): Promise<string[]> {
    const numQueries = intensity === 'aggressive' ? 8 : intensity === 'moderate' ? 5 : 3;

    const prompt = `Generate ${numQueries} adversarial search queries to find evidence that could CONTRADICT or CHALLENGE this hypothesis:

Hypothesis: "${hypothesis}"

Create queries that would find:
- Problems, failures, or challenges related to this claim
- Expert opinions that disagree
- Historical examples where similar assumptions proved wrong
- Risk factors or threats
- Negative news or developments

Be specific and creative. Output as JSON array:
["query1", "query2", ...]`;

    const response = await this.callLLM(prompt, { temperature: 0.5 });
    const queries = this.parseJSON<string[]>(response.content);

    return queries ?? [
      `${hypothesis} problems`,
      `${hypothesis} risks`,
      `${hypothesis} challenges`,
    ];
  }

  /**
   * Analyze if content contradicts hypothesis
   */
  private async analyzeContradiction(
    hypothesis: string,
    content: string
  ): Promise<{
    isContradiction: boolean;
    severity: number;
    explanation: string;
  }> {
    const prompt = `Analyze if the following evidence contradicts the hypothesis:

HYPOTHESIS: "${hypothesis}"

EVIDENCE: "${content.slice(0, 1500)}"

Determine:
1. Does this evidence contradict or challenge the hypothesis?
2. How severe is the contradiction (0-1)?
3. Explain why this contradicts the hypothesis

Output as JSON:
{
  "is_contradiction": true/false,
  "severity": 0.0-1.0,
  "explanation": "..."
}`;

    const response = await this.callLLM(prompt, { temperature: 0.2 });
    const analysis = this.parseJSON<{
      is_contradiction: boolean;
      severity: number;
      explanation: string;
    }>(response.content);

    return {
      isContradiction: analysis?.is_contradiction ?? false,
      severity: analysis?.severity ?? 0,
      explanation: analysis?.explanation ?? 'Unable to analyze',
    };
  }

  /**
   * Generate bear case themes
   */
  private async generateBearCaseThemes(
    hypotheses: HypothesisNode[],
    contradictions: ContradictionHunterOutput['contradictions']
  ): Promise<string[]> {
    const prompt = `Based on the following hypotheses and contradictions found, generate key bear case themes:

HYPOTHESES:
${hypotheses.map((h) => `- ${h.content}`).join('\n')}

CONTRADICTIONS:
${contradictions.map((c) => `- ${c.contradiction.explanation}`).join('\n')}

Generate 3-5 overarching bear case themes that capture the main reasons this investment thesis could fail.

Output as JSON array:
["theme1", "theme2", ...]`;

    const response = await this.callLLM(prompt);
    return this.parseJSON<string[]>(response.content) ?? [];
  }

  /**
   * Identify risk factors
   */
  private async identifyRiskFactors(
    hypotheses: HypothesisNode[],
    contradictions: ContradictionHunterOutput['contradictions']
  ): Promise<ContradictionHunterOutput['riskFactors']> {
    const prompt = `Based on the following hypotheses and contradictions, identify key risk factors:

HYPOTHESES:
${hypotheses.map((h) => `- ${h.content}`).join('\n')}

CONTRADICTIONS:
${contradictions.map((c) => `- ${c.contradiction.explanation} (severity: ${c.contradiction.severity})`).join('\n')}

Categorize risks into:
- Market risks
- Competition risks
- Execution risks
- Financial risks
- Regulatory risks
- Technology risks

For each risk, provide:
- Category
- Description
- Severity (low/medium/high)
- Potential mitigation

Output as JSON:
[{ "category": "...", "description": "...", "severity": "low|medium|high", "mitigation": "..." }]`;

    const response = await this.callLLM(prompt);
    const riskFactors = this.parseJSON<ContradictionHunterOutput['riskFactors']>(response.content);

    return riskFactors ?? [];
  }

  /**
   * Calculate overall thesis vulnerability
   */
  private calculateVulnerability(
    contradictions: ContradictionHunterOutput['contradictions'],
    riskFactors: ContradictionHunterOutput['riskFactors']
  ): number {
    if (contradictions.length === 0 && riskFactors.length === 0) return 0;

    // Weight contradictions by severity
    const contradictionScore = contradictions.reduce(
      (sum, c) => sum + c.contradiction.severity, 0
    ) / Math.max(contradictions.length, 1);

    // Weight risk factors by severity
    const severityMap = { low: 0.2, medium: 0.5, high: 0.9 };
    const riskScore = riskFactors.reduce(
      (sum, r) => sum + severityMap[r.severity], 0
    ) / Math.max(riskFactors.length, 1);

    // Combine scores (contradictions weighted higher)
    return Math.min(1, (contradictionScore * 0.6) + (riskScore * 0.4));
  }

  /**
   * Get hunter tools
   */
  private getTools(): AgentTool[] {
    return [
      createTool(
        'adversarial_search',
        'Search for contradicting evidence',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Adversarial search query' },
          },
          required: ['query'],
        },
        async (input) => {
          const result = await webSearch(input['query'] as string, {
            maxResults: 10,
            searchDepth: 'advanced',
          });
          return result;
        }
      ),

      createTool(
        'get_hypothesis',
        'Get hypothesis details',
        {
          type: 'object',
          properties: {
            hypothesis_id: { type: 'string', description: 'Hypothesis ID' },
          },
          required: ['hypothesis_id'],
        },
        async (input) => {
          if (!this.context) return { error: 'No context' };
          return this.context.dealMemory.getHypothesis(input['hypothesis_id'] as string);
        }
      ),

      createTool(
        'search_past_failures',
        'Search for past deals that failed with similar theses',
        {
          type: 'object',
          properties: {
            thesis_pattern: { type: 'string', description: 'Thesis pattern to search' },
          },
          required: ['thesis_pattern'],
        },
        async (input) => {
          if (!this.context?.institutionalMemory) return { results: [] };
          const embedding = await this.embed(input['thesis_pattern'] as string);
          const results = await this.context.institutionalMemory.retrieveReflexions(embedding, {
            top_k: 5,
            filters: { was_successful: false },
          });
          return { results };
        }
      ),
    ];
  }
}

/**
 * Create a contradiction hunter agent instance
 */
export function createContradictionHunterAgent(): ContradictionHunterAgent {
  return new ContradictionHunterAgent();
}
