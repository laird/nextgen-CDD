/**
 * Workflows - End-to-end research orchestration
 *
 * Pre-built workflows for common research scenarios:
 * - Research: Complete thesis validation
 * - Stress Test: Hypothesis challenge
 * - Expert Call: Transcript processing
 * - Closeout: Engagement wrap-up
 */

// Research Workflow
export {
  ResearchWorkflow,
  executeResearchWorkflow,
  type ResearchWorkflowConfig,
  type ResearchWorkflowInput,
  type ResearchWorkflowOutput,
} from './research-workflow.js';

// Stress Test Workflow
export {
  StressTestWorkflow,
  executeStressTestWorkflow,
  type StressTestConfig,
  type StressTestInput,
  type StressTestOutput,
  type HypothesisStressTestResult,
} from './stress-test-workflow.js';

// Expert Call Workflow
export {
  ExpertCallWorkflow,
  createExpertCallWorkflow,
  processExpertCallTranscript,
  type ExpertCallConfig,
  type ExpertCallInput,
  type BatchTranscriptInput,
  type RealtimeChunkResult,
  type ExpertCallSession,
} from './expert-call-workflow.js';

// Closeout Workflow
export {
  CloseoutWorkflow,
  executeCloseoutWorkflow,
  type CloseoutConfig,
  type CloseoutInput,
  type CloseoutOutput,
  type ReflexionSummary,
} from './closeout-workflow.js';
