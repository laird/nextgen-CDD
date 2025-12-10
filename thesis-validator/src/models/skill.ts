import { z } from 'zod';

/**
 * Skill categories for classification
 */
export const SkillCategorySchema = z.enum([
  'market_sizing',
  'competitive',
  'financial',
  'risk',
  'operational',
  'regulatory',
  'customer',
  'technology',
  'general',
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

/**
 * Parameter types for skill definitions
 */
export const ParameterTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'array',
  'object',
]);
export type ParameterType = z.infer<typeof ParameterTypeSchema>;

/**
 * Skill parameter definition
 */
export const SkillParameterSchema = z.object({
  name: z.string(),
  type: ParameterTypeSchema,
  description: z.string(),
  required: z.boolean(),
  default: z.any().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.string()).optional(),
  }).optional(),
});
export type SkillParameter = z.infer<typeof SkillParameterSchema>;

/**
 * Skill usage metrics
 */
export const SkillMetricsSchema = z.object({
  usage_count: z.number(),
  success_count: z.number(),
  failure_count: z.number(),
  average_duration_ms: z.number(),
  last_used_at: z.number().optional(),
  success_rate: z.number().min(0).max(1),
});
export type SkillMetrics = z.infer<typeof SkillMetricsSchema>;

/**
 * Full skill definition
 */
export const SkillDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string(),
  embedding: z.instanceof(Float32Array).optional(),
  category: SkillCategorySchema,
  parameters: z.array(SkillParameterSchema),
  implementation: z.string(), // Executable template/prompt

  // Versioning
  version: z.string(),

  // Metrics
  success_rate: z.number().min(0).max(1),
  usage_count: z.number(),
  metrics: SkillMetricsSchema.optional(),

  // Timestamps
  created_at: z.number(),
  updated_at: z.number(),
  last_refined: z.number(),

  // Metadata
  created_by: z.string(),
  tags: z.array(z.string()).optional(),
  examples: z.array(z.object({
    input: z.record(z.any()),
    expected_output: z.string(),
  })).optional(),
  related_skills: z.array(z.string().uuid()).optional(),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

/**
 * Request to create a new skill
 */
export const CreateSkillRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  category: SkillCategorySchema,
  parameters: z.array(SkillParameterSchema),
  implementation: z.string(),
  tags: z.array(z.string()).optional(),
  examples: z.array(z.object({
    input: z.record(z.any()),
    expected_output: z.string(),
  })).optional(),
});
export type CreateSkillRequest = z.infer<typeof CreateSkillRequestSchema>;

/**
 * Request to execute a skill
 */
export const ExecuteSkillRequestSchema = z.object({
  skill_id: z.string().uuid(),
  parameters: z.record(z.any()),
  context: z.object({
    engagement_id: z.string().uuid().optional(),
    hypothesis_id: z.string().uuid().optional(),
    additional_context: z.string().optional(),
  }).optional(),
});
export type ExecuteSkillRequest = z.infer<typeof ExecuteSkillRequestSchema>;

/**
 * Skill execution result
 */
export const SkillExecutionResultSchema = z.object({
  skill_id: z.string().uuid(),
  success: z.boolean(),
  output: z.any(),
  execution_time_ms: z.number(),
  error: z.string().optional(),
  metadata: z.object({
    tokens_used: z.number().optional(),
    model_used: z.string().optional(),
    sources_consulted: z.array(z.string()).optional(),
  }).optional(),
});
export type SkillExecutionResult = z.infer<typeof SkillExecutionResultSchema>;

/**
 * Skill search result
 */
export const SkillSearchResultSchema = z.object({
  skill: SkillDefinitionSchema,
  similarity_score: z.number().min(0).max(1),
  relevance_explanation: z.string().optional(),
});
export type SkillSearchResult = z.infer<typeof SkillSearchResultSchema>;

/**
 * Reflexion episode - learning from past task execution
 */
export const ReflexionEpisodeSchema = z.object({
  id: z.string().uuid(),
  engagement_id: z.string(), // Anonymized
  task_type: z.string(),
  outcome_score: z.number().min(0).max(1),
  was_successful: z.boolean(),
  self_critique: z.string(),
  key_learnings: z.array(z.string()),
  methodology_used: z.string(),
  embedding: z.instanceof(Float32Array).optional(),
  metadata: z.object({
    sector: z.string(),
    deal_type: z.string(),
    thesis_pattern: z.string(),
    duration_hours: z.number(),
    created_at: z.number(),
    agent_id: z.string().optional(),
  }),
});
export type ReflexionEpisode = z.infer<typeof ReflexionEpisodeSchema>;

/**
 * Request to store a reflexion episode
 */
export const StoreReflexionRequestSchema = z.object({
  task_type: z.string(),
  outcome_score: z.number().min(0).max(1),
  was_successful: z.boolean(),
  self_critique: z.string(),
  key_learnings: z.array(z.string()),
  methodology_used: z.string(),
  sector: z.string(),
  deal_type: z.string(),
  thesis_pattern: z.string(),
  duration_hours: z.number(),
});
export type StoreReflexionRequest = z.infer<typeof StoreReflexionRequestSchema>;

/**
 * Helper function to create a new skill definition
 */
export function createSkillDefinition(
  request: CreateSkillRequest,
  created_by: string
): Omit<SkillDefinition, 'embedding'> {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: request.name,
    description: request.description,
    category: request.category,
    parameters: request.parameters,
    implementation: request.implementation,
    version: '1.0.0',
    success_rate: 0,
    usage_count: 0,
    created_at: now,
    updated_at: now,
    last_refined: now,
    created_by,
    tags: request.tags ?? [],
    examples: request.examples ?? [],
    related_skills: [],
  };
}

/**
 * Helper function to create a reflexion episode
 */
export function createReflexionEpisode(
  _engagementId: string,
  request: StoreReflexionRequest,
  agentId?: string
): Omit<ReflexionEpisode, 'embedding'> {
  // Anonymize engagement ID for institutional memory
  const anonymizedEngagementId = crypto.randomUUID();

  const metadata: {
    sector: string;
    deal_type: string;
    thesis_pattern: string;
    duration_hours: number;
    created_at: number;
    agent_id?: string;
  } = {
    sector: request.sector,
    deal_type: request.deal_type,
    thesis_pattern: request.thesis_pattern,
    duration_hours: request.duration_hours,
    created_at: Date.now(),
  };

  if (agentId !== undefined) {
    metadata.agent_id = agentId;
  }

  return {
    id: crypto.randomUUID(),
    engagement_id: anonymizedEngagementId,
    task_type: request.task_type,
    outcome_score: request.outcome_score,
    was_successful: request.was_successful,
    self_critique: request.self_critique,
    key_learnings: request.key_learnings,
    methodology_used: request.methodology_used,
    metadata,
  };
}

/**
 * Update skill metrics after execution
 */
export function updateSkillMetrics(
  skill: SkillDefinition,
  success: boolean,
  durationMs: number
): SkillMetrics {
  const currentMetrics = skill.metrics ?? {
    usage_count: 0,
    success_count: 0,
    failure_count: 0,
    average_duration_ms: 0,
    success_rate: 0,
  };

  const newUsageCount = currentMetrics.usage_count + 1;
  const newSuccessCount = currentMetrics.success_count + (success ? 1 : 0);
  const newFailureCount = currentMetrics.failure_count + (success ? 0 : 1);
  const newAverageDuration =
    (currentMetrics.average_duration_ms * currentMetrics.usage_count + durationMs) / newUsageCount;

  return {
    usage_count: newUsageCount,
    success_count: newSuccessCount,
    failure_count: newFailureCount,
    average_duration_ms: newAverageDuration,
    last_used_at: Date.now(),
    success_rate: newSuccessCount / newUsageCount,
  };
}

/**
 * Pre-defined skill templates for common analyses
 */
export const skillTemplates = {
  tam_bottom_up: {
    name: 'tam_bottom_up',
    description: 'Bottom-up TAM sizing using customer segment analysis',
    category: 'market_sizing' as const,
    parameters: [
      { name: 'segments', type: 'array' as const, description: 'Customer segments to analyze', required: true },
      { name: 'asp_range', type: 'object' as const, description: 'Average selling price range per segment', required: true },
      { name: 'penetration_assumptions', type: 'object' as const, description: 'Market penetration assumptions', required: false },
    ],
    implementation: `Perform a bottom-up Total Addressable Market (TAM) analysis:

1. For each customer segment provided:
   - Estimate the number of potential customers
   - Calculate the average deal size based on ASP range
   - Apply penetration rate assumptions

2. Calculate segment TAM = Number of customers × Average deal size × Penetration rate

3. Sum all segment TAMs to get total TAM

4. Provide confidence intervals based on assumption sensitivity

Output format:
- Segment-level breakdowns with methodology
- Total TAM with low/mid/high scenarios
- Key assumptions and sensitivities
- Data sources and credibility assessment`,
  },

  competitive_landscape: {
    name: 'competitive_landscape',
    description: 'Comprehensive competitive landscape analysis',
    category: 'competitive' as const,
    parameters: [
      { name: 'target_company', type: 'string' as const, description: 'Target company name', required: true },
      { name: 'competitors', type: 'array' as const, description: 'Known competitors to analyze', required: false },
      { name: 'dimensions', type: 'array' as const, description: 'Comparison dimensions', required: false },
    ],
    implementation: `Perform a comprehensive competitive landscape analysis:

1. Identify all relevant competitors (direct and indirect)
2. For each competitor:
   - Company overview and positioning
   - Product/service comparison
   - Pricing analysis
   - Market share estimates
   - Strengths and weaknesses

3. Create competitive matrix across key dimensions
4. Identify competitive moats and vulnerabilities
5. Assess competitive dynamics and trends

Output format:
- Competitor profiles
- Competitive matrix visualization data
- SWOT analysis per competitor
- Competitive positioning assessment`,
  },

  supplier_concentration: {
    name: 'supplier_concentration',
    description: 'Supplier concentration and dependency risk analysis',
    category: 'risk' as const,
    parameters: [
      { name: 'supplier_data', type: 'object' as const, description: 'Supplier information and spend data', required: true },
      { name: 'critical_inputs', type: 'array' as const, description: 'Critical input categories', required: false },
    ],
    implementation: `Analyze supplier concentration risk:

1. Calculate supplier concentration metrics:
   - Top 5/10 supplier % of total spend
   - Herfindahl-Hirschman Index (HHI)
   - Single-source dependencies

2. For each critical supplier:
   - Switching costs assessment
   - Alternative supplier availability
   - Geographic concentration
   - Financial stability

3. Risk scenario analysis:
   - Supply disruption impact
   - Price increase sensitivity
   - Quality issues

Output format:
- Concentration metrics with benchmarks
- Supplier risk heat map
- Mitigation recommendations
- Action items for due diligence`,
  },
};
