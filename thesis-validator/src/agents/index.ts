/**
 * Agents - Specialized AI agents for Thesis Validator
 *
 * Multi-agent architecture for research and analysis:
 * - Conductor: Orchestration and workflow management
 * - Hypothesis Builder: Thesis decomposition
 * - Evidence Gatherer: Research collection
 * - Contradiction Hunter: Adversarial analysis
 * - Expert Synthesizer: Transcript processing
 * - Comparables Finder: Pattern matching
 */

// Direct imports for createAgentSwarm to avoid circular dependency issues
import { createConductorAgent as _createConductorAgent, ConductorAgent } from './conductor.js';
import { createHypothesisBuilderAgent as _createHypothesisBuilderAgent, HypothesisBuilderAgent, type HypothesisBuilderInput } from './hypothesis-builder.js';
import { createEvidenceGathererAgent as _createEvidenceGathererAgent, EvidenceGathererAgent, type EvidenceGathererInput } from './evidence-gatherer.js';
import { createContradictionHunterAgent as _createContradictionHunterAgent, ContradictionHunterAgent, type ContradictionHunterInput } from './contradiction-hunter.js';
import { createExpertSynthesizerAgent as _createExpertSynthesizerAgent, ExpertSynthesizerAgent, type ExpertSynthesizerInput } from './expert-synthesizer.js';
import { createComparablesFinderAgent as _createComparablesFinderAgent, ComparablesFinderAgent, type ComparablesFinderInput } from './comparables-finder.js';

// Base agent
export {
  BaseAgent,
  createTool,
  standardSchemas,
  type AgentConfig,
  type AgentTool,
  type AgentContext,
  type AgentResult,
  type AgentMessage,
  type LLMError,
} from './base-agent.js';

// Conductor
export {
  ConductorAgent,
  createConductorAgent,
  type WorkflowStep,
  type WorkflowPlan,
  type AgentDispatchRequest,
  type ConductorInput,
  type ConductorOutput,
  type AgentExecutor,
} from './conductor.js';

// Hypothesis Builder
export {
  HypothesisBuilderAgent,
  createHypothesisBuilderAgent,
  type HypothesisBuilderInput,
  type HypothesisBuilderOutput,
} from './hypothesis-builder.js';

// Evidence Gatherer
export {
  EvidenceGathererAgent,
  createEvidenceGathererAgent,
  type EvidenceGathererInput,
  type EvidenceGathererOutput,
} from './evidence-gatherer.js';

// Contradiction Hunter
export {
  ContradictionHunterAgent,
  createContradictionHunterAgent,
  type ContradictionHunterInput,
  type ContradictionHunterOutput,
} from './contradiction-hunter.js';

// Expert Synthesizer
export {
  ExpertSynthesizerAgent,
  createExpertSynthesizerAgent,
  type ExpertSynthesizerInput,
  type ExpertSynthesizerOutput,
} from './expert-synthesizer.js';

// Comparables Finder
export {
  ComparablesFinderAgent,
  createComparablesFinderAgent,
  type ComparablesFinderInput,
  type ComparablesFinderOutput,
  type ComparableDeal,
  type ApplicableFramework,
} from './comparables-finder.js';

/**
 * Create all agents and register with conductor
 */
export function createAgentSwarm(): {
  conductor: ConductorAgent;
  hypothesisBuilder: HypothesisBuilderAgent;
  evidenceGatherer: EvidenceGathererAgent;
  contradictionHunter: ContradictionHunterAgent;
  expertSynthesizer: ExpertSynthesizerAgent;
  comparablesFinder: ComparablesFinderAgent;
} {
  // Use the directly imported factory functions to avoid circular dependency issues
  const conductor = _createConductorAgent();
  const hypothesisBuilder = _createHypothesisBuilderAgent();
  const evidenceGatherer = _createEvidenceGathererAgent();
  const contradictionHunter = _createContradictionHunterAgent();
  const expertSynthesizer = _createExpertSynthesizerAgent();
  const comparablesFinder = _createComparablesFinderAgent();

  // Register agents with conductor
  conductor.registerAgent('hypothesis_builder', async (input, context) => {
    hypothesisBuilder.setContext(context);
    return hypothesisBuilder.execute(input as unknown as HypothesisBuilderInput);
  });

  conductor.registerAgent('evidence_gatherer', async (input, context) => {
    evidenceGatherer.setContext(context);
    return evidenceGatherer.execute(input as unknown as EvidenceGathererInput);
  });

  conductor.registerAgent('contradiction_hunter', async (input, context) => {
    contradictionHunter.setContext(context);
    return contradictionHunter.execute(input as unknown as ContradictionHunterInput);
  });

  conductor.registerAgent('expert_synthesizer', async (input, context) => {
    expertSynthesizer.setContext(context);
    return expertSynthesizer.execute(input as unknown as ExpertSynthesizerInput);
  });

  conductor.registerAgent('comparables_finder', async (input, context) => {
    comparablesFinder.setContext(context);
    return comparablesFinder.execute(input as unknown as ComparablesFinderInput);
  });

  return {
    conductor,
    hypothesisBuilder,
    evidenceGatherer,
    contradictionHunter,
    expertSynthesizer,
    comparablesFinder,
  };
}
