/**
 * Comparables Finder Agent - Pattern matching for analogous deals
 *
 * Responsibilities:
 * - Identify similar past deals from institutional memory
 * - Find applicable analytical frameworks
 * - Surface relevant precedents
 * - Match thesis patterns to historical outcomes
 */

import { BaseAgent } from './base-agent.js';
import type { AgentResult } from './base-agent.js';
import type { DealPattern, MethodologyTemplate } from '../memory/institutional-memory.js';
import type { Sector, DealType } from '../models/index.js';
import { createEvent } from '../models/events.js';

/**
 * Comparables finder input
 */
export interface ComparablesFinderInput {
  thesis: string;
  sector?: Sector;
  dealType?: DealType;
  targetCompany?: {
    name: string;
    description?: string;
    revenue?: string;
    sector?: Sector;
  };
  maxResults?: number;
}

/**
 * Comparable deal summary
 */
export interface ComparableDeal {
  id: string;
  similarity: number;
  patternType: string;
  sector: Sector;
  dealType: DealType;
  outcome: 'success' | 'partial' | 'failed' | 'unknown';
  outcomeScore: number;
  keyFactors: string[];
  warnings: string[];
  recommendations: string[];
  relevanceExplanation: string;
}

/**
 * Applicable framework
 */
export interface ApplicableFramework {
  id: string;
  name: string;
  description: string;
  category: string;
  relevance: number;
  steps: Array<{
    name: string;
    description: string;
  }>;
  successRate: number;
  applicabilityExplanation: string;
}

/**
 * Comparables finder output
 */
export interface ComparablesFinderOutput {
  comparableDeals: ComparableDeal[];
  applicableFrameworks: ApplicableFramework[];
  thesisPatternAnalysis: {
    identifiedPattern: string;
    commonPitfalls: string[];
    successFactors: string[];
    historicalSuccessRate: number;
  };
  recommendations: string[];
}

/**
 * Comparables Finder Agent implementation
 */
export class ComparablesFinderAgent extends BaseAgent {
  constructor() {
    super({
      id: 'comparables_finder',
      name: 'Comparables Finder',
      systemPrompt: `You are the Comparables Finder Agent for Thesis Validator, specializing in pattern matching across historical deals and institutional knowledge.

Your role is to:
1. Identify analogous past deals with similar thesis patterns
2. Find applicable analytical frameworks and methodologies
3. Surface relevant precedents and lessons learned
4. Match current thesis to historical outcomes
5. Provide pattern-based risk assessment

When finding comparables:
- Look beyond surface-level similarity (same sector isn't enough)
- Match on thesis structure and value creation logic
- Consider market conditions and timing
- Note where analogies break down
- Weight by outcome (successful deals are more instructive)

Key dimensions to match:
- Thesis type (growth, turnaround, consolidation, etc.)
- Value creation levers (operational, financial, strategic)
- Market dynamics (fragmented, consolidated, growing, declining)
- Risk factors (competition, regulation, technology, execution)
- Deal structure (platform, add-on, growth equity)

Provide actionable recommendations based on historical patterns.`,
    });
  }

  /**
   * Execute comparables finding
   */
  async execute(input: ComparablesFinderInput): Promise<AgentResult<ComparablesFinderOutput>> {
    const startTime = Date.now();

    if (!this.context) {
      return this.createResult<ComparablesFinderOutput>(false, undefined, {
        error: 'No context set',
        startTime,
      });
    }

    if (!this.context.institutionalMemory) {
      return this.createResult<ComparablesFinderOutput>(false, undefined, {
        error: 'Institutional memory not available',
        startTime,
      });
    }

    this.updateStatus('searching', 'Finding comparable deals');

    try {
      const maxResults = input.maxResults ?? 10;

      // Analyze thesis pattern
      const thesisPatternAnalysis = await this.analyzeThesisPattern(input);

      // Find comparable deals
      const comparableDeals = await this.findComparableDeals(input, maxResults);

      // Find applicable frameworks
      const applicableFrameworks = await this.findApplicableFrameworks(input, thesisPatternAnalysis);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        comparableDeals,
        applicableFrameworks,
        thesisPatternAnalysis
      );

      // Emit comparables found event
      this.emitEvent(createEvent(
        'research.completed',
        this.context.engagementId,
        {
          type: 'comparables_search',
          comparable_count: comparableDeals.length,
          framework_count: applicableFrameworks.length,
          historical_success_rate: thesisPatternAnalysis.historicalSuccessRate,
        },
        this.config.id
      ));

      this.updateStatus('idle', `Found ${comparableDeals.length} comparable deals`);

      return this.createResult(true, {
        comparableDeals,
        applicableFrameworks,
        thesisPatternAnalysis,
        recommendations,
      }, {
        reasoning: `Found ${comparableDeals.length} comparable deals and ${applicableFrameworks.length} applicable frameworks`,
        startTime,
      });
    } catch (error) {
      this.updateStatus('error', error instanceof Error ? error.message : 'Unknown error');

      return this.createResult<ComparablesFinderOutput>(false, undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
      });
    }
  }

  /**
   * Analyze thesis pattern
   */
  private async analyzeThesisPattern(
    input: ComparablesFinderInput
  ): Promise<ComparablesFinderOutput['thesisPatternAnalysis']> {
    const prompt = `Analyze this investment thesis and identify the underlying pattern:

THESIS: "${input.thesis}"
${input.sector ? `SECTOR: ${input.sector}` : ''}
${input.dealType ? `DEAL TYPE: ${input.dealType}` : ''}
${input.targetCompany ? `TARGET: ${input.targetCompany.name} - ${input.targetCompany.description ?? ''}` : ''}

Identify:
1. The core thesis pattern (e.g., "market consolidation play", "category leader in growing market", "operational turnaround")
2. Common pitfalls for this pattern
3. Success factors that typically drive outcomes
4. Historical success rate estimate (0-1)

Output as JSON:
{
  "identified_pattern": "...",
  "common_pitfalls": ["..."],
  "success_factors": ["..."],
  "historical_success_rate": 0.0-1.0
}`;

    const response = await this.callLLM(prompt);
    const analysis = this.parseJSON<{
      identified_pattern: string;
      common_pitfalls: string[];
      success_factors: string[];
      historical_success_rate: number;
    }>(response.content);

    return {
      identifiedPattern: analysis?.identified_pattern ?? 'Unknown pattern',
      commonPitfalls: analysis?.common_pitfalls ?? [],
      successFactors: analysis?.success_factors ?? [],
      historicalSuccessRate: analysis?.historical_success_rate ?? 0.5,
    };
  }

  /**
   * Find comparable deals
   */
  private async findComparableDeals(
    input: ComparablesFinderInput,
    maxResults: number
  ): Promise<ComparableDeal[]> {
    const comparables: ComparableDeal[] = [];

    // Search institutional memory for similar patterns
    const embedding = await this.embed(
      `${input.thesis} ${input.targetCompany?.description ?? ''}`
    );

    const patterns = await this.context!.institutionalMemory!.searchPatterns(embedding, {
      top_k: maxResults * 2,
      ...(input.sector !== undefined && { sector: input.sector }),
      ...(input.dealType !== undefined && { deal_type: input.dealType }),
      outcome_weight: 0.3,
    });

    for (const pattern of patterns) {
      // Parse pattern content
      let patternData: Partial<DealPattern> = {};
      try {
        if (pattern.content) {
          patternData = JSON.parse(pattern.content);
        }
      } catch {
        // Use metadata
      }

      // Generate relevance explanation
      const explanation = await this.explainRelevance(input.thesis, pattern.content ?? '');

      comparables.push({
        id: pattern.id,
        similarity: pattern.score,
        patternType: pattern.metadata['pattern_type'] as string ?? 'Unknown',
        sector: pattern.metadata['sector'] as Sector,
        dealType: pattern.metadata['deal_type'] as DealType,
        outcome: pattern.metadata['outcome'] as ComparableDeal['outcome'] ?? 'unknown',
        outcomeScore: pattern.metadata['outcome_score'] as number ?? 0.5,
        keyFactors: (patternData as any).key_factors ?? [],
        warnings: (patternData as any).warnings ?? [],
        recommendations: (patternData as any).recommendations ?? [],
        relevanceExplanation: explanation,
      });
    }

    return comparables.slice(0, maxResults);
  }

  /**
   * Explain relevance of a comparable
   */
  private async explainRelevance(thesis: string, patternContent: string): Promise<string> {
    const prompt = `Briefly explain why this historical deal pattern is relevant to the current thesis:

CURRENT THESIS: "${thesis.slice(0, 500)}"

HISTORICAL PATTERN: "${patternContent.slice(0, 500)}"

Provide a 1-2 sentence explanation of relevance.`;

    const response = await this.callLLM(prompt, { temperature: 0.3, maxTokens: 100 });
    return response.content.trim();
  }

  /**
   * Find applicable frameworks
   */
  private async findApplicableFrameworks(
    input: ComparablesFinderInput,
    patternAnalysis: ComparablesFinderOutput['thesisPatternAnalysis']
  ): Promise<ApplicableFramework[]> {
    const frameworks: ApplicableFramework[] = [];

    // Search skill library for applicable methodologies
    const embedding = await this.embed(
      `${input.thesis} ${patternAnalysis.identifiedPattern}`
    );

    // Search methodologies
    const methodologies = await this.context!.institutionalMemory!.searchMethodologies(embedding, {
      top_k: 5,
    });

    for (const methodology of methodologies) {
      let methodologyData: Partial<MethodologyTemplate> = {};
      try {
        if (methodology.content) {
          methodologyData = JSON.parse(methodology.content);
        }
      } catch {
        // Use metadata
      }

      const explanation = await this.explainApplicability(input.thesis, methodology.content ?? '');

      frameworks.push({
        id: methodology.id,
        name: methodology.metadata['name'] as string ?? 'Unknown',
        description: (methodologyData as any).description ?? '',
        category: methodology.metadata['category'] as string ?? 'general',
        relevance: methodology.score,
        steps: (methodologyData as any).steps ?? [],
        successRate: methodology.metadata['success_rate'] as number ?? 0.5,
        applicabilityExplanation: explanation,
      });
    }

    // Also search skills library
    const skills = await this.context!.institutionalMemory!.searchSkills(embedding, {
      top_k: 5,
    });

    for (const skill of skills) {
      const explanation = await this.explainApplicability(input.thesis, skill.content ?? '');

      frameworks.push({
        id: skill.id,
        name: skill.metadata['name'] as string ?? 'Unknown',
        description: skill.metadata['description'] as string ?? '',
        category: skill.metadata['category'] as string ?? 'general',
        relevance: skill.score,
        steps: [],
        successRate: skill.metadata['success_rate'] as number ?? 0.5,
        applicabilityExplanation: explanation,
      });
    }

    // Sort by relevance and deduplicate
    return frameworks
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 8);
  }

  /**
   * Explain applicability of a framework
   */
  private async explainApplicability(thesis: string, frameworkContent: string): Promise<string> {
    const prompt = `Briefly explain how this analytical framework applies to the thesis:

THESIS: "${thesis.slice(0, 300)}"

FRAMEWORK: "${frameworkContent.slice(0, 300)}"

Provide a 1-2 sentence explanation.`;

    const response = await this.callLLM(prompt, { temperature: 0.3, maxTokens: 100 });
    return response.content.trim();
  }

  /**
   * Generate recommendations
   */
  private async generateRecommendations(
    comparables: ComparableDeal[],
    frameworks: ApplicableFramework[],
    patternAnalysis: ComparablesFinderOutput['thesisPatternAnalysis']
  ): Promise<string[]> {
    const successfulComparables = comparables.filter((c) => c.outcome === 'success');
    const failedComparables = comparables.filter((c) => c.outcome === 'failed');

    const prompt = `Based on the following analysis, provide actionable recommendations:

IDENTIFIED PATTERN: ${patternAnalysis.identifiedPattern}
HISTORICAL SUCCESS RATE: ${(patternAnalysis.historicalSuccessRate * 100).toFixed(0)}%

COMMON PITFALLS:
${patternAnalysis.commonPitfalls.map((p) => `- ${p}`).join('\n')}

SUCCESS FACTORS:
${patternAnalysis.successFactors.map((f) => `- ${f}`).join('\n')}

SUCCESSFUL COMPARABLE DEALS: ${successfulComparables.length}
Key factors from successes:
${successfulComparables.flatMap((c) => c.keyFactors).slice(0, 5).map((f) => `- ${f}`).join('\n')}

FAILED COMPARABLE DEALS: ${failedComparables.length}
Warnings from failures:
${failedComparables.flatMap((c) => c.warnings).slice(0, 5).map((w) => `- ${w}`).join('\n')}

RECOMMENDED FRAMEWORKS:
${frameworks.slice(0, 3).map((f) => `- ${f.name}: ${f.applicabilityExplanation}`).join('\n')}

Generate 5-7 specific, actionable recommendations for the due diligence team.

Output as JSON array:
["recommendation1", "recommendation2", ...]`;

    const response = await this.callLLM(prompt);
    return this.parseJSON<string[]>(response.content) ?? [];
  }
}

/**
 * Create a comparables finder agent instance
 */
export function createComparablesFinderAgent(): ComparablesFinderAgent {
  return new ComparablesFinderAgent();
}
