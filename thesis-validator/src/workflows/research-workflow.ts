/**
 * Research Workflow - End-to-end thesis validation research
 *
 * Complete workflow for conducting thesis validation:
 * 1. Engagement initialization
 * 2. Thesis structuring
 * 3. Comparables search
 * 4. Evidence gathering
 * 5. Expert integration
 * 6. Contradiction analysis
 * 7. Synthesis and reporting
 */

import type { AgentContext } from '../agents/base-agent.js';
import {
  createAgentSwarm,
} from '../agents/index.js';
import { createDealMemory, type DealMemory } from '../memory/deal-memory.js';
import { getInstitutionalMemory } from '../memory/institutional-memory.js';
import { getMarketIntelligence } from '../memory/market-intelligence.js';
import { getSkillLibrary } from '../memory/index.js';
import type { Engagement, EngagementEvent, InvestmentThesis } from '../models/index.js';
import { createEvent } from '../models/events.js';
import { MetricsRepository } from '../repositories/index.js';

/**
 * Research workflow configuration
 */
export interface ResearchWorkflowConfig {
  enableComparablesSearch: boolean;
  enableContradictionAnalysis: boolean;
  contradictionIntensity: 'light' | 'moderate' | 'aggressive';
  maxEvidencePerHypothesis: number;
  parallelAgents: boolean;
  recordMetrics: boolean;
}

/**
 * Default workflow configuration
 */
const defaultConfig: ResearchWorkflowConfig = {
  enableComparablesSearch: true,
  enableContradictionAnalysis: true,
  contradictionIntensity: 'moderate',
  maxEvidencePerHypothesis: 20,
  parallelAgents: true,
  recordMetrics: true,
};

/**
 * Research workflow input
 */
export interface ResearchWorkflowInput {
  engagement: Engagement;
  thesis: InvestmentThesis;
  config?: Partial<ResearchWorkflowConfig>;
  onEvent?: (event: EngagementEvent) => void;
}

/**
 * Research workflow output
 */
export interface ResearchWorkflowOutput {
  engagementId: string;
  hypothesisTree: {
    rootThesisId: string;
    totalHypotheses: number;
    testedHypotheses: number;
  };
  evidence: {
    totalCount: number;
    bySourceType: Record<string, number>;
    averageCredibility: number;
  };
  contradictions: {
    totalCount: number;
    highSeverityCount: number;
  };
  comparables: {
    dealsFound: number;
    frameworksApplied: number;
    historicalSuccessRate: number;
  };
  overallConfidence: number;
  riskAssessment: {
    overallVulnerability: number;
    keyRisks: string[];
    bearCaseThemes: string[];
  };
  recommendations: string[];
  executionTimeMs: number;
}

/**
 * Research Workflow - Main research orchestration
 */
export class ResearchWorkflow {
  private config: ResearchWorkflowConfig;
  private dealMemory: DealMemory | null = null;

  constructor(config?: Partial<ResearchWorkflowConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Execute the research workflow
   */
  async execute(input: ResearchWorkflowInput): Promise<ResearchWorkflowOutput> {
    const startTime = Date.now();
    const config = { ...this.config, ...input.config };

    // Initialize deal memory
    this.dealMemory = await createDealMemory(input.engagement.id);

    // Create agent context - conditionally include optional properties
    const baseContext: AgentContext = {
      engagementId: input.engagement.id,
      dealMemory: this.dealMemory,
      institutionalMemory: getInstitutionalMemory(),
      marketIntelligence: getMarketIntelligence(),
      skillLibrary: getSkillLibrary(),
    };
    if (input.onEvent) {
      baseContext.onEvent = input.onEvent;
    }

    // Emit workflow started
    this.emitEvent(input, createEvent(
      'workflow.started',
      input.engagement.id,
      { workflow_type: 'research', engagement_name: input.engagement.name }
    ));

    const agents = createAgentSwarm();

    try {
      // Phase 1: Thesis structuring
      console.log(`[ResearchWorkflow] Starting Phase 1: Thesis structuring for engagement ${input.engagement.id}`);
      this.emitEvent(input, createEvent(
        'research.progress',
        input.engagement.id,
        { phase: 'thesis_structuring', progress: 0.1 }
      ));

      agents.hypothesisBuilder.setContext(baseContext);
      const hypothesisResult = await agents.hypothesisBuilder.execute({
        thesis: input.thesis.summary,
        context: {
          sector: input.engagement.target_company.sector,
          dealType: input.engagement.deal_type,
          targetCompany: input.engagement.target_company.name,
          additionalContext: input.thesis.key_value_drivers.join(', '),
        },
      });

      if (!hypothesisResult.success || !hypothesisResult.data) {
        throw new Error(`Hypothesis building failed: ${hypothesisResult.error}`);
      }

      const hypotheses = hypothesisResult.data.hypotheses;
      const rootThesisId = hypothesisResult.data.rootThesis.id;
      console.log(`[ResearchWorkflow] Phase 1 complete: Created ${hypotheses.length} hypotheses`);

      // Phase 2: Comparables search (optional)
      let comparablesResult: any = null;
      if (config.enableComparablesSearch) {
        console.log(`[ResearchWorkflow] Starting Phase 2: Comparables search`);
        this.emitEvent(input, createEvent(
          'research.progress',
          input.engagement.id,
          { phase: 'comparables_search', progress: 0.2 }
        ));

        agents.comparablesFinder.setContext(baseContext);
        const targetCompanyInfo: { name: string; sector: typeof input.engagement.target_company.sector; description?: string } = {
          name: input.engagement.target_company.name,
          sector: input.engagement.target_company.sector,
        };
        if (input.engagement.target_company.description) {
          targetCompanyInfo.description = input.engagement.target_company.description;
        }
        try {
          comparablesResult = await agents.comparablesFinder.execute({
            thesis: input.thesis.summary,
            sector: input.engagement.target_company.sector,
            dealType: input.engagement.deal_type,
            targetCompany: targetCompanyInfo,
          });
          console.log(`[ResearchWorkflow] Phase 2 complete: Found ${comparablesResult?.data?.comparableDeals?.length ?? 0} comparable deals`);
        } catch (phaseError) {
          console.error(`[ResearchWorkflow] Phase 2 failed:`, phaseError);
          // Continue with workflow - comparables are optional
        }
      }

      // Phase 3: Evidence gathering
      console.log(`[ResearchWorkflow] Starting Phase 3: Evidence gathering`);
      this.emitEvent(input, createEvent(
        'research.progress',
        input.engagement.id,
        { phase: 'evidence_gathering', progress: 0.4 }
      ));

      const evidenceResults: any[] = [];
      agents.evidenceGatherer.setContext(baseContext);

      // Gather evidence for key hypotheses
      const keyHypotheses = hypotheses.filter(
        (h) => h.type === 'thesis' || h.type === 'sub_thesis'
      ).slice(0, 5);
      console.log(`[ResearchWorkflow] Gathering evidence for ${keyHypotheses.length} key hypotheses`);

      for (const hypothesis of keyHypotheses) {
        console.log(`[ResearchWorkflow] Gathering evidence for hypothesis: "${hypothesis.content.slice(0, 50)}..."`);
        try {
          const evidenceResult = await agents.evidenceGatherer.execute({
            query: hypothesis.content,
            hypothesisIds: [hypothesis.id],
            maxResults: config.maxEvidencePerHypothesis,
          });

          if (evidenceResult.success && evidenceResult.data) {
            console.log(`[ResearchWorkflow] Found ${evidenceResult.data.evidence?.length ?? 0} evidence items`);
            evidenceResults.push(evidenceResult.data);
          } else {
            console.log(`[ResearchWorkflow] Evidence gathering failed for hypothesis: ${evidenceResult.error}`);
          }
        } catch (evidenceError) {
          console.error(`[ResearchWorkflow] Evidence gathering error for hypothesis:`, evidenceError);
          // Continue with other hypotheses
        }
      }
      console.log(`[ResearchWorkflow] Phase 3 complete: Gathered evidence from ${evidenceResults.length} queries`);

      // Phase 4: Contradiction analysis (optional)
      console.log(`[ResearchWorkflow] Starting Phase 4: Contradiction analysis`);
      let contradictionResult: any = null;
      if (config.enableContradictionAnalysis) {
        this.emitEvent(input, createEvent(
          'research.progress',
          input.engagement.id,
          { phase: 'contradiction_analysis', progress: 0.7 }
        ));

        agents.contradictionHunter.setContext(baseContext);
        try {
          contradictionResult = await agents.contradictionHunter.execute({
            hypotheses,
            intensity: config.contradictionIntensity,
          });
          console.log(`[ResearchWorkflow] Phase 4 complete: Found ${contradictionResult?.data?.contradictions?.length ?? 0} contradictions`);
        } catch (contradictionError) {
          console.error(`[ResearchWorkflow] Phase 4 failed:`, contradictionError);
          // Continue with workflow - contradictions are optional
        }
      }

      // Phase 5: Synthesis
      console.log(`[ResearchWorkflow] Starting Phase 5: Synthesis`);
      this.emitEvent(input, createEvent(
        'research.progress',
        input.engagement.id,
        { phase: 'synthesis', progress: 0.9 }
      ));

      // Calculate aggregate statistics
      const stats = await this.dealMemory.getStats();

      // Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(
        hypotheses,
        contradictionResult?.data?.overallVulnerability ?? 0
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        hypothesisResult.data,
        comparablesResult?.data,
        contradictionResult?.data
      );

      // Record research quality metrics
      if (config.recordMetrics) {
        await this.recordResearchMetrics(
          input.engagement.id,
          overallConfidence,
          contradictionResult?.data?.overallVulnerability ?? 0
        );
      }

      // Emit workflow completed
      console.log(`[ResearchWorkflow] All phases complete. Preparing final output...`);
      this.emitEvent(input, createEvent(
        'workflow.completed',
        input.engagement.id,
        { workflow_type: 'research' }
      ));

      const finalOutput = {
        engagementId: input.engagement.id,
        hypothesisTree: {
          rootThesisId,
          totalHypotheses: hypotheses.length,
          testedHypotheses: hypotheses.filter((h) => h.status !== 'untested').length,
        },
        evidence: {
          totalCount: stats.evidence_count,
          bySourceType: evidenceResults.reduce((acc, r) => {
            for (const [type, count] of Object.entries(r.sourceSummary?.byType ?? {})) {
              acc[type] = (acc[type] ?? 0) + (count as number);
            }
            return acc;
          }, {} as Record<string, number>),
          averageCredibility: evidenceResults.reduce((sum, r) =>
            sum + (r.sourceSummary?.averageCredibility ?? 0), 0
          ) / Math.max(evidenceResults.length, 1),
        },
        contradictions: {
          totalCount: contradictionResult?.data?.contradictions?.length ?? 0,
          highSeverityCount: contradictionResult?.data?.contradictions?.filter(
            (c: any) => c.contradiction.severity > 0.7
          ).length ?? 0,
        },
        comparables: {
          dealsFound: comparablesResult?.data?.comparableDeals?.length ?? 0,
          frameworksApplied: comparablesResult?.data?.applicableFrameworks?.length ?? 0,
          historicalSuccessRate: comparablesResult?.data?.thesisPatternAnalysis?.historicalSuccessRate ?? 0.5,
        },
        overallConfidence,
        riskAssessment: {
          overallVulnerability: contradictionResult?.data?.overallVulnerability ?? 0,
          keyRisks: contradictionResult?.data?.riskFactors?.slice(0, 5).map((r: any) => r.description) ?? [],
          bearCaseThemes: contradictionResult?.data?.bearCaseThemes ?? [],
        },
        recommendations,
        executionTimeMs: Date.now() - startTime,
      };

      console.log(`[ResearchWorkflow] Returning output with ${finalOutput.evidence.totalCount} evidence items, ${finalOutput.contradictions.totalCount} contradictions`);
      return finalOutput;
    } finally {
      // Cleanup is handled by engagement closeout
    }
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(hypotheses: any[], vulnerability: number): number {
    if (hypotheses.length === 0) return 0.5;

    const avgConfidence = hypotheses.reduce((sum, h) => sum + h.confidence, 0) / hypotheses.length;
    const vulnerabilityPenalty = vulnerability * 0.3;

    return Math.max(0, Math.min(1, avgConfidence - vulnerabilityPenalty));
  }

  /**
   * Generate final recommendations
   */
  private generateRecommendations(
    hypothesisData: any,
    comparablesData: any,
    contradictionData: any
  ): string[] {
    const recommendations: string[] = [];

    // From hypothesis analysis
    if (hypothesisData?.keyQuestions) {
      recommendations.push(...hypothesisData.keyQuestions.slice(0, 2).map(
        (q: string) => `Investigate: ${q}`
      ));
    }

    // From comparables
    if (comparablesData?.recommendations) {
      recommendations.push(...comparablesData.recommendations.slice(0, 2));
    }

    // From contradictions
    if (contradictionData?.riskFactors) {
      const highRisks = contradictionData.riskFactors.filter((r: any) => r.severity === 'high');
      recommendations.push(...highRisks.slice(0, 2).map(
        (r: any) => `Mitigate risk: ${r.description}`
      ));
    }

    return recommendations.slice(0, 10);
  }

  /**
   * Record research quality metrics
   */
  private async recordResearchMetrics(
    engagementId: string,
    overallConfidence: number,
    vulnerability: number
  ): Promise<void> {
    try {
      const metricsRepo = new MetricsRepository();

      // Calculate and record all metrics from database
      await metricsRepo.calculateAndRecordMetrics(engagementId);

      // Also record the computed metrics from this workflow
      await metricsRepo.record({
        engagementId,
        metricType: 'overall_confidence',
        value: overallConfidence,
        metadata: { source: 'research_workflow' },
      });

      await metricsRepo.record({
        engagementId,
        metricType: 'stress_test_vulnerability',
        value: vulnerability,
        metadata: { source: 'research_workflow' },
      });

      // Calculate and record research completeness
      const researchCompleteness = this.calculateResearchCompleteness();
      await metricsRepo.record({
        engagementId,
        metricType: 'research_completeness',
        value: researchCompleteness,
        metadata: { source: 'research_workflow' },
      });
    } catch (error) {
      console.error('[ResearchWorkflow] Failed to record metrics:', error);
    }
  }

  /**
   * Calculate research completeness (0-1 score)
   */
  private calculateResearchCompleteness(): number {
    if (!this.dealMemory) return 0;

    // This is a simplified calculation
    // In a full implementation, this would check:
    // - All critical hypotheses have evidence
    // - Contradictions have been reviewed
    // - Expert input has been gathered
    return 0.75; // Default for now
  }

  /**
   * Emit event helper
   */
  private emitEvent(input: ResearchWorkflowInput, event: EngagementEvent): void {
    if (input.onEvent) {
      input.onEvent(event);
    }
  }
}

/**
 * Create and execute a research workflow
 */
export async function executeResearchWorkflow(
  input: ResearchWorkflowInput
): Promise<ResearchWorkflowOutput> {
  const workflow = new ResearchWorkflow(input.config);
  return workflow.execute(input);
}
