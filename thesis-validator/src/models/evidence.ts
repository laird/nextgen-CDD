import { z } from 'zod';

/**
 * Types of evidence sources
 */
export const EvidenceSourceTypeSchema = z.enum([
  'web',
  'document',
  'expert',
  'data',
  'filing',
]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;

/**
 * Evidence sentiment - whether it supports or contradicts the hypothesis
 */
export const EvidenceSentimentSchema = z.enum([
  'supporting',
  'neutral',
  'contradicting',
]);
export type EvidenceSentiment = z.infer<typeof EvidenceSentimentSchema>;

/**
 * Source information for evidence
 */
export const EvidenceSourceSchema = z.object({
  type: EvidenceSourceTypeSchema,
  url: z.string().url().optional(),
  document_id: z.string().optional(),
  expert_id: z.string().optional(),
  retrieved_at: z.number(), // Unix timestamp
  credibility_score: z.number().min(0).max(1), // 0-1 source credibility
  title: z.string().optional(),
  author: z.string().optional(),
  publication_date: z.number().optional(), // Unix timestamp
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

/**
 * Relevance mapping to hypotheses
 */
export const EvidenceRelevanceSchema = z.object({
  hypothesis_ids: z.array(z.string().uuid()),
  relevance_scores: z.array(z.number().min(0).max(1)),
});
export type EvidenceRelevance = z.infer<typeof EvidenceRelevanceSchema>;

/**
 * Provenance certificate for evidence traceability
 */
export const ProvenanceCertificateSchema = z.object({
  merkle_proof: z.string(), // Merkle proof hash
  explanation: z.string(), // Why this was retrieved
  retrieval_timestamp: z.number(),
  similarity_score: z.number().min(0).max(1),
  query_embedding_hash: z.string(),
});
export type ProvenanceCertificate = z.infer<typeof ProvenanceCertificateSchema>;

/**
 * Evidence node representing a piece of research evidence
 */
export const EvidenceNodeSchema = z.object({
  id: z.string().uuid(),
  content: z.string(), // Evidence text/summary
  embedding: z.instanceof(Float32Array).optional(), // Vector representation
  source: EvidenceSourceSchema,
  relevance: EvidenceRelevanceSchema,
  sentiment: EvidenceSentimentSchema,
  provenance_certificate: z.string().optional(), // Merkle proof hash
  confidence: z.number().min(0).max(1).optional(), // Confidence in the evidence
  tags: z.array(z.string()).optional(), // Categorization tags
  created_at: z.number(),
  updated_at: z.number(),
});
export type EvidenceNode = z.infer<typeof EvidenceNodeSchema>;

/**
 * Contradiction node - evidence that contradicts a hypothesis
 */
export const ContradictionNodeSchema = z.object({
  id: z.string().uuid(),
  evidence_id: z.string().uuid(),
  hypothesis_id: z.string().uuid(),
  severity: z.number().min(0).max(1), // 0-1 severity of contradiction
  explanation: z.string(), // Why this contradicts
  resolution_status: z.enum(['unresolved', 'explained', 'dismissed', 'critical']),
  created_at: z.number(),
  resolved_at: z.number().optional(),
  resolution_notes: z.string().optional(),
});
export type ContradictionNode = z.infer<typeof ContradictionNodeSchema>;

/**
 * Request to create new evidence
 */
export const CreateEvidenceRequestSchema = z.object({
  content: z.string().min(1),
  source: EvidenceSourceSchema,
  hypothesis_ids: z.array(z.string().uuid()).optional(),
  sentiment: EvidenceSentimentSchema.optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateEvidenceRequest = z.infer<typeof CreateEvidenceRequestSchema>;

/**
 * Evidence search result with retrieval metadata
 */
export const EvidenceSearchResultSchema = z.object({
  evidence: EvidenceNodeSchema,
  similarity_score: z.number().min(0).max(1),
  explanation: z.string().optional(),
  certificate: ProvenanceCertificateSchema.optional(),
});
export type EvidenceSearchResult = z.infer<typeof EvidenceSearchResultSchema>;

/**
 * Batch evidence insertion request
 */
export const EvidenceBatchInsertRequestSchema = z.object({
  evidence_items: z.array(CreateEvidenceRequestSchema),
  engagement_id: z.string().uuid(),
  source_batch_id: z.string().optional(), // For tracking batch imports
});
export type EvidenceBatchInsertRequest = z.infer<typeof EvidenceBatchInsertRequestSchema>;

/**
 * Evidence aggregation for reporting
 */
export const EvidenceAggregationSchema = z.object({
  total_count: z.number(),
  by_source_type: z.record(EvidenceSourceTypeSchema, z.number()),
  by_sentiment: z.record(EvidenceSentimentSchema, z.number()),
  average_credibility: z.number(),
  contradiction_count: z.number(),
});
export type EvidenceAggregation = z.infer<typeof EvidenceAggregationSchema>;

/**
 * Helper function to create a new evidence node
 */
export function createEvidenceNode(
  params: {
    content: string;
    source: EvidenceSource;
    sentiment?: EvidenceSentiment;
    hypothesis_ids?: string[];
    tags?: string[];
  }
): Omit<EvidenceNode, 'embedding'> {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    content: params.content,
    source: params.source,
    sentiment: params.sentiment ?? 'neutral',
    relevance: {
      hypothesis_ids: params.hypothesis_ids ?? [],
      relevance_scores: params.hypothesis_ids?.map(() => 0.5) ?? [],
    },
    tags: params.tags ?? [],
    confidence: params.source.credibility_score,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Helper function to create a contradiction node
 */
export function createContradictionNode(
  params: {
    evidence_id: string;
    hypothesis_id: string;
    severity: number;
    explanation: string;
  }
): ContradictionNode {
  return {
    id: crypto.randomUUID(),
    evidence_id: params.evidence_id,
    hypothesis_id: params.hypothesis_id,
    severity: params.severity,
    explanation: params.explanation,
    resolution_status: 'unresolved',
    created_at: Date.now(),
  };
}

/**
 * Calculate aggregate statistics for a set of evidence
 */
export function aggregateEvidence(evidence: EvidenceNode[]): EvidenceAggregation {
  const bySourceType: Record<string, number> = {};
  const bySentiment: Record<string, number> = {};
  let totalCredibility = 0;
  let contradictionCount = 0;

  for (const e of evidence) {
    bySourceType[e.source.type] = (bySourceType[e.source.type] ?? 0) + 1;
    bySentiment[e.sentiment] = (bySentiment[e.sentiment] ?? 0) + 1;
    totalCredibility += e.source.credibility_score;
    if (e.sentiment === 'contradicting') {
      contradictionCount++;
    }
  }

  return {
    total_count: evidence.length,
    by_source_type: bySourceType as Record<EvidenceSourceType, number>,
    by_sentiment: bySentiment as Record<EvidenceSentiment, number>,
    average_credibility: evidence.length > 0 ? totalCredibility / evidence.length : 0,
    contradiction_count: contradictionCount,
  };
}
