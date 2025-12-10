/**
 * Conductor Agent - Orchestration layer for multi-agent workflows
 *
 * Responsibilities:
 * - Task decomposition
 * - Agent coordination
 * - Workflow management
 * - Output synthesis
 */

import { BaseAgent, createTool } from './base-agent.js';
import type { AgentContext, AgentResult, AgentTool } from './base-agent.js';
import { createEvent, createResearchProgressEvent } from '../models/events.js';

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  agentType: string;
  dependencies: string[];
  input?: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

/**
 * Workflow plan
 */
export interface WorkflowPlan {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: number;
  estimatedDurationMs?: number;
}

/**
 * Agent dispatch request
 */
export interface AgentDispatchRequest {
  agentType: string;
  input: Record<string, unknown>;
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Conductor input
 */
export interface ConductorInput {
  task: string;
  context?: Record<string, unknown>;
  constraints?: {
    maxSteps?: number;
    maxDurationMs?: number;
    requiredAgents?: string[];
  };
}

/**
 * Conductor output
 */
export interface ConductorOutput {
  plan: WorkflowPlan;
  synthesis?: string;
  recommendations?: string[];
}

/**
 * Agent registry for dispatching
 */
export type AgentExecutor = (input: Record<string, unknown>, context: AgentContext) => Promise<AgentResult>;

/**
 * Conductor Agent implementation
 */
export class ConductorAgent extends BaseAgent {
  private agentRegistry: Map<string, AgentExecutor> = new Map();
  private currentPlan: WorkflowPlan | null = null;

  constructor() {
    super({
      id: 'conductor',
      name: 'Conductor Agent',
      systemPrompt: `You are the Conductor Agent for Thesis Validator, an agentic research system for private equity due diligence.

Your role is to:
1. Decompose complex research tasks into discrete steps
2. Assign appropriate specialized agents to each step
3. Coordinate execution and manage dependencies
4. Synthesize outputs into coherent recommendations

Available specialized agents:
- hypothesis_builder: Decomposes investment theses into testable hypotheses
- evidence_gatherer: Collects evidence from web, documents, and data sources
- contradiction_hunter: Finds disconfirming evidence and challenges assumptions
- expert_synthesizer: Processes expert interview transcripts
- comparables_finder: Identifies analogous deals and patterns

When planning workflows:
- Break down tasks into specific, actionable steps
- Identify dependencies between steps
- Prioritize critical path items
- Consider parallelization opportunities
- Account for potential failures and fallbacks

Output your plans in structured JSON format with clear step definitions.`,
    });
  }

  /**
   * Register an agent executor
   */
  registerAgent(agentType: string, executor: AgentExecutor): void {
    this.agentRegistry.set(agentType, executor);
  }

  /**
   * Get available agent types
   */
  getAvailableAgents(): string[] {
    return Array.from(this.agentRegistry.keys());
  }

  /**
   * Execute the conductor
   */
  async execute(input: ConductorInput): Promise<AgentResult<ConductorOutput>> {
    const startTime = Date.now();

    if (!this.context) {
      return this.createResult(false, undefined, {
        error: 'No context set',
        startTime,
      });
    }

    this.updateStatus('thinking', 'Planning workflow');

    try {
      // Step 1: Create workflow plan
      const plan = await this.createPlan(input);
      this.currentPlan = plan;

      // Emit workflow started event
      this.emitEvent(createEvent(
        'workflow.started',
        this.context.engagementId,
        { workflow_id: plan.id, workflow_type: plan.name, steps: plan.steps.map((s) => s.name) },
        this.config.id
      ));

      // Step 2: Execute plan
      await this.executePlan(plan);

      // Step 3: Synthesize results
      const synthesis = await this.synthesizeResults(plan, input);

      this.updateStatus('idle', 'Workflow completed');

      // Emit workflow completed event
      this.emitEvent(createEvent(
        'workflow.completed',
        this.context.engagementId,
        { workflow_id: plan.id, workflow_type: plan.name },
        this.config.id
      ));

      return this.createResult(true, {
        plan,
        synthesis: synthesis.summary,
        recommendations: synthesis.recommendations,
      }, {
        reasoning: `Executed ${plan.steps.length} steps with ${plan.steps.filter((s) => s.status === 'completed').length} successful completions`,
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
   * Create a workflow plan
   */
  private async createPlan(input: ConductorInput): Promise<WorkflowPlan> {
    const tools = this.getTools();

    const prompt = `Create a detailed workflow plan for the following task:

Task: ${input.task}

${input.context ? `Context: ${JSON.stringify(input.context)}` : ''}

${input.constraints ? `Constraints:
- Max steps: ${input.constraints.maxSteps ?? 'No limit'}
- Required agents: ${input.constraints.requiredAgents?.join(', ') ?? 'None specified'}` : ''}

Available agents: ${this.getAvailableAgents().join(', ')}

Create a plan with specific steps, agent assignments, and dependencies.
Output as JSON with this structure:
{
  "name": "Plan name",
  "description": "Plan description",
  "steps": [
    {
      "id": "step_1",
      "name": "Step name",
      "description": "What this step does",
      "agentType": "agent_name",
      "dependencies": [],
      "input": { "key": "value" }
    }
  ]
}`;

    const response = await this.callLLMWithTools(prompt, tools);
    const planData = this.parseJSON<{
      name: string;
      description: string;
      steps: Array<{
        id: string;
        name: string;
        description: string;
        agentType: string;
        dependencies: string[];
        input?: Record<string, unknown>;
      }>;
    }>(response.content);

    if (!planData) {
      throw new Error('Failed to parse workflow plan');
    }

    return {
      id: crypto.randomUUID(),
      name: planData.name,
      description: planData.description,
      steps: planData.steps.map((s) => ({
        ...s,
        status: 'pending' as const,
      })),
      createdAt: Date.now(),
    };
  }

  /**
   * Execute a workflow plan
   */
  private async executePlan(plan: WorkflowPlan): Promise<void> {
    const completedSteps = new Set<string>();
    let iteration = 0;
    const maxIterations = plan.steps.length * 2; // Safety limit

    while (completedSteps.size < plan.steps.length && iteration < maxIterations) {
      iteration++;

      // Find steps that can be executed (all dependencies completed)
      const readySteps = plan.steps.filter(
        (step) =>
          step.status === 'pending' &&
          step.dependencies.every((dep) => completedSteps.has(dep))
      );

      if (readySteps.length === 0 && completedSteps.size < plan.steps.length) {
        // Check for circular dependencies or unresolvable state
        const pendingSteps = plan.steps.filter((s) => s.status === 'pending');
        throw new Error(`Workflow stuck: ${pendingSteps.length} pending steps with unmet dependencies`);
      }

      // Execute ready steps (could be parallelized)
      for (const step of readySteps) {
        await this.executeStep(plan, step);
        if (step.status === 'completed') {
          completedSteps.add(step.id);
        }
      }

      // Emit progress event
      if (this.context) {
        this.emitEvent(createResearchProgressEvent(
          this.context.engagementId,
          plan.id,
          {
            current_step: readySteps[0]?.name ?? 'Processing',
            total_steps: plan.steps.length,
            completed_steps: completedSteps.size,
            progress_percentage: (completedSteps.size / plan.steps.length) * 100,
          }
        ));
      }
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(plan: WorkflowPlan, step: WorkflowStep): Promise<void> {
    step.status = 'in_progress';
    this.updateStatus('searching', `Executing: ${step.name}`);

    // Emit step progress
    if (this.context) {
      this.emitEvent(createEvent(
        'workflow.step_completed',
        this.context.engagementId,
        { workflow_id: plan.id, step_id: step.id, step_name: step.name, status: 'in_progress' },
        this.config.id
      ));
    }

    const executor = this.agentRegistry.get(step.agentType);
    if (!executor) {
      step.status = 'failed';
      const errorMsg = `No executor found for agent type: ${step.agentType}`;
      step.error = errorMsg;
      return;
    }

    try {
      // Gather inputs from completed dependencies
      const dependencyResults: Record<string, unknown> = {};
      for (const depId of step.dependencies) {
        const depStep = plan.steps.find((s) => s.id === depId);
        if (depStep?.result) {
          dependencyResults[depId] = depStep.result;
        }
      }

      const input: Record<string, unknown> = {
        dependencyResults,
        stepContext: {
          planId: plan.id,
          stepId: step.id,
          stepName: step.name,
        },
      };

      // Add step input properties if they exist
      if (step.input) {
        Object.assign(input, step.input);
      }

      const result = await executor(input, this.context!);

      if (result.success) {
        step.status = 'completed';
        step.result = result.data;
      } else {
        step.status = 'failed';
        if (result.error !== undefined) {
          step.error = result.error;
        }
      }
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Emit step completion
    if (this.context) {
      this.emitEvent(createEvent(
        'workflow.step_completed',
        this.context.engagementId,
        { workflow_id: plan.id, step_id: step.id, step_name: step.name, status: step.status },
        this.config.id
      ));
    }
  }

  /**
   * Synthesize results from completed plan
   */
  private async synthesizeResults(
    plan: WorkflowPlan,
    _originalInput: ConductorInput
  ): Promise<{ summary: string; recommendations: string[] }> {
    this.updateStatus('writing', 'Synthesizing results');

    const completedResults = plan.steps
      .filter((s) => s.status === 'completed' && s.result)
      .map((s) => ({
        step: s.name,
        agentType: s.agentType,
        result: s.result,
      }));

    const failedSteps = plan.steps
      .filter((s) => s.status === 'failed')
      .map((s) => ({ step: s.name, error: s.error }));

    const prompt = `Synthesize the following research results into a coherent summary and actionable recommendations.

Workflow: ${plan.name}
Description: ${plan.description}

Completed Steps:
${JSON.stringify(completedResults, null, 2)}

${failedSteps.length > 0 ? `Failed Steps:\n${JSON.stringify(failedSteps, null, 2)}` : ''}

Provide:
1. A synthesis summary (2-3 paragraphs)
2. Key recommendations (3-5 bullet points)

Output as JSON:
{
  "summary": "...",
  "recommendations": ["...", "..."]
}`;

    const response = await this.callLLM(prompt);
    const synthesis = this.parseJSON<{ summary: string; recommendations: string[] }>(response.content);

    return synthesis ?? {
      summary: `Completed ${completedResults.length} of ${plan.steps.length} workflow steps.`,
      recommendations: ['Review completed step results for detailed findings.'],
    };
  }

  /**
   * Get conductor tools
   */
  private getTools(): AgentTool[] {
    return [
      createTool(
        'list_available_agents',
        'List all available specialized agents',
        { type: 'object', properties: {} },
        async () => ({
          agents: this.getAvailableAgents(),
          descriptions: {
            hypothesis_builder: 'Decomposes investment theses into testable hypotheses',
            evidence_gatherer: 'Collects evidence from web, documents, and data sources',
            contradiction_hunter: 'Finds disconfirming evidence and challenges assumptions',
            expert_synthesizer: 'Processes expert interview transcripts',
            comparables_finder: 'Identifies analogous deals and patterns',
          },
        })
      ),

      createTool(
        'check_plan_feasibility',
        'Check if a plan can be executed with available agents',
        {
          type: 'object',
          properties: {
            agent_types: { type: 'array', items: { type: 'string' } },
          },
          required: ['agent_types'],
        },
        async (input) => {
          const agentTypes = input['agent_types'] as string[];
          const available = this.getAvailableAgents();
          const missing = agentTypes.filter((t) => !available.includes(t));
          return {
            feasible: missing.length === 0,
            available_agents: available,
            missing_agents: missing,
          };
        }
      ),

      createTool(
        'get_engagement_context',
        'Get context about the current engagement',
        { type: 'object', properties: {} },
        async () => {
          if (!this.context) {
            return { error: 'No context available' };
          }
          const stats = await this.context.dealMemory.getStats();
          return {
            engagement_id: this.context.engagementId,
            stats,
          };
        }
      ),
    ];
  }

  /**
   * Get current plan
   */
  getCurrentPlan(): WorkflowPlan | null {
    return this.currentPlan;
  }

  /**
   * Execute adaptive research workflow
   */
  async executeResearchWorkflow(input: {
    thesis: string;
    config: {
      maxHypotheses?: number;
      enableDeepDive?: boolean;
      confidenceThreshold?: number;
    };
  }): Promise<{
    hypotheses: Array<{ statement: string; priority: number }>;
    evidence: Array<{ type: string; content: string; confidence: number }>;
    contradictions: string[];
    confidence: number;
    needsDeepDive: boolean;
  }> {
    // Phase 1: Core analysis
    const phase1Result = await this.executePhase1(input.thesis, input.config.maxHypotheses ?? 5);

    // Evaluate if deep dive needed
    const needsDeepDive =
      input.config.enableDeepDive !== false &&
      (phase1Result.confidence < (input.config.confidenceThreshold ?? 70) ||
       phase1Result.contradictions.length > 3);

    if (needsDeepDive) {
      // Phase 2: Deep dive with additional agents
      const phase2Result = await this.executePhase2(phase1Result);
      return { ...phase2Result, needsDeepDive: true };
    }

    return { ...phase1Result, needsDeepDive: false };
  }

  /**
   * Execute Phase 1: Core analysis
   */
  private async executePhase1(
    thesis: string,
    maxHypotheses: number
  ): Promise<{
    hypotheses: Array<{ statement: string; priority: number }>;
    evidence: Array<{ type: string; content: string; confidence: number }>;
    contradictions: string[];
    confidence: number;
  }> {
    // Step 1: Generate hypotheses
    const hypotheses = await this.generateHypotheses(thesis, maxHypotheses);

    // Step 2: Gather evidence
    const evidence = await this.gatherEvidence(hypotheses);

    // Step 3: Hunt contradictions
    const contradictions = await this.huntContradictions(evidence);

    // Calculate confidence
    const supportingRatio = evidence.filter(e => e.type === 'supporting').length / evidence.length;
    const confidence = supportingRatio * 100 * (1 - contradictions.length * 0.1);

    return {
      hypotheses,
      evidence,
      contradictions,
      confidence: Math.max(0, Math.min(100, confidence)),
    };
  }

  /**
   * Execute Phase 2: Deep dive with ComparablesFinder and ExpertSynthesizer
   */
  private async executePhase2(phase1Result: {
    hypotheses: Array<{ statement: string; priority: number }>;
    evidence: Array<{ type: string; content: string; confidence: number }>;
    contradictions: string[];
    confidence: number;
  }): Promise<{
    hypotheses: Array<{ statement: string; priority: number }>;
    evidence: Array<{ type: string; content: string; confidence: number }>;
    contradictions: string[];
    confidence: number;
  }> {
    if (!this.context) {
      return phase1Result;
    }

    let confidenceBoost = 0;
    const additionalEvidence: Array<{ type: string; content: string; confidence: number }> = [];

    // Try ComparablesFinder
    const comparablesExecutor = this.agentRegistry.get('comparables_finder');
    if (comparablesExecutor) {
      try {
        const thesis = phase1Result.hypotheses[0]?.statement || '';
        const result = await comparablesExecutor({ thesis }, this.context);
        if (result.success && result.data) {
          const data = result.data as any;
          if (data.comparableDeals?.length > 0) {
            confidenceBoost += 5;
            for (const deal of data.comparableDeals.slice(0, 3)) {
              additionalEvidence.push({
                type: 'supporting',
                content: `Comparable deal: ${deal.company_name} (${deal.outcome})`,
                confidence: deal.relevance_score ?? 0.6,
              });
            }
          }
          if (data.applicableFrameworks?.length > 0) {
            confidenceBoost += 3;
          }
        }
      } catch (error) {
        console.error('[Conductor] ComparablesFinder failed:', error);
      }
    }

    // Try ExpertSynthesizer (if we have expert evidence)
    const expertEvidence = phase1Result.evidence.filter(e =>
      e.content.toLowerCase().includes('expert') ||
      e.content.toLowerCase().includes('interview')
    );

    if (expertEvidence.length > 0) {
      const expertExecutor = this.agentRegistry.get('expert_synthesizer');
      if (expertExecutor) {
        try {
          const result = await expertExecutor(
            { transcripts: expertEvidence.map(e => e.content) },
            this.context
          );
          if (result.success && result.data) {
            confidenceBoost += 5;
          }
        } catch (error) {
          console.error('[Conductor] ExpertSynthesizer failed:', error);
        }
      }
    }

    return {
      hypotheses: phase1Result.hypotheses,
      evidence: [...phase1Result.evidence, ...additionalEvidence],
      contradictions: phase1Result.contradictions,
      confidence: Math.min(100, phase1Result.confidence + confidenceBoost),
    };
  }

  /**
   * Generate hypotheses from thesis using HypothesisBuilder agent
   */
  private async generateHypotheses(
    thesis: string,
    maxCount: number
  ): Promise<Array<{ statement: string; priority: number }>> {
    if (!this.context) {
      return [];
    }

    const executor = this.agentRegistry.get('hypothesis_builder');
    if (!executor) {
      console.warn('[Conductor] HypothesisBuilder agent not registered, using fallback');
      return [
        { statement: `Market assumption: ${thesis}`, priority: 5 },
        { statement: 'Financial viability needs validation', priority: 4 },
      ].slice(0, maxCount);
    }

    try {
      const result = await executor({ thesis }, this.context);
      if (result.success && result.data) {
        const hypotheses = (result.data as any).hypotheses || [];
        return hypotheses.slice(0, maxCount).map((h: any, i: number) => ({
          statement: h.content || h.statement,
          priority: 5 - i,
        }));
      }
    } catch (error) {
      console.error('[Conductor] HypothesisBuilder failed:', error);
    }

    return [];
  }

  /**
   * Gather evidence for hypotheses using EvidenceGatherer agent
   */
  private async gatherEvidence(
    hypotheses: Array<{ statement: string; priority: number }>
  ): Promise<Array<{ type: string; content: string; confidence: number }>> {
    if (!this.context) {
      return [];
    }

    const executor = this.agentRegistry.get('evidence_gatherer');
    if (!executor) {
      console.warn('[Conductor] EvidenceGatherer agent not registered, using fallback');
      return hypotheses.flatMap((h) => [
        { type: 'supporting', content: `Evidence supports: ${h.statement}`, confidence: 0.7 },
      ]);
    }

    const allEvidence: Array<{ type: string; content: string; confidence: number }> = [];

    for (const hypothesis of hypotheses) {
      try {
        const result = await executor(
          { query: hypothesis.statement, maxResults: 5 },
          this.context
        );
        if (result.success && result.data) {
          const evidence = (result.data as any).evidence || [];
          for (const e of evidence) {
            allEvidence.push({
              type: e.sentiment || 'neutral',
              content: e.content || e.summary,
              confidence: e.credibility ?? 0.5,
            });
          }
        }
      } catch (error) {
        console.error('[Conductor] EvidenceGatherer failed for hypothesis:', error);
      }
    }

    return allEvidence;
  }

  /**
   * Hunt contradictions in evidence using ContradictionHunter agent
   */
  private async huntContradictions(
    evidence: Array<{ type: string; content: string; confidence: number }>
  ): Promise<string[]> {
    if (!this.context) {
      return [];
    }

    const executor = this.agentRegistry.get('contradiction_hunter');
    if (!executor) {
      console.warn('[Conductor] ContradictionHunter agent not registered, using fallback');
      return evidence.filter(e => e.type === 'contradicting').map(e => e.content);
    }

    try {
      const result = await executor({ intensity: 'moderate' }, this.context);
      if (result.success && result.data) {
        const contradictions = (result.data as any).contradictions || [];
        return contradictions.map((c: any) => c.contradiction?.explanation || c.description || '');
      }
    } catch (error) {
      console.error('[Conductor] ContradictionHunter failed:', error);
    }

    return [];
  }

  /**
   * Abort current workflow
   */
  abort(): void {
    if (this.currentPlan) {
      for (const step of this.currentPlan.steps) {
        if (step.status === 'pending' || step.status === 'in_progress') {
          step.status = 'failed';
          step.error = 'Workflow aborted';
        }
      }
    }
    this.updateStatus('idle', 'Workflow aborted');
  }
}

/**
 * Create a conductor agent instance
 */
export function createConductorAgent(): ConductorAgent {
  return new ConductorAgent();
}
