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
import type { HypothesisTree, HypothesisNode } from '../../models/index.js';

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
      const config = request.body;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      if (!engagement.thesis?.statement) {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'Investment thesis must be submitted before starting research',
        });
        return;
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

      // Update engagement status
      updateEngagement(engagementId, { status: 'research_active' });

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

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = createDealMemory();
      const hypotheses = await dealMemory.searchHypotheses(engagementId, '', 100);

      // Build tree structure
      const tree = buildHypothesisTree(hypotheses, engagement.thesis?.statement ?? '');

      reply.send({
        engagement_id: engagementId,
        thesis: engagement.thesis?.statement,
        tree,
        node_count: hypotheses.length,
      });
    }
  );

  /**
   * Get specific hypothesis
   * GET /engagements/:engagementId/hypotheses/:hypothesisId
   */
  fastify.get(
    '/:engagementId/hypotheses/:hypothesisId',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, hypothesisId } = request.params;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = createDealMemory();
      const hypotheses = await dealMemory.searchHypotheses(engagementId, '', 100);
      const hypothesis = hypotheses.find((h) => h.id === hypothesisId);

      if (!hypothesis) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Hypothesis not found',
        });
        return;
      }

      // Get related evidence
      const evidence = await dealMemory.searchEvidence(engagementId, hypothesis.statement, 20);
      const relatedEvidence = evidence.filter((e) => e.hypothesis_ids.includes(hypothesisId));

      reply.send({
        hypothesis,
        evidence: relatedEvidence,
        evidence_count: relatedEvidence.length,
      });
    }
  );

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

      const engagement = getEngagement(engagementId);
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
      const { format, include_evidence, include_contradictions } = request.query;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = createDealMemory();

      // Gather all data
      const hypotheses = await dealMemory.searchHypotheses(engagementId, '', 100);
      const evidence = include_evidence
        ? await dealMemory.searchEvidence(engagementId, '', 200)
        : [];
      const contradictions = include_contradictions
        ? await dealMemory.searchContradictions(engagementId, '', 50)
        : [];

      // Generate report based on format
      const report = generateReport(
        engagement,
        hypotheses,
        evidence,
        contradictions,
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
 * Execute research workflow asynchronously
 */
async function executeResearchWorkflowAsync(
  job: ResearchJob,
  engagement: ReturnType<typeof getEngagement> & {},
  config: {
    depth: 'quick' | 'standard' | 'deep';
    focus_areas?: string[];
    include_comparables: boolean;
    max_sources: number;
  },
  userId: string
): Promise<void> {
  job.status = 'running';

  try {
    // Build the thesis object from engagement data
    const thesis = {
      summary: engagement.thesis?.statement ?? '',
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
    });

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    job.result = result;

    // Update engagement status
    updateEngagement(engagement.id, { status: 'research_complete' });
  } catch (error) {
    job.status = 'failed';
    job.completedAt = Date.now();
    job.error = error instanceof Error ? error.message : 'Unknown error';

    updateEngagement(engagement.id, { status: 'research_failed' });
  }
}

/**
 * Execute stress test workflow asynchronously
 */
async function executeStressTestAsync(
  job: ResearchJob,
  engagement: ReturnType<typeof getEngagement> & {},
  config: {
    hypothesis_ids?: string[];
    intensity: 'light' | 'moderate' | 'aggressive';
    devil_advocate_mode: boolean;
    search_contrarian_sources: boolean;
  },
  userId: string
): Promise<void> {
  job.status = 'running';

  try {
    const result = await executeStressTestWorkflow({
      engagement_id: engagement.id,
      hypothesis_ids: config.hypothesis_ids,
      intensity: config.intensity,
      devil_advocate_mode: config.devil_advocate_mode,
    });

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
  hypotheses: HypothesisNode[],
  rootThesis: string
): HypothesisTree {
  const nodeMap = new Map<string, HypothesisNode>();
  hypotheses.forEach((h) => nodeMap.set(h.id, h));

  // Find root nodes (those without parents or where parent is the main thesis)
  const rootNodes = hypotheses.filter(
    (h) => !h.parent_id || !nodeMap.has(h.parent_id)
  );

  // Build tree structure recursively
  function buildSubtree(node: HypothesisNode): HypothesisNode & { children: HypothesisNode[] } {
    const children = hypotheses
      .filter((h) => h.parent_id === node.id)
      .map(buildSubtree);

    return {
      ...node,
      children,
    };
  }

  return {
    id: crypto.randomUUID(),
    root_thesis: rootThesis,
    nodes: hypotheses,
    edges: [], // Would be populated from causal graph
    created_at: Date.now(),
    updated_at: Date.now(),
    version: 1,
  };
}

/**
 * Generate report in specified format
 */
function generateReport(
  engagement: ReturnType<typeof getEngagement> & {},
  hypotheses: HypothesisNode[],
  evidence: unknown[],
  contradictions: unknown[],
  format: 'json' | 'markdown' | 'html'
): string | object {
  const reportData = {
    engagement: {
      id: engagement.id,
      name: engagement.name,
      target: engagement.target,
      thesis: engagement.thesis,
      status: engagement.status,
    },
    summary: {
      hypothesis_count: hypotheses.length,
      evidence_count: evidence.length,
      contradiction_count: contradictions.length,
      overall_confidence: calculateOverallConfidence(hypotheses),
    },
    hypotheses: hypotheses.map((h) => ({
      id: h.id,
      statement: h.statement,
      type: h.type,
      status: h.status,
      confidence: h.confidence,
    })),
    evidence,
    contradictions,
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

  const confidences = hypotheses.map((h) => h.confidence.current);
  return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(data: {
  engagement: { name: string; target: { name: string }; thesis?: { statement: string } };
  summary: { hypothesis_count: number; evidence_count: number; contradiction_count: number; overall_confidence: number };
  hypotheses: { statement: string; type: string; status: string; confidence: { current: number } }[];
}): string {
  return `# Research Report: ${data.engagement.name}

## Executive Summary

**Target Company:** ${data.engagement.target.name}
**Investment Thesis:** ${data.engagement.thesis?.statement ?? 'Not specified'}

### Key Metrics
- **Hypotheses Tested:** ${data.summary.hypothesis_count}
- **Evidence Collected:** ${data.summary.evidence_count}
- **Contradictions Found:** ${data.summary.contradiction_count}
- **Overall Confidence:** ${(data.summary.overall_confidence * 100).toFixed(1)}%

## Hypothesis Analysis

${data.hypotheses.map((h) => `### ${h.statement}
- **Type:** ${h.type}
- **Status:** ${h.status}
- **Confidence:** ${(h.confidence.current * 100).toFixed(1)}%
`).join('\n')}

---
*Report generated: ${new Date().toISOString()}*
`;
}

/**
 * Generate HTML report
 */
function generateHtmlReport(data: {
  engagement: { name: string; target: { name: string }; thesis?: { statement: string } };
  summary: { hypothesis_count: number; evidence_count: number; contradiction_count: number; overall_confidence: number };
  hypotheses: { statement: string; type: string; status: string; confidence: { current: number } }[];
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Research Report: ${data.engagement.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    .metric { display: inline-block; margin-right: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .hypothesis { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .confidence { font-weight: bold; color: ${data.summary.overall_confidence > 0.7 ? '#28a745' : data.summary.overall_confidence > 0.4 ? '#ffc107' : '#dc3545'}; }
  </style>
</head>
<body>
  <h1>Research Report: ${data.engagement.name}</h1>

  <h2>Executive Summary</h2>
  <p><strong>Target Company:</strong> ${data.engagement.target.name}</p>
  <p><strong>Investment Thesis:</strong> ${data.engagement.thesis?.statement ?? 'Not specified'}</p>

  <h3>Key Metrics</h3>
  <div class="metric">Hypotheses: ${data.summary.hypothesis_count}</div>
  <div class="metric">Evidence: ${data.summary.evidence_count}</div>
  <div class="metric">Contradictions: ${data.summary.contradiction_count}</div>
  <div class="metric">Confidence: <span class="confidence">${(data.summary.overall_confidence * 100).toFixed(1)}%</span></div>

  <h2>Hypothesis Analysis</h2>
  ${data.hypotheses.map((h) => `
  <div class="hypothesis">
    <h3>${h.statement}</h3>
    <p><strong>Type:</strong> ${h.type} | <strong>Status:</strong> ${h.status} | <strong>Confidence:</strong> ${(h.confidence.current * 100).toFixed(1)}%</p>
  </div>
  `).join('')}

  <hr>
  <p><em>Report generated: ${new Date().toISOString()}</em></p>
</body>
</html>`;
}
