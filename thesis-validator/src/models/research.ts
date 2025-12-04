/**
 * Research Models
 *
 * Zod schemas and types for research workflow
 */

import { z } from 'zod';

/**
 * Research job status
 */
export const ResearchJobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'partial'
]);

export type ResearchJobStatus = z.infer<typeof ResearchJobStatusSchema>;

/**
 * Research configuration
 */
export const ResearchConfigSchema = z.object({
  maxHypotheses: z.number().min(1).max(10).default(5),
  enableDeepDive: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(100).default(70),
  searchDepth: z.enum(['quick', 'standard', 'thorough']).default('standard'),
});

export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

/**
 * Evidence type
 */
export const EvidenceTypeSchema = z.enum(['supporting', 'contradicting', 'neutral']);

export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/**
 * Evidence item
 */
export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  job_id: z.string().uuid(),
  type: EvidenceTypeSchema,
  hypothesis: z.string().min(1),
  content: z.string().min(1),
  source_url: z.string().url().optional(),
  source_type: z.string().optional(),
  confidence: z.number().min(0).max(1),
  created_at: z.number(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * Validation status for hypotheses
 */
export const ValidationStatusSchema = z.enum([
  'pending',
  'validated',
  'rejected',
  'inconclusive'
]);

export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

/**
 * Hypothesis
 */
export const HypothesisSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  statement: z.string().min(1),
  testable: z.boolean(),
  priority: z.number().min(1).max(5),
  validation_status: ValidationStatusSchema,
  evidence_summary: z.string().optional(),
  created_at: z.number(),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

/**
 * Research results summary
 */
export const ResearchResultsSchema = z.object({
  verdict: z.enum(['proceed', 'review', 'reject']),
  summary: z.string(),
  key_findings: z.array(z.string()),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type ResearchResults = z.infer<typeof ResearchResultsSchema>;

/**
 * Research job
 */
export const ResearchJobSchema = z.object({
  id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  status: ResearchJobStatusSchema,
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
  error_message: z.string().optional(),
  config: ResearchConfigSchema,
  results: ResearchResultsSchema.optional(),
  confidence_score: z.number().min(0).max(100).optional(),
  created_at: z.number(),
  updated_at: z.number(),
});

export type ResearchJob = z.infer<typeof ResearchJobSchema>;

/**
 * Request to start research
 */
export const StartResearchRequestSchema = z.object({
  thesis: z.string().min(10).max(2000),
  config: ResearchConfigSchema.partial().optional(),
});

export type StartResearchRequest = z.infer<typeof StartResearchRequestSchema>;

/**
 * Progress event types
 */
export const ProgressEventTypeSchema = z.enum([
  'status_update',
  'phase_start',
  'phase_complete',
  'hypothesis_generated',
  'evidence_found',
  'contradiction_detected',
  'round_complete',
  'job_complete',
  'completed',
  'error',
]);

export type ProgressEventType = z.infer<typeof ProgressEventTypeSchema>;

/**
 * Progress event
 */
export const ProgressEventSchema = z.object({
  type: ProgressEventTypeSchema,
  jobId: z.string().uuid(),
  timestamp: z.number(),
  data: z.record(z.unknown()),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
