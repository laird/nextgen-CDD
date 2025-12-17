/**
 * Stress Test Workflow - Hypothesis stress testing
 *
 * Systematic challenge of thesis assumptions:
 * 1. Retrieve hypotheses from PostgreSQL
 * 2. Generate adversarial queries for each assumption
 * 3. Search for contradicting evidence
 * 4. Score and categorize contradictions
 * 5. Update hypothesis confidence
 * 6. Persist contradictions to PostgreSQL
 * 7. Generate stress test report
 */

import { generateText } from 'ai';
import {
  HypothesisRepository,
  ContradictionRepository,
  MetricsRepository,
  type HypothesisDTO,
} from '../repositories/index.js';
import type { EngagementEvent } from '../models/index.js';
import { createEvent, createHypothesisUpdatedEvent } from '../models/events.js';
import { webSearch } from '../tools/web-search.js';
import { createModel } from '../services/model-provider.js';

// Initialize repositories
const hypothesisRepo = new HypothesisRepository();
const contradictionRepo = new ContradictionRepository();
const metricsRepo = new MetricsRepository();

/**
 * Stress test configuration
 */
export interface StressTestConfig {
  intensity: 'light' | 'moderate' | 'aggressive';
  focusOnHighConfidence: boolean;
  includeAssumptions: boolean;
  maxContradictionsPerHypothesis: number;
}

/**
 * Default stress test configuration
 */
const defaultConfig: StressTestConfig = {
  intensity: 'moderate',
  focusOnHighConfidence: true,
  includeAssumptions: true,
  maxContradictionsPerHypothesis: 10,
};

/**
 * Stress test input (simplified - no DealMemory required)
 */
export interface StressTestInput {
  engagementId: string;
  hypothesisIds?: string[];
  config?: Partial<StressTestConfig>;
  onEvent?: (event: EngagementEvent) => void;
}

/**
 * Stress test result for a single hypothesis
 */
export interface HypothesisStressTestResult {
  hypothesisId: string;
  hypothesisContent: string;
  originalConfidence: number;
  newConfidence: number;
  contradictions: Array<{
    id: string;
    severity: string;
    description: string;
    evidencePreview: string;
  }>;
  status: 'passed' | 'challenged' | 'failed';
  vulnerabilities: string[];
}

/**
 * Stress test output
 */
export interface StressTestOutput {
  engagementId: string;
  testedHypotheses: number;
  results: HypothesisStressTestResult[];
  overallVulnerability: number;
  bearCaseThemes: string[];
  riskFactors: Array<{
    category: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    mitigation?: string;
  }>;
  summary: {
    passed: number;
    challenged: number;
    failed: number;
    totalContradictions: number;
    highSeverityContradictions: number;
  };
  recommendations: string[];
  executionTimeMs: number;
}

/**
 * Stress Test Workflow
 */
export class StressTestWorkflow {
  private config: StressTestConfig;

  constructor(config?: Partial<StressTestConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Execute stress test workflow
   */
  async execute(input: StressTestInput): Promise<StressTestOutput> {
    const startTime = Date.now();
    const config = { ...this.config, ...input.config };

    // Get hypotheses to test from PostgreSQL
    let hypotheses: HypothesisDTO[] = [];

    if (input.hypothesisIds && input.hypothesisIds.length > 0) {
      for (const id of input.hypothesisIds) {
        const hypothesis = await hypothesisRepo.getById(id);
        if (hypothesis && hypothesis.engagementId === input.engagementId) {
          hypotheses.push(hypothesis);
        }
      }
    } else {
      // Get all hypotheses for engagement
      hypotheses = await hypothesisRepo.getByEngagement(input.engagementId);
    }

    // Filter hypotheses based on config
    if (!config.includeAssumptions) {
      hypotheses = hypotheses.filter((h) => h.type !== 'assumption');
    }

    if (config.focusOnHighConfidence) {
      // Sort by confidence and prioritize higher confidence hypotheses
      hypotheses.sort((a, b) => b.confidence - a.confidence);
    }

    // Emit workflow started
    this.emitEvent(input, createEvent(
      'workflow.started',
      input.engagementId,
      { workflow_type: 'stress_test', hypothesis_count: hypotheses.length }
    ));

    // Test hypotheses
    const results: HypothesisStressTestResult[] = [];
    const allRiskFactors: StressTestOutput['riskFactors'] = [];
    const allBearCaseThemes: string[] = [];

    for (let i = 0; i < hypotheses.length; i++) {
      const hypothesis = hypotheses[i]!;

      // Emit progress
      this.emitEvent(input, createEvent(
        'research.progress',
        input.engagementId,
        {
          phase: 'stress_testing',
          current: i + 1,
          total: hypotheses.length,
          hypothesis_id: hypothesis.id,
        }
      ));

      // Hunt for contradictions for this hypothesis
      const contradictions = await this.huntContradictions(
        input.engagementId,
        hypothesis,
        config.intensity,
        config.maxContradictionsPerHypothesis
      );

      // Calculate new confidence based on contradictions
      const severityScores = contradictions.map((c) => {
        switch (c.severity) {
          case 'high': return 0.9;
          case 'medium': return 0.5;
          case 'low': return 0.2;
          default: return 0.3;
        }
      });
      const avgSeverity = severityScores.length > 0
        ? severityScores.reduce((a, b) => a + b, 0) / severityScores.length
        : 0;

      const confidenceDelta = -avgSeverity * 0.3;
      const newConfidence = Math.max(0, Math.min(1, hypothesis.confidence + confidenceDelta));

      // Determine status
      let status: HypothesisStressTestResult['status'] = 'passed';
      if (newConfidence < 0.3) {
        status = 'failed';
      } else if (contradictions.some((c) => c.severity === 'high')) {
        status = 'challenged';
      }

      // Update hypothesis confidence in PostgreSQL
      await hypothesisRepo.update(hypothesis.id, {
        confidence: newConfidence,
        status: status === 'failed' ? 'refuted' : status === 'challenged' ? 'challenged' : hypothesis.status,
      });

      // Emit hypothesis updated
      this.emitEvent(input, createHypothesisUpdatedEvent(
        input.engagementId,
        hypothesis.id,
        {
          confidence: newConfidence,
          confidence_delta: confidenceDelta,
          status: status,
          previous_status: hypothesis.status,
        }
      ));

      // Build result
      results.push({
        hypothesisId: hypothesis.id,
        hypothesisContent: hypothesis.content,
        originalConfidence: hypothesis.confidence,
        newConfidence,
        contradictions: contradictions.map((c) => ({
          id: c.id,
          severity: c.severity,
          description: c.description,
          evidencePreview: c.description.slice(0, 200),
        })),
        status,
        vulnerabilities: contradictions
          .filter((c) => c.severity === 'high')
          .map((c) => c.description),
      });

      // Generate risk factors for this hypothesis
      if (contradictions.length > 0) {
        const riskFactors = await this.identifyRiskFactors(hypothesis.content, contradictions);
        allRiskFactors.push(...riskFactors);
      }
    }

    // Aggregate results
    const allContradictions = results.flatMap((r) => r.contradictions);
    const summary = {
      passed: results.filter((r) => r.status === 'passed').length,
      challenged: results.filter((r) => r.status === 'challenged').length,
      failed: results.filter((r) => r.status === 'failed').length,
      totalContradictions: allContradictions.length,
      highSeverityContradictions: allContradictions.filter((c) => c.severity === 'high').length,
    };

    // Calculate overall vulnerability
    const overallVulnerability = results.length > 0
      ? results.reduce((sum, r) =>
          sum + (r.status === 'failed' ? 1 : r.status === 'challenged' ? 0.5 : 0), 0
        ) / results.length
      : 0;

    // Generate bear case themes if we have contradictions
    if (allContradictions.length > 0) {
      const themes = await this.generateBearCaseThemes(results);
      allBearCaseThemes.push(...themes);
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(results, summary);

    // Record stress test vulnerability metric
    try {
      await metricsRepo.record({
        engagementId: input.engagementId,
        metricType: 'stress_test_vulnerability',
        value: overallVulnerability,
        metadata: {
          source: 'stress_test_workflow',
          intensity: config.intensity,
          testedHypotheses: hypotheses.length,
          totalContradictions: summary.totalContradictions,
        },
      });

      // Also recalculate overall metrics after stress test
      await metricsRepo.calculateAndRecordMetrics(input.engagementId);
    } catch (error) {
      console.error('[StressTest] Failed to record metrics:', error);
    }

    // Emit workflow completed
    this.emitEvent(input, createEvent(
      'workflow.completed',
      input.engagementId,
      {
        workflow_type: 'stress_test',
        results_summary: summary,
      }
    ));

    return {
      engagementId: input.engagementId,
      testedHypotheses: hypotheses.length,
      results,
      overallVulnerability,
      bearCaseThemes: allBearCaseThemes,
      riskFactors: allRiskFactors,
      summary,
      recommendations,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Hunt for contradictions for a hypothesis
   */
  private async huntContradictions(
    engagementId: string,
    hypothesis: HypothesisDTO,
    intensity: 'light' | 'moderate' | 'aggressive',
    maxContradictions: number
  ): Promise<Array<{ id: string; description: string; severity: 'low' | 'medium' | 'high' }>> {
    const contradictions: Array<{ id: string; description: string; severity: 'low' | 'medium' | 'high' }> = [];

    // Generate adversarial search queries based on intensity
    const queries = await this.generateAdversarialQueries(hypothesis.content, intensity);

    // Search for contradicting evidence
    for (const query of queries) {
      if (contradictions.length >= maxContradictions) break;

      try {
        const maxResults = intensity === 'aggressive' ? 10 : intensity === 'moderate' ? 5 : 3;
        const searchResult = await webSearch(query, {
          maxResults,
          searchDepth: intensity === 'aggressive' ? 'advanced' : 'basic',
        });

        for (const result of searchResult.results) {
          if (contradictions.length >= maxContradictions) break;

          // Analyze if this actually contradicts
          const analysis = await this.analyzeContradiction(hypothesis.content, result.content);

          if (analysis.isContradiction && analysis.severity !== 'none') {
            // Persist contradiction to PostgreSQL
            const contradiction = await contradictionRepo.create({
              engagementId,
              hypothesisId: hypothesis.id,
              description: analysis.explanation,
              severity: analysis.severity,
              ...(analysis.bearCaseTheme ? { bearCaseTheme: analysis.bearCaseTheme } : {}),
              metadata: {
                sourceUrl: result.url,
                sourceTitle: result.title,
                query,
              },
            });

            contradictions.push({
              id: contradiction.id,
              description: analysis.explanation,
              severity: analysis.severity,
            });
          }
        }
      } catch (error) {
        console.error(`[StressTest] Search error for "${query}":`, error);
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

    try {
      const model = createModel();
      const result = await generateText({
        model,
        maxOutputTokens: 1024,
        temperature: 0.5,
        messages: [
          {
            role: 'user',
            content: `Generate ${numQueries} adversarial search queries to find evidence that could CONTRADICT or CHALLENGE this hypothesis:

Hypothesis: "${hypothesis}"

Create queries that would find:
- Problems, failures, or challenges related to this claim
- Expert opinions that disagree
- Historical examples where similar assumptions proved wrong
- Risk factors or threats
- Negative news or developments

Be specific and creative. Output as JSON array:
["query1", "query2", ...]`,
          },
        ],
      });

      const text = result.text;
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const queries = JSON.parse(match[0]) as string[];
        return queries.slice(0, numQueries);
      }
    } catch (error) {
      console.error('[StressTest] Failed to generate adversarial queries:', error);
    }

    // Fallback queries
    return [
      `${hypothesis} problems`,
      `${hypothesis} risks`,
      `${hypothesis} challenges`,
    ].slice(0, numQueries);
  }

  /**
   * Analyze if content contradicts hypothesis
   */
  private async analyzeContradiction(
    hypothesis: string,
    content: string
  ): Promise<{
    isContradiction: boolean;
    severity: 'none' | 'low' | 'medium' | 'high';
    explanation: string;
    bearCaseTheme?: string;
  }> {
    try {
      const model = createModel();
      const result = await generateText({
        model,
        maxOutputTokens: 1024,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: `Analyze if the following evidence contradicts the hypothesis:

HYPOTHESIS: "${hypothesis}"

EVIDENCE: "${content.slice(0, 1500)}"

Determine:
1. Does this evidence contradict or challenge the hypothesis?
2. How severe is the contradiction (none/low/medium/high)?
3. Explain why this contradicts the hypothesis
4. What bear case theme does this support (optional)?

Output as JSON:
{
  "is_contradiction": true/false,
  "severity": "none|low|medium|high",
  "explanation": "...",
  "bear_case_theme": "..."
}`,
          },
        ],
      });

      const text = result.text;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const analysis = JSON.parse(match[0]) as {
          is_contradiction: boolean;
          severity: string;
          explanation: string;
          bear_case_theme?: string;
        };

        return {
          isContradiction: analysis.is_contradiction,
          severity: (analysis.severity as 'none' | 'low' | 'medium' | 'high') || 'none',
          explanation: analysis.explanation || 'Unable to analyze',
          ...(analysis.bear_case_theme ? { bearCaseTheme: analysis.bear_case_theme } : {}),
        };
      }
    } catch (error) {
      console.error('[StressTest] Failed to analyze contradiction:', error);
    }

    return {
      isContradiction: false,
      severity: 'none',
      explanation: 'Unable to analyze',
    };
  }

  /**
   * Identify risk factors from contradictions
   */
  private async identifyRiskFactors(
    hypothesis: string,
    contradictions: Array<{ description: string; severity: string }>
  ): Promise<StressTestOutput['riskFactors']> {
    try {
      const model = createModel();
      const result = await generateText({
        model,
        maxOutputTokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: `Based on these contradictions to the hypothesis, identify key risk factors:

HYPOTHESIS: "${hypothesis}"

CONTRADICTIONS:
${contradictions.map((c) => `- ${c.description} (severity: ${c.severity})`).join('\n')}

Categorize risks into: Market, Competition, Execution, Financial, Regulatory, Technology

For each risk, provide category, description, severity (low/medium/high), and potential mitigation.

Output as JSON array:
[{ "category": "...", "description": "...", "severity": "low|medium|high", "mitigation": "..." }]`,
          },
        ],
      });

      const text = result.text;
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]) as StressTestOutput['riskFactors'];
      }
    } catch (error) {
      console.error('[StressTest] Failed to identify risk factors:', error);
    }

    return [];
  }

  /**
   * Generate bear case themes
   */
  private async generateBearCaseThemes(
    results: HypothesisStressTestResult[]
  ): Promise<string[]> {
    const challengedHypotheses = results.filter((r) => r.status !== 'passed');
    if (challengedHypotheses.length === 0) return [];

    try {
      const model = createModel();
      const result = await generateText({
        model,
        maxOutputTokens: 1024,
        temperature: 0.4,
        messages: [
          {
            role: 'user',
            content: `Based on these challenged hypotheses and contradictions, generate 3-5 key bear case themes:

CHALLENGED HYPOTHESES:
${challengedHypotheses.map((r) => `- ${r.hypothesisContent} (${r.contradictions.length} contradictions, status: ${r.status})`).join('\n')}

Generate overarching themes that capture why this investment thesis could fail.

Output as JSON array:
["theme1", "theme2", ...]`,
          },
        ],
      });

      const text = result.text;
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]) as string[];
      }
    } catch (error) {
      console.error('[StressTest] Failed to generate bear case themes:', error);
    }

    return [];
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(
    results: HypothesisStressTestResult[],
    summary: StressTestOutput['summary']
  ): string[] {
    const recommendations: string[] = [];

    // Failed hypotheses
    const failedResults = results.filter((r) => r.status === 'failed');
    for (const result of failedResults.slice(0, 3)) {
      recommendations.push(
        `CRITICAL: "${result.hypothesisContent.slice(0, 50)}..." has been significantly challenged. Investigate further.`
      );
    }

    // High severity contradictions
    for (const result of results) {
      const highSeverity = result.contradictions.filter((c) => c.severity === 'high');
      for (const c of highSeverity.slice(0, 1)) {
        recommendations.push(
          `Address contradiction: ${c.description.slice(0, 100)}`
        );
      }
    }

    // General recommendations
    if (summary.failed > 0) {
      recommendations.push(
        `${summary.failed} hypothesis(es) failed stress testing. Consider revising the investment thesis.`
      );
    }

    if (summary.challenged > summary.passed) {
      recommendations.push(
        `More hypotheses were challenged than passed. Additional diligence recommended.`
      );
    }

    if (summary.highSeverityContradictions > 3) {
      recommendations.push(
        `${summary.highSeverityContradictions} high-severity contradictions found. Prioritize resolution.`
      );
    }

    return recommendations.slice(0, 10);
  }

  /**
   * Emit event helper
   */
  private emitEvent(input: StressTestInput, event: EngagementEvent): void {
    if (input.onEvent) {
      input.onEvent(event);
    }
  }
}

/**
 * Execute a stress test workflow
 */
export async function executeStressTestWorkflow(
  input: StressTestInput
): Promise<StressTestOutput> {
  const workflow = new StressTestWorkflow(input.config);
  return workflow.execute(input);
}
