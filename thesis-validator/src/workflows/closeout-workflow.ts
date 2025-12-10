/**
 * Closeout Workflow - Engagement wrap-up and learning capture
 *
 * Finalizes engagements and captures institutional learning:
 * 1. Generate final engagement report
 * 2. Capture reflexion episodes
 * 3. Update skill library
 * 4. Store anonymized patterns
 * 5. Archive or purge deal memory
 */

import type { DealMemory } from '../memory/deal-memory.js';
import { getInstitutionalMemory, type DealPattern } from '../memory/institutional-memory.js';
import { getReflexionStore } from '../memory/reflexion-store.js';
import type { Engagement, EngagementEvent } from '../models/index.js';
import { createEvent } from '../models/events.js';
import { embed } from '../tools/embedding.js';

/**
 * Closeout configuration
 */
export interface CloseoutConfig {
  captureReflexions: boolean;
  updateSkillLibrary: boolean;
  storePatterns: boolean;
  anonymize: boolean;
  archiveDealMemory: boolean;
  purgeDealMemory: boolean;
  retentionDays?: number;
}

/**
 * Default closeout configuration
 */
const defaultConfig: CloseoutConfig = {
  captureReflexions: true,
  updateSkillLibrary: true,
  storePatterns: true,
  anonymize: true,
  archiveDealMemory: true,
  purgeDealMemory: false,
  retentionDays: 365,
};

/**
 * Closeout input
 */
export interface CloseoutInput {
  engagement: Engagement;
  dealMemory: DealMemory;
  outcome?: {
    result: 'invested' | 'passed' | 'lost' | 'ongoing';
    outcomeScore?: number;
    learnings?: string[];
    whatWorked?: string[];
    whatMissed?: string[];
  };
  config?: Partial<CloseoutConfig>;
  onEvent?: (event: EngagementEvent) => void;
}

/**
 * Reflexion episode summary
 */
export interface ReflexionSummary {
  id: string;
  taskType: string;
  outcomeScore: number;
  keyLearnings: string[];
}

/**
 * Closeout output
 */
export interface CloseoutOutput {
  engagementId: string;
  report: {
    summary: string;
    hypothesesTested: number;
    evidenceGathered: number;
    contradictionsFound: number;
    expertCallsConducted: number;
    overallConfidence: number;
    keyFindings: string[];
    recommendations: string[];
  };
  reflexions: ReflexionSummary[];
  patternsStored: number;
  skillsUpdated: number;
  archiveStatus: 'archived' | 'purged' | 'retained';
  executionTimeMs: number;
}

/**
 * Closeout Workflow
 */
export class CloseoutWorkflow {
  private config: CloseoutConfig;

  constructor(config?: Partial<CloseoutConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Execute closeout workflow
   */
  async execute(input: CloseoutInput): Promise<CloseoutOutput> {
    const startTime = Date.now();
    const config = { ...this.config, ...input.config };

    // Emit workflow started
    this.emitEvent(input, createEvent(
      'workflow.started',
      input.engagement.id,
      { workflow_type: 'closeout' }
    ));

    // Get deal memory statistics
    const stats = await input.dealMemory.getStats();

    // Generate final report
    const report = await this.generateReport(input, stats);

    // Capture reflexion episodes
    const reflexions: ReflexionSummary[] = [];
    if (config.captureReflexions) {
      const captured = await this.captureReflexions(input, stats);
      reflexions.push(...captured);
    }

    // Store anonymized patterns
    let patternsStored = 0;
    if (config.storePatterns && input.outcome) {
      patternsStored = await this.storePatterns(input);
    }

    // Update skill library
    let skillsUpdated = 0;
    if (config.updateSkillLibrary && input.outcome) {
      skillsUpdated = await this.updateSkills(input);
    }

    // Handle deal memory
    let archiveStatus: CloseoutOutput['archiveStatus'] = 'retained';
    if (config.purgeDealMemory) {
      await input.dealMemory.destroy();
      archiveStatus = 'purged';
    } else if (config.archiveDealMemory) {
      // In production, would archive to cold storage
      archiveStatus = 'archived';
    }

    // Update engagement status
    // In production, would update engagement in database

    // Emit workflow completed
    this.emitEvent(input, createEvent(
      'workflow.completed',
      input.engagement.id,
      { workflow_type: 'closeout', archive_status: archiveStatus }
    ));

    return {
      engagementId: input.engagement.id,
      report,
      reflexions,
      patternsStored,
      skillsUpdated,
      archiveStatus,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Generate final engagement report
   */
  private async generateReport(
    input: CloseoutInput,
    stats: {
      hypothesis_count: number;
      evidence_count: number;
      transcript_count: number;
      document_count: number;
      edge_count: number;
    }
  ): Promise<CloseoutOutput['report']> {
    // Get all hypotheses
    const hypotheses = await input.dealMemory.getAllHypotheses();

    // Calculate overall confidence
    const overallConfidence = hypotheses.length > 0
      ? hypotheses.reduce((sum, h) => sum + h.confidence, 0) / hypotheses.length
      : 0.5;

    // Get contradictions
    const contradictions: any[] = [];
    for (const hypothesis of hypotheses) {
      const hypothesisContradictions = await input.dealMemory.getContradictions(hypothesis.id);
      contradictions.push(...hypothesisContradictions);
    }

    // Generate key findings
    const keyFindings = this.extractKeyFindings(hypotheses, contradictions);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      hypotheses,
      contradictions,
      input.outcome
    );

    // Generate summary
    const summary = this.generateSummary(input.engagement, stats, overallConfidence);

    return {
      summary,
      hypothesesTested: hypotheses.filter((h) => h.status !== 'untested').length,
      evidenceGathered: stats.evidence_count,
      contradictionsFound: contradictions.length,
      expertCallsConducted: new Set(
        // Would need to track call IDs properly
      ).size,
      overallConfidence,
      keyFindings,
      recommendations,
    };
  }

  /**
   * Extract key findings
   */
  private extractKeyFindings(hypotheses: any[], contradictions: any[]): string[] {
    const findings: string[] = [];

    // High confidence supported hypotheses
    const supported = hypotheses.filter((h) => h.status === 'supported' && h.confidence > 0.7);
    for (const h of supported.slice(0, 3)) {
      findings.push(`SUPPORTED: ${h.content.slice(0, 100)}`);
    }

    // Challenged hypotheses
    const challenged = hypotheses.filter((h) => h.status === 'challenged');
    for (const h of challenged.slice(0, 2)) {
      findings.push(`CHALLENGED: ${h.content.slice(0, 100)}`);
    }

    // High severity contradictions
    const highSeverity = contradictions.filter((c) => c.severity > 0.7);
    for (const c of highSeverity.slice(0, 2)) {
      findings.push(`RISK: ${c.explanation.slice(0, 100)}`);
    }

    return findings;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    hypotheses: any[],
    contradictions: any[],
    outcome?: CloseoutInput['outcome']
  ): string[] {
    const recommendations: string[] = [];

    // Based on untested hypotheses
    const untested = hypotheses.filter((h) => h.status === 'untested');
    if (untested.length > 0) {
      recommendations.push(
        `${untested.length} hypotheses remain untested. Consider additional diligence if proceeding.`
      );
    }

    // Based on contradictions
    if (contradictions.length > 5) {
      recommendations.push(
        `High number of contradictions (${contradictions.length}) found. Recommend thorough review before decision.`
      );
    }

    // Based on outcome
    if (outcome?.whatMissed && outcome.whatMissed.length > 0) {
      recommendations.push(
        `For future deals: ${outcome.whatMissed[0]}`
      );
    }

    return recommendations;
  }

  /**
   * Generate summary
   */
  private generateSummary(
    engagement: Engagement,
    stats: any,
    overallConfidence: number
  ): string {
    return `Due diligence engagement for ${engagement.target_company.name} in ${engagement.target_company.sector} sector. ` +
           `Analyzed ${stats.hypothesis_count} hypotheses with ${stats.evidence_count} pieces of evidence. ` +
           `Overall thesis confidence: ${(overallConfidence * 100).toFixed(0)}%. ` +
           `${stats.transcript_count > 0 ? `Processed ${stats.transcript_count} expert call segments. ` : ''}` +
           `${stats.document_count > 0 ? `Reviewed ${stats.document_count} data room documents.` : ''}`;
  }

  /**
   * Capture reflexion episodes
   */
  private async captureReflexions(
    input: CloseoutInput,
    stats: any
  ): Promise<ReflexionSummary[]> {
    const reflexionStore = getReflexionStore();
    const reflexions: ReflexionSummary[] = [];

    // Determine task outcomes based on stats and outcome
    const tasks = [
      {
        taskType: 'hypothesis_decomposition',
        outcomeScore: stats.hypothesis_count > 0 ? 0.8 : 0.3,
        wasSuccessful: stats.hypothesis_count > 3,
      },
      {
        taskType: 'evidence_gathering',
        outcomeScore: stats.evidence_count > 10 ? 0.8 : 0.5,
        wasSuccessful: stats.evidence_count > 10,
      },
      {
        taskType: 'contradiction_analysis',
        outcomeScore: 0.7,
        wasSuccessful: true,
      },
    ];

    for (const task of tasks) {
      const selfCritique = this.generateSelfCritique(task, input.outcome);
      const keyLearnings = input.outcome?.learnings ?? [];

      const embedding = await embed(
        `${task.taskType} ${input.engagement.target_company.sector} ${selfCritique}`
      );

      const episode = await reflexionStore.store(
        input.engagement.id,
        {
          task_type: task.taskType,
          outcome_score: task.outcomeScore,
          was_successful: task.wasSuccessful,
          self_critique: selfCritique,
          key_learnings: keyLearnings.slice(0, 5),
          methodology_used: 'standard_due_diligence',
          sector: input.engagement.target_company.sector,
          deal_type: input.engagement.deal_type,
          thesis_pattern: 'investment_thesis_validation',
          duration_hours: (Date.now() - input.engagement.created_at) / (1000 * 60 * 60),
        },
        'closeout_workflow',
        embedding
      );

      reflexions.push({
        id: episode.id,
        taskType: task.taskType,
        outcomeScore: task.outcomeScore,
        keyLearnings: episode.key_learnings,
      });
    }

    return reflexions;
  }

  /**
   * Generate self-critique for reflexion
   */
  private generateSelfCritique(
    task: { taskType: string; outcomeScore: number; wasSuccessful: boolean },
    outcome?: CloseoutInput['outcome']
  ): string {
    const critiques: string[] = [];

    if (task.outcomeScore < 0.7) {
      critiques.push(`${task.taskType} could have been more thorough.`);
    }

    if (outcome?.whatMissed && outcome.whatMissed.length > 0) {
      critiques.push(`Missed: ${outcome.whatMissed.join(', ')}`);
    }

    if (outcome?.whatWorked && outcome.whatWorked.length > 0) {
      critiques.push(`Worked well: ${outcome.whatWorked.join(', ')}`);
    }

    return critiques.join(' ') || 'Standard execution with no notable issues.';
  }

  /**
   * Store anonymized deal patterns
   */
  private async storePatterns(input: CloseoutInput): Promise<number> {
    if (!input.outcome) return 0;

    const institutionalMemory = getInstitutionalMemory();

    // Create pattern from engagement
    const pattern: Omit<DealPattern, 'id'> = {
      pattern_type: 'investment_thesis',
      sector: input.engagement.target_company.sector,
      deal_type: input.engagement.deal_type,
      thesis_pattern: input.engagement.investment_thesis?.summary.slice(0, 200) ?? '',
      outcome: input.outcome.result === 'invested' ? 'success' :
               input.outcome.result === 'passed' ? 'partial' :
               input.outcome.result === 'lost' ? 'failed' : 'unknown',
      outcome_score: input.outcome.outcomeScore ?? 0.5,
      key_factors: input.outcome.whatWorked ?? [],
      warnings: input.outcome.whatMissed ?? [],
      recommendations: [],
      frequency: 1,
      last_seen: Date.now(),
    };

    const embedding = await embed(
      `${pattern.sector} ${pattern.deal_type} ${pattern.thesis_pattern}`
    );

    await institutionalMemory.storePattern(pattern, embedding);

    return 1;
  }

  /**
   * Update skill library based on engagement
   */
  private async updateSkills(_input: CloseoutInput): Promise<number> {
    // In production, would update skill library with execution results
    // This would track which skills were used during the engagement
    const updated = 0;

    return updated;
  }

  /**
   * Emit event helper
   */
  private emitEvent(input: CloseoutInput, event: EngagementEvent): void {
    if (input.onEvent) {
      input.onEvent(event);
    }
  }
}

/**
 * Execute closeout workflow
 */
export async function executeCloseoutWorkflow(
  input: CloseoutInput
): Promise<CloseoutOutput> {
  const workflow = new CloseoutWorkflow(input.config);
  return workflow.execute(input);
}
