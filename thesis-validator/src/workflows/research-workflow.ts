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
  type ConductorInput,
  type HypothesisBuilderInput,
  type EvidenceGathererInput,
  type ContradictionHunterInput,
  type ComparablesFinderInput,
} from '../agents/index.js';
import { createDealMemory, type DealMemory } from '../memory/deal-memory.js';
import { getInstitutionalMemory } from '../memory/institutional-memory.js';
import { getMarketIntelligence } from '../memory/market-intelligence.js';
import type { Engagement, EngagementEvent, InvestmentThesis, Sector, DealType } from '../models/index.js';
import { createEvent } from '../models/events.js';

/**
 * Research workflow configuration
 */
export interface ResearchWorkflowConfig {
  enableComparablesSearch: boolean;
  enableContradictionAnalysis: boolean;
  contradictionIntensity: 'light' | 'moderate' | 'aggressive';
  maxEvidencePerHypothesis: number;
  parallelAgents: boolean;
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
  private agentContext: AgentContext | null = null;

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

    // Create agent context
    this.agentContext = {
      engagementId: input.engagement.id,
      dealMemory: this.dealMemory,
      institutionalMemory: getInstitutionalMemory(),
      marketIntelligence: getMarketIntelligence(),
      onEvent: input.onEvent,
    };

    // Emit workflow started
    this.emitEvent(input, createEvent(
      'workflow.started',
      input.engagement.id,
      { workflow_type: 'research', engagement_name: input.engagement.name }
    ));

    const agents = createAgentSwarm();

    try {
      // Phase 1: Thesis structuring
      this.emitEvent(input, createEvent(
        'research.progress',
        input.engagement.id,
        { phase: 'thesis_structuring', progress: 0.1 }
      ));

      agents.hypothesisBuilder.setContext(this.agentContext);
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

      // Phase 2: Comparables search (optional)
      let comparablesResult: any = null;
      if (config.enableComparablesSearch) {
        this.emitEvent(input, createEvent(
          'research.progress',
          input.engagement.id,
          { phase: 'comparables_search', progress: 0.2 }
        ));

        agents.comparablesFinder.setContext(this.agentContext);
        comparablesResult = await agents.comparablesFinder.execute({
          thesis: input.thesis.summary,
          sector: input.engagement.target_company.sector,
          dealType: input.engagement.deal_type,
          targetCompany: {
            name: input.engagement.target_company.name,
            description: input.engagement.target_company.description,
            sector: input.engagement.target_company.sector,
          },
        });
      }

      // Phase 3: Evidence gathering
      this.emitEvent(input, createEvent(
        'research.progress',
        input.engagement.id,
        { phase: 'evidence_gathering', progress: 0.4 }
      ));

      const evidenceResults: any[] = [];
      agents.evidenceGatherer.setContext(this.agentContext);

      // Gather evidence for key hypotheses
      const keyHypotheses = hypotheses.filter(
        (h) => h.type === 'thesis' || h.type === 'sub_thesis'
      ).slice(0, 5);

      for (const hypothesis of keyHypotheses) {
        const evidenceResult = await agents.evidenceGatherer.execute({
          query: hypothesis.content,
          hypothesisIds: [hypothesis.id],
          maxResults: config.maxEvidencePerHypothesis,
        });

        if (evidenceResult.success && evidenceResult.data) {
          evidenceResults.push(evidenceResult.data);
        }
      }

      // Phase 4: Contradiction analysis (optional)
      let contradictionResult: any = null;
      if (config.enableContradictionAnalysis) {
        this.emitEvent(input, createEvent(
          'research.progress',
          input.engagement.id,
          { phase: 'contradiction_analysis', progress: 0.7 }
        ));

        agents.contradictionHunter.setContext(this.agentContext);
        contradictionResult = await agents.contradictionHunter.execute({
          hypotheses,
          intensity: config.contradictionIntensity,
        });
      }

      // Phase 5: Synthesis
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

      // Emit workflow completed
      this.emitEvent(input, createEvent(
        'workflow.completed',
        input.engagement.id,
        { workflow_type: 'research' }
      ));

      return {
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
