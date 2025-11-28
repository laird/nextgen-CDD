/**
 * Stress Test Workflow - Hypothesis stress testing
 *
 * Systematic challenge of thesis assumptions:
 * 1. Retrieve thesis and supporting evidence
 * 2. Generate adversarial queries for each assumption
 * 3. Search for contradicting evidence
 * 4. Score and categorize contradictions
 * 5. Update hypothesis confidence
 * 6. Generate stress test report
 */

import type { AgentContext } from '../agents/base-agent.js';
import {
  createContradictionHunterAgent,
  type ContradictionHunterInput,
  type ContradictionHunterOutput,
} from '../agents/index.js';
import type { DealMemory } from '../memory/deal-memory.js';
import type { HypothesisNode, EngagementEvent, ContradictionNode } from '../models/index.js';
import { createEvent, createHypothesisUpdatedEvent } from '../models/events.js';

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
 * Stress test input
 */
export interface StressTestInput {
  engagementId: string;
  dealMemory: DealMemory;
  thesisId?: string;
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
    severity: number;
    explanation: string;
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

    // Get hypotheses to test
    let hypotheses: HypothesisNode[] = [];

    if (input.hypothesisIds && input.hypothesisIds.length > 0) {
      for (const id of input.hypothesisIds) {
        const hypothesis = await input.dealMemory.getHypothesis(id);
        if (hypothesis) {
          hypotheses.push(hypothesis);
        }
      }
    } else if (input.thesisId) {
      // Get all hypotheses from thesis tree
      const tree = await input.dealMemory.getHypothesisTree(input.thesisId);
      if (tree) {
        hypotheses = tree.nodes;
      }
    } else {
      // Get all hypotheses
      hypotheses = await input.dealMemory.getAllHypotheses();
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

    // Create contradiction hunter
    const contradictionHunter = createContradictionHunterAgent();
    contradictionHunter.setContext({
      engagementId: input.engagementId,
      dealMemory: input.dealMemory,
      onEvent: input.onEvent,
    });

    // Test hypotheses
    const results: HypothesisStressTestResult[] = [];

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

      // Run contradiction hunter on this hypothesis
      const hunterResult = await contradictionHunter.execute({
        hypothesisId: hypothesis.id,
        intensity: config.intensity,
      });

      if (!hunterResult.success || !hunterResult.data) {
        continue;
      }

      const data = hunterResult.data;

      // Calculate new confidence
      const contradictionSeverity = data.contradictions
        .filter((c) => c.hypothesisId === hypothesis.id)
        .reduce((sum, c) => sum + c.contradiction.severity, 0);

      const avgSeverity = data.contradictions.length > 0
        ? contradictionSeverity / data.contradictions.length
        : 0;

      const confidenceDelta = -avgSeverity * 0.3;
      const newConfidence = Math.max(0, Math.min(1, hypothesis.confidence + confidenceDelta));

      // Determine status
      let status: HypothesisStressTestResult['status'] = 'passed';
      if (newConfidence < 0.3) {
        status = 'failed';
      } else if (data.contradictions.some((c) => c.contradiction.severity > 0.5)) {
        status = 'challenged';
      }

      // Update hypothesis confidence in memory
      await input.dealMemory.updateHypothesisConfidence(
        hypothesis.id,
        newConfidence,
        status === 'failed' ? 'refuted' : status === 'challenged' ? 'challenged' : hypothesis.status
      );

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
        contradictions: data.contradictions
          .filter((c) => c.hypothesisId === hypothesis.id)
          .slice(0, config.maxContradictionsPerHypothesis)
          .map((c) => ({
            id: c.contradiction.id,
            severity: c.contradiction.severity,
            explanation: c.contradiction.explanation,
            evidencePreview: c.evidenceContent.slice(0, 200),
          })),
        status,
        vulnerabilities: data.riskFactors
          .filter((r) => r.severity === 'high')
          .map((r) => r.description),
      });
    }

    // Aggregate results
    const allContradictions = results.flatMap((r) => r.contradictions);
    const summary = {
      passed: results.filter((r) => r.status === 'passed').length,
      challenged: results.filter((r) => r.status === 'challenged').length,
      failed: results.filter((r) => r.status === 'failed').length,
      totalContradictions: allContradictions.length,
      highSeverityContradictions: allContradictions.filter((c) => c.severity > 0.7).length,
    };

    // Calculate overall vulnerability
    const overallVulnerability = results.length > 0
      ? results.reduce((sum, r) =>
          sum + (r.status === 'failed' ? 1 : r.status === 'challenged' ? 0.5 : 0), 0
        ) / results.length
      : 0;

    // Aggregate bear case themes and risk factors
    const bearCaseThemes: string[] = [];
    const riskFactors: StressTestOutput['riskFactors'] = [];

    // Generate recommendations
    const recommendations = this.generateRecommendations(results, summary);

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
      bearCaseThemes,
      riskFactors,
      summary,
      recommendations,
      executionTimeMs: Date.now() - startTime,
    };
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
      const highSeverity = result.contradictions.filter((c) => c.severity > 0.8);
      for (const c of highSeverity.slice(0, 1)) {
        recommendations.push(
          `Address contradiction: ${c.explanation.slice(0, 100)}`
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
