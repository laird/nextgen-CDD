import { z } from 'zod';

/**
 * Types of hypothesis nodes in the thesis tree
 */
export const HypothesisTypeSchema = z.enum([
  'thesis',
  'sub_thesis',
  'assumption',
  'evidence',
]);
export type HypothesisType = z.infer<typeof HypothesisTypeSchema>;

/**
 * Status of hypothesis validation
 */
export const HypothesisStatusSchema = z.enum([
  'untested',
  'supported',
  'challenged',
  'refuted',
]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

/**
 * Types of causal relationships between hypotheses
 */
export const CausalRelationshipSchema = z.enum([
  'requires',
  'supports',
  'contradicts',
  'implies',
]);
export type CausalRelationship = z.infer<typeof CausalRelationshipSchema>;

/**
 * Metadata for hypothesis nodes
 */
export const HypothesisMetadataSchema = z.object({
  created_at: z.number(), // Unix timestamp
  updated_at: z.number(), // Unix timestamp
  created_by: z.string(), // Agent or user ID
  source_refs: z.array(z.string()), // Evidence source IDs
});
export type HypothesisMetadata = z.infer<typeof HypothesisMetadataSchema>;

/**
 * Hypothesis node in the thesis tree
 * Represents a single hypothesis, assumption, or piece of evidence
 */
export const HypothesisNodeSchema = z.object({
  id: z.string().uuid(),
  type: HypothesisTypeSchema,
  content: z.string().min(1), // Natural language statement
  embedding: z.instanceof(Float32Array).optional(), // Vector representation
  confidence: z.number().min(0).max(1), // 0-1 confidence score
  status: HypothesisStatusSchema,
  metadata: HypothesisMetadataSchema,
});
export type HypothesisNode = z.infer<typeof HypothesisNodeSchema>;

/**
 * Causal edge connecting hypothesis nodes
 * Represents logical dependencies in the thesis tree
 */
export const CausalEdgeSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(), // Parent hypothesis ID
  target_id: z.string().uuid(), // Child hypothesis ID
  relationship: CausalRelationshipSchema,
  strength: z.number().min(0).max(1), // 0-1 relationship strength
  reasoning: z.string(), // Explanation of relationship
});
export type CausalEdge = z.infer<typeof CausalEdgeSchema>;

/**
 * Complete hypothesis tree structure
 */
export const HypothesisTreeSchema = z.object({
  id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  root_thesis_id: z.string().uuid(),
  nodes: z.array(HypothesisNodeSchema),
  edges: z.array(CausalEdgeSchema),
  created_at: z.number(),
  updated_at: z.number(),
});
export type HypothesisTree = z.infer<typeof HypothesisTreeSchema>;

/**
 * Request to create a new hypothesis
 */
export const CreateHypothesisRequestSchema = z.object({
  type: HypothesisTypeSchema,
  content: z.string().min(1),
  parent_id: z.string().uuid().optional(),
  relationship: CausalRelationshipSchema.optional(),
  strength: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
});
export type CreateHypothesisRequest = z.infer<typeof CreateHypothesisRequestSchema>;

/**
 * Request to update hypothesis confidence
 */
export const UpdateHypothesisConfidenceRequestSchema = z.object({
  hypothesis_id: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  status: HypothesisStatusSchema.optional(),
  reasoning: z.string().optional(),
});
export type UpdateHypothesisConfidenceRequest = z.infer<typeof UpdateHypothesisConfidenceRequestSchema>;

/**
 * Hypothesis decomposition result from the Hypothesis Builder agent
 */
export const HypothesisDecompositionSchema = z.object({
  original_thesis: z.string(),
  sub_theses: z.array(z.object({
    content: z.string(),
    importance: z.number().min(0).max(1),
  })),
  assumptions: z.array(z.object({
    content: z.string(),
    testability: z.number().min(0).max(1),
    risk_level: z.enum(['low', 'medium', 'high']),
  })),
  key_questions: z.array(z.string()),
});
export type HypothesisDecomposition = z.infer<typeof HypothesisDecompositionSchema>;

/**
 * Helper function to create a new hypothesis node
 */
export function createHypothesisNode(
  params: {
    type: HypothesisType;
    content: string;
    created_by: string;
    confidence?: number;
    status?: HypothesisStatus;
  }
): Omit<HypothesisNode, 'embedding'> {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    type: params.type,
    content: params.content,
    confidence: params.confidence ?? 0.5,
    status: params.status ?? 'untested',
    metadata: {
      created_at: now,
      updated_at: now,
      created_by: params.created_by,
      source_refs: [],
    },
  };
}

/**
 * Helper function to create a causal edge
 */
export function createCausalEdge(
  params: {
    source_id: string;
    target_id: string;
    relationship: CausalRelationship;
    strength?: number;
    reasoning?: string;
  }
): CausalEdge {
  return {
    id: crypto.randomUUID(),
    source_id: params.source_id,
    target_id: params.target_id,
    relationship: params.relationship,
    strength: params.strength ?? 0.5,
    reasoning: params.reasoning ?? '',
  };
}
