/**
 * Research Routes
 *
 * REST API endpoints for research workflows, hypothesis management, and reports
 */

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  authHook,
  requireEngagementAccess,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { getEngagement, updateEngagement } from './engagements.js';
import {
  executeResearchWorkflow,
  executeStressTestWorkflow,
} from '../../workflows/index.js';
import { createDealMemory } from '../../memory/index.js';
import type { HypothesisTree, HypothesisNode, EngagementEvent, ProgressEvent } from '../../models/index.js';
import { publishProgressEvent } from '../websocket/research-progress.js';

/**
 * Research job status tracking
 */
interface ResearchJob {
  id: string;
  engagementId: string;
  type: 'research' | 'stress_test';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  result?: unknown;
}

const jobStore = new Map<string, ResearchJob>();

/**
 * Register research routes
 */
export async function registerResearchRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authHook);

  /**
   * Trigger research workflow
   * POST /engagements/:engagementId/research
   */
  fastify.post(
    '/:engagementId/research',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          thesis: z.string().optional(),
          depth: z.enum(['quick', 'standard', 'deep']).default('standard'),
          focus_areas: z.array(z.string()).optional(),
          include_comparables: z.boolean().default(true),
          max_sources: z.number().min(1).max(100).default(20),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: {
          thesis?: string;
          depth: 'quick' | 'standard' | 'deep';
          focus_areas?: string[];
          include_comparables: boolean;
          max_sources: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;
      const { thesis: requestThesis, ...config } = request.body;

      const engagement = await getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Use thesis from request body if provided, otherwise use stored thesis
      const thesisSummary = requestThesis?.trim() || engagement.investment_thesis?.summary;
      if (!thesisSummary) {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'Investment thesis must be submitted before starting research',
        });
        return;
      }

      // Update engagement with thesis if provided in request
      if (requestThesis?.trim() && !engagement.investment_thesis?.summary) {
        engagement.investment_thesis = {
          summary: requestThesis.trim(),
          key_value_drivers: [],
          key_risks: [],
        };
        void updateEngagement(engagementId, { investment_thesis: engagement.investment_thesis });
      }

      // Create job
      const jobId = crypto.randomUUID();
      const job: ResearchJob = {
        id: jobId,
        engagementId,
        type: 'research',
        status: 'pending',
        progress: 0,
        startedAt: Date.now(),
      };
      jobStore.set(jobId, job);

      // Update engagement status (use 'active' as the closest valid status)
      void updateEngagement(engagementId, { status: 'active' });

      // Start research workflow asynchronously
      executeResearchWorkflowAsync(job, engagement, config, user.id);

      reply.status(202).send({
        job_id: jobId,
        message: 'Research workflow started',
        status_url: `/research/jobs/${jobId}`,
      });
    }
  );

  /**
   * Get hypothesis tree
   * GET /engagements/:engagementId/hypothesis-tree
   */
  fastify.get(
    '/:engagementId/hypothesis-tree',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{ Params: { engagementId: string } }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;

      const engagement = await getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = await createDealMemory(engagementId);
      const hypotheses = await dealMemory.getAllHypotheses();

      // Build tree structure
      const tree = buildHypothesisTree(engagementId, hypotheses);

      reply.send({
        engagement_id: engagementId,
        thesis: engagement.investment_thesis?.summary,
        tree,
        node_count: hypotheses.length,
      });
    }
  );

  // NOTE: Hypothesis CRUD routes moved to hypotheses.ts (Slice 1)
  // The route GET /engagements/:engagementId/hypotheses/:hypothesisId
  // is now handled by the dedicated hypotheses routes module

  /**
   * Execute stress test workflow
   * POST /engagements/:engagementId/stress-test
   */
  fastify.post(
    '/:engagementId/stress-test',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          hypothesis_ids: z.array(z.string().uuid()).optional(),
          intensity: z.enum(['light', 'moderate', 'aggressive']).default('moderate'),
          devil_advocate_mode: z.boolean().default(true),
          search_contrarian_sources: z.boolean().default(true),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: {
          hypothesis_ids?: string[];
          intensity: 'light' | 'moderate' | 'aggressive';
          devil_advocate_mode: boolean;
          search_contrarian_sources: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;
      const config = request.body;

      const engagement = await getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Create job
      const jobId = crypto.randomUUID();
      const job: ResearchJob = {
        id: jobId,
        engagementId,
        type: 'stress_test',
        status: 'pending',
        progress: 0,
        startedAt: Date.now(),
      };
      jobStore.set(jobId, job);

      // Start stress test workflow asynchronously
      executeStressTestAsync(job, engagement, config, user.id);

      reply.status(202).send({
        job_id: jobId,
        message: 'Stress test workflow started',
        status_url: `/research/jobs/${jobId}`,
      });
    }
  );

  /**
   * Get research job status
   * GET /research/jobs/:jobId
   */
  fastify.get(
    '/jobs/:jobId',
    async (
      request: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply
    ) => {
      const { jobId } = request.params;
      const job = jobStore.get(jobId);

      if (!job) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Job not found',
        });
        return;
      }

      reply.send({
        job_id: job.id,
        engagement_id: job.engagementId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        started_at: job.startedAt,
        completed_at: job.completedAt,
        error: job.error,
        result: job.status === 'completed' ? job.result : undefined,
      });
    }
  );

  /**
   * Generate research report
   * GET /engagements/:engagementId/report
   */
  fastify.get(
    '/:engagementId/report',
    {
      preHandler: requireEngagementAccess('viewer'),
      schema: {
        querystring: z.object({
          format: z.enum(['json', 'markdown', 'html']).default('json'),
          include_evidence: z.coerce.boolean().default(true),
          include_contradictions: z.coerce.boolean().default(true),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Querystring: {
          format: 'json' | 'markdown' | 'html';
          include_evidence: boolean;
          include_contradictions: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { format } = request.query;

      const engagement = await getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = await createDealMemory(engagementId);

      // Gather all data
      const hypotheses = await dealMemory.getAllHypotheses();
      const stats = await dealMemory.getStats();

      // Count contradictions from hypotheses (approximation - contradictions affect evidence count)
      // Note: DealMemory doesn't track contradiction_count separately, use 0 as placeholder
      const contradictionCount = 0;

      // Generate report based on format
      const report = generateReport(
        engagement,
        hypotheses,
        stats.evidence_count,
        contradictionCount,
        format
      );

      if (format === 'markdown') {
        reply.header('Content-Type', 'text/markdown');
      } else if (format === 'html') {
        reply.header('Content-Type', 'text/html');
      }

      reply.send(report);
    }
  );
}

/**
 * Map workflow phase names to TUI-expected phase names
 *
 * TUI expects: hypothesis_generation, evidence_gathering, contradiction_detection, report_generation
 * Workflow emits: thesis_structuring, comparables_search, evidence_gathering, contradiction_analysis, synthesis
 */
function mapPhaseToTuiPhase(workflowPhase: string): string {
  const phaseMap: Record<string, string> = {
    'initializing': 'hypothesis_generation',
    'thesis_structuring': 'hypothesis_generation',
    'comparables_search': 'hypothesis_generation',
    'evidence_gathering': 'evidence_gathering',
    'contradiction_analysis': 'contradiction_detection',
    'synthesis': 'report_generation',
  };
  return phaseMap[workflowPhase] ?? workflowPhase;
}

/**
 * Get a human-readable message for a phase
 */
function getPhaseMessage(phase: string): string {
  const messages: Record<string, string> = {
    'hypothesis_generation': 'Building and structuring hypotheses...',
    'evidence_gathering': 'Gathering evidence from multiple sources...',
    'contradiction_detection': 'Analyzing for contradictions and risks...',
    'report_generation': 'Synthesizing findings and generating report...',
  };
  return messages[phase] ?? `Processing ${phase}...`;
}

/**
 * Convert EngagementEvent to ProgressEvent for WebSocket streaming
 *
 * Valid ProgressEventType values:
 * 'status_update' | 'phase_start' | 'phase_complete' | 'hypothesis_generated' |
 * 'evidence_found' | 'contradiction_detected' | 'round_complete' | 'job_complete' |
 * 'completed' | 'error'
 */
function convertToProgressEvent(jobId: string, event: EngagementEvent): ProgressEvent {
  const eventData = event.data as Record<string, unknown>;

  // Map engagement event types to valid progress event types
  let progressType: ProgressEvent['type'];
  let outputData = { ...eventData };

  switch (event.type) {
    case 'workflow.started':
    case 'research.started':
      progressType = 'phase_start';
      break;
    case 'workflow.completed':
    case 'research.completed':
      progressType = 'completed';
      break;
    case 'workflow.failed':
    case 'research.failed':
      progressType = 'error';
      break;
    case 'research.progress': {
      // research.progress events with a phase should be treated as phase_start
      const workflowPhase = eventData['phase'];
      if (typeof workflowPhase === 'string') {
        progressType = 'phase_start';
        const tuiPhase = mapPhaseToTuiPhase(workflowPhase);
        outputData = {
          ...eventData,
          phase: tuiPhase,
          message: getPhaseMessage(tuiPhase),
        };
      } else {
        progressType = 'status_update';
      }
      break;
    }
    case 'workflow.step_completed':
      progressType = 'phase_complete';
      break;
    case 'agent.status':
    case 'agent.started':
    case 'agent.completed':
      progressType = 'status_update';
      break;
    case 'evidence.new':
      progressType = 'evidence_found';
      break;
    case 'hypothesis.created':
    case 'hypothesis.updated':
      progressType = 'hypothesis_generated';
      break;
    case 'contradiction.found':
      progressType = 'contradiction_detected';
      break;
    default:
      progressType = 'status_update';
  }

  return {
    type: progressType,
    jobId,
    timestamp: event.timestamp,
    data: outputData,
  };
}

/**
 * Create a throttled event handler that limits how often status_update events are sent
 * Important events (phase_start, completed, error, etc.) are always sent immediately
 */
function createThrottledEventHandler(
  jobId: string,
  job: ResearchJob,
  throttleMs: number = 500
): (event: EngagementEvent) => void {
  let lastStatusUpdateTime = 0;
  let pendingStatusUpdate: EngagementEvent | null = null;
  let pendingTimeout: NodeJS.Timeout | null = null;

  // Event types that should always be sent immediately (not throttled)
  const importantEventTypes = new Set([
    'workflow.started',
    'workflow.completed',
    'workflow.failed',
    'research.started',
    'research.completed',
    'research.failed',
    'research.progress', // Phase changes
    'hypothesis.created',
    'evidence.new',
    'contradiction.found',
  ]);

  const flushPendingUpdate = (): void => {
    if (pendingStatusUpdate) {
      const progressEvent = convertToProgressEvent(jobId, pendingStatusUpdate);
      publishProgressEvent(jobId, progressEvent).catch((err) => {
        console.error('[Research] Failed to publish progress event:', err);
      });
      pendingStatusUpdate = null;
    }
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
  };

  return (event: EngagementEvent): void => {
    // Update job progress based on event data
    const eventData = event.data as Record<string, unknown>;
    if (typeof eventData['progress'] === 'number') {
      job.progress = Math.round(eventData['progress'] * 100);
    }

    const progressEvent = convertToProgressEvent(jobId, event);

    // Important events are sent immediately
    if (importantEventTypes.has(event.type)) {
      // Flush any pending status update first
      flushPendingUpdate();
      publishProgressEvent(jobId, progressEvent).catch((err) => {
        console.error('[Research] Failed to publish progress event:', err);
      });
      lastStatusUpdateTime = Date.now();
      return;
    }

    // For status_update events, apply throttling
    if (progressEvent.type === 'status_update') {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastStatusUpdateTime;

      if (timeSinceLastUpdate >= throttleMs) {
        // Enough time has passed, send immediately
        publishProgressEvent(jobId, progressEvent).catch((err) => {
          console.error('[Research] Failed to publish progress event:', err);
        });
        lastStatusUpdateTime = now;
        pendingStatusUpdate = null;
      } else {
        // Store as pending and schedule a delayed send
        pendingStatusUpdate = event;
        if (!pendingTimeout) {
          pendingTimeout = setTimeout(() => {
            flushPendingUpdate();
            lastStatusUpdateTime = Date.now();
          }, throttleMs - timeSinceLastUpdate);
        }
      }
      return;
    }

    // Other events pass through
    publishProgressEvent(jobId, progressEvent).catch((err) => {
      console.error('[Research] Failed to publish progress event:', err);
    });
  };
}

/**
 * Execute research workflow asynchronously
 */
async function executeResearchWorkflowAsync(
  job: ResearchJob,
  engagement: NonNullable<Awaited<ReturnType<typeof getEngagement>>>,
  config: {
    depth: 'quick' | 'standard' | 'deep';
    focus_areas?: string[];
    include_comparables: boolean;
    max_sources: number;
  },
  _userId: string
): Promise<void> {
  job.status = 'running';

  // Create throttled onEvent callback (500ms throttle for status updates)
  const onEvent = createThrottledEventHandler(job.id, job, 500);

  // Emit initial started event
  onEvent({
    id: crypto.randomUUID(),
    type: 'workflow.started',
    timestamp: Date.now(),
    engagement_id: engagement.id,
    data: { workflow_type: 'research', phase: 'initializing', progress: 0 },
  });

  try {
    // Build the thesis object from engagement data
    const thesis = {
      summary: engagement.investment_thesis?.summary ?? '',
      key_value_drivers: [],
      key_risks: [],
    };

    const result = await executeResearchWorkflow({
      engagement: engagement as import('../../models/index.js').Engagement,
      thesis,
      config: {
        enableComparablesSearch: config.include_comparables,
        enableContradictionAnalysis: true,
        contradictionIntensity: config.depth === 'deep' ? 'aggressive' : config.depth === 'quick' ? 'light' : 'moderate',
        maxEvidencePerHypothesis: config.max_sources,
        parallelAgents: true,
      },
      onEvent,
    });

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    job.result = result;

    // Note: workflow.completed event is emitted by research-workflow.ts
    // We emit a final job_complete event with the result summary
    onEvent({
      id: crypto.randomUUID(),
      type: 'research.completed',
      timestamp: Date.now(),
      engagement_id: engagement.id,
      data: {
        workflow_type: 'research',
        progress: 1,
        evidence_count: result?.evidence?.totalCount ?? 0,
        hypothesis_count: result?.hypothesisTree?.totalHypotheses ?? 0,
        contradiction_count: result?.contradictions?.totalCount ?? 0,
      },
    });

    // Update engagement status (use 'completed' as the closest valid status)
    void updateEngagement(engagement.id, { status: 'completed' });
  } catch (error) {
    job.status = 'failed';
    job.completedAt = Date.now();
    job.error = error instanceof Error ? error.message : 'Unknown error';

    // Log the full error for debugging
    console.error('[Research] Workflow failed:', error);
    if (error instanceof Error && error.stack) {
      console.error('[Research] Stack trace:', error.stack);
    }

    // Emit failure event
    onEvent({
      id: crypto.randomUUID(),
      type: 'workflow.failed',
      timestamp: Date.now(),
      engagement_id: engagement.id,
      data: { workflow_type: 'research', error: job.error },
    });

    // Note: No 'failed' status in EngagementStatus - leave status unchanged for failure
    // The job.status tracks the failure state
  }
}

/**
 * Execute stress test workflow asynchronously
 */
async function executeStressTestAsync(
  job: ResearchJob,
  engagement: NonNullable<Awaited<ReturnType<typeof getEngagement>>>,
  config: {
    hypothesis_ids?: string[];
    intensity: 'light' | 'moderate' | 'aggressive';
    devil_advocate_mode: boolean;
    search_contrarian_sources: boolean;
  },
  _userId: string
): Promise<void> {
  job.status = 'running';

  try {
    const stressTestInput: Parameters<typeof executeStressTestWorkflow>[0] = {
      engagementId: engagement.id,
      config: {
        intensity: config.intensity,
      },
    };
    // Only include hypothesisIds if defined (to satisfy exactOptionalPropertyTypes)
    if (config.hypothesis_ids) {
      stressTestInput.hypothesisIds = config.hypothesis_ids;
    }
    const result = await executeStressTestWorkflow(stressTestInput);

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    job.result = result;
  } catch (error) {
    job.status = 'failed';
    job.completedAt = Date.now();
    job.error = error instanceof Error ? error.message : 'Unknown error';
  }
}

/**
 * Build hypothesis tree from flat list
 */
function buildHypothesisTree(
  engagementId: string,
  hypotheses: HypothesisNode[]
): HypothesisTree {
  // Find the root thesis node (first 'thesis' type node)
  const rootNode = hypotheses.find((h) => h.type === 'thesis');
  const rootThesisId = rootNode?.id ?? crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    engagement_id: engagementId,
    root_thesis_id: rootThesisId,
    nodes: hypotheses,
    edges: [], // Would be populated from causal graph
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

/**
 * Generate report in specified format
 */
function generateReport(
  engagement: NonNullable<Awaited<ReturnType<typeof getEngagement>>>,
  hypotheses: HypothesisNode[],
  evidenceCount: number,
  contradictionCount: number,
  format: 'json' | 'markdown' | 'html'
): string | object {
  // Build engagement object for report (handle optional thesis)
  const engagementData: ReportData['engagement'] = {
    id: engagement.id,
    name: engagement.name,
    target: {
      name: engagement.target_company.name,
      sector: engagement.target_company.sector,
    },
    status: engagement.status,
  };
  if (engagement.investment_thesis) {
    engagementData.thesis = { summary: engagement.investment_thesis.summary };
  }

  const reportData: ReportData = {
    engagement: engagementData,
    summary: {
      hypothesis_count: hypotheses.length,
      evidence_count: evidenceCount,
      contradiction_count: contradictionCount,
      overall_confidence: calculateOverallConfidence(hypotheses),
    },
    hypotheses: hypotheses.map((h) => ({
      id: h.id,
      content: h.content,
      type: h.type,
      status: h.status,
      confidence: h.confidence,
    })),
    generated_at: Date.now(),
  };

  if (format === 'json') {
    return reportData;
  }

  if (format === 'markdown') {
    return generateMarkdownReport(reportData);
  }

  return generateHtmlReport(reportData);
}

/**
 * Calculate overall confidence from hypotheses
 */
function calculateOverallConfidence(hypotheses: HypothesisNode[]): number {
  if (hypotheses.length === 0) return 0;

  const confidences = hypotheses.map((h) => h.confidence);
  return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}

/**
 * Report data type for markdown and HTML generation
 */
interface ReportData {
  engagement: {
    id: string;
    name: string;
    target: { name: string; sector: string };
    thesis?: { summary: string };
    status: string;
  };
  summary: {
    hypothesis_count: number;
    evidence_count: number;
    contradiction_count: number;
    overall_confidence: number;
  };
  hypotheses: {
    id: string;
    content: string;
    type: string;
    status: string;
    confidence: number;
  }[];
  generated_at: number;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(data: ReportData): string {
  return `# Research Report: ${data.engagement.name}

## Executive Summary

**Target Company:** ${data.engagement.target.name}
**Investment Thesis:** ${data.engagement.thesis?.summary ?? 'Not specified'}

### Key Metrics
- **Hypotheses Tested:** ${data.summary.hypothesis_count}
- **Evidence Collected:** ${data.summary.evidence_count}
- **Contradictions Found:** ${data.summary.contradiction_count}
- **Overall Confidence:** ${(data.summary.overall_confidence * 100).toFixed(1)}%

## Hypothesis Analysis

${data.hypotheses.map((h) => `### ${h.content}
- **Type:** ${h.type}
- **Status:** ${h.status}
- **Confidence:** ${(h.confidence * 100).toFixed(1)}%
`).join('\n')}

---
*Report generated: ${new Date().toISOString()}*
`;
}

/**
 * Generate HTML report
 */
function generateHtmlReport(data: ReportData): string {
  const confidenceColor = data.summary.overall_confidence > 0.7 ? '#28a745' : data.summary.overall_confidence > 0.4 ? '#ffc107' : '#dc3545';
  return `<!DOCTYPE html>
<html>
<head>
  <title>Research Report: ${data.engagement.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    .metric { display: inline-block; margin-right: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .hypothesis { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .confidence { font-weight: bold; color: ${confidenceColor}; }
  </style>
</head>
<body>
  <h1>Research Report: ${data.engagement.name}</h1>

  <h2>Executive Summary</h2>
  <p><strong>Target Company:</strong> ${data.engagement.target.name}</p>
  <p><strong>Investment Thesis:</strong> ${data.engagement.thesis?.summary ?? 'Not specified'}</p>

  <h3>Key Metrics</h3>
  <div class="metric">Hypotheses: ${data.summary.hypothesis_count}</div>
  <div class="metric">Evidence: ${data.summary.evidence_count}</div>
  <div class="metric">Contradictions: ${data.summary.contradiction_count}</div>
  <div class="metric">Confidence: <span class="confidence">${(data.summary.overall_confidence * 100).toFixed(1)}%</span></div>

  <h2>Hypothesis Analysis</h2>
  ${data.hypotheses.map((h) => `
  <div class="hypothesis">
    <h3>${h.content}</h3>
    <p><strong>Type:</strong> ${h.type} | <strong>Status:</strong> ${h.status} | <strong>Confidence:</strong> ${(h.confidence * 100).toFixed(1)}%</p>
  </div>
  `).join('')}

  <hr>
  <p><em>Report generated: ${new Date().toISOString()}</em></p>
</body>
</html>`;
}
