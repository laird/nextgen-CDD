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

  management_assessment: {
    name: 'management_assessment',
    description: 'Evaluate management team quality and track record',
    category: 'operational' as const,
    parameters: [
      { name: 'team_profiles', type: 'array' as const, description: 'Executive team profiles', required: true },
      { name: 'company_history', type: 'string' as const, description: 'Company history and timeline', required: false },
    ],
    implementation: `Perform a comprehensive management team assessment:

1. Executive Background Analysis:
   - Education and professional credentials
   - Prior company/industry experience
   - Track record of value creation
   - Tenure and stability

2. Team Dynamics:
   - Complementary skill sets
   - Decision-making structure
   - Succession planning
   - Board composition and governance

3. Performance Metrics:
   - Historical financial performance under current team
   - Strategic initiatives executed
   - Crisis management track record
   - Employee retention/satisfaction

4. Reference and Reputation:
   - Industry standing
   - Customer/partner relationships
   - Regulatory relationships

Output format:
- Individual executive assessments
- Team strength/weakness matrix
- Red flags and concerns
- Recommendations for further diligence`,
  },

  customer_concentration_risk: {
    name: 'customer_concentration_risk',
    description: 'Analyze customer concentration and revenue dependency risks',
    category: 'risk' as const,
    parameters: [
      { name: 'customer_data', type: 'object' as const, description: 'Customer revenue breakdown', required: true },
      { name: 'industry_benchmarks', type: 'object' as const, description: 'Industry concentration benchmarks', required: false },
    ],
    implementation: `Analyze customer concentration risk:

1. Revenue Concentration Metrics:
   - Top 1/5/10 customer % of revenue
   - Herfindahl-Hirschman Index for customer base
   - Year-over-year concentration trends

2. Customer Profile Analysis:
   - Customer industry/sector distribution
   - Geographic distribution
   - Contract terms and renewal rates
   - Payment terms and credit risk

3. Dependency Assessment:
   - Single customer dependencies
   - Platform/ecosystem dependencies
   - Channel partner concentration

4. Risk Scenarios:
   - Impact of losing top customers
   - Contract renewal risk
   - Pricing power assessment

Output format:
- Concentration metrics with industry benchmarks
- Customer risk heat map
- Contract analysis summary
- Mitigation strategies`,
  },

  regulatory_risk_assessment: {
    name: 'regulatory_risk_assessment',
    description: 'Evaluate regulatory environment and compliance risks',
    category: 'regulatory' as const,
    parameters: [
      { name: 'industry', type: 'string' as const, description: 'Target industry', required: true },
      { name: 'geographies', type: 'array' as const, description: 'Operating geographies', required: true },
      { name: 'known_regulations', type: 'array' as const, description: 'Known applicable regulations', required: false },
    ],
    implementation: `Perform regulatory risk assessment:

1. Regulatory Landscape Mapping:
   - Applicable federal/state/local regulations
   - Industry-specific requirements
   - International compliance (if applicable)
   - Pending regulatory changes

2. Compliance Status:
   - Current compliance posture
   - Historical violations/fines
   - Audit history
   - Required licenses and permits

3. Regulatory Risk Factors:
   - Political/policy risk
   - Enforcement trends
   - Industry lobbying dynamics
   - Regulatory capture risk

4. Future Outlook:
   - Pending legislation
   - Regulatory trends
   - ESG/sustainability requirements
   - Data privacy evolution

Output format:
- Regulatory matrix by jurisdiction
- Compliance gap analysis
- Risk scoring by regulation type
- Recommended compliance investments`,
  },

  technology_stack_assessment: {
    name: 'technology_stack_assessment',
    description: 'Evaluate technology infrastructure and technical debt',
    category: 'technology' as const,
    parameters: [
      { name: 'tech_stack', type: 'object' as const, description: 'Current technology stack details', required: true },
      { name: 'it_org', type: 'object' as const, description: 'IT organization structure', required: false },
    ],
    implementation: `Assess technology infrastructure:

1. Architecture Review:
   - System architecture overview
   - Cloud vs on-premise distribution
   - Integration patterns
   - Scalability assessment

2. Technical Debt Analysis:
   - Legacy system dependencies
   - Code quality indicators
   - Documentation completeness
   - Security vulnerabilities

3. IT Operations:
   - Uptime/reliability metrics
   - Incident management
   - Disaster recovery capabilities
   - DevOps maturity

4. Technology Investment:
   - R&D spending as % of revenue
   - Technology roadmap
   - Build vs buy decisions
   - Vendor lock-in risks

Output format:
- Technology stack diagram
- Technical debt quantification
- Security posture assessment
- Investment recommendations`,
  },

  unit_economics_analysis: {
    name: 'unit_economics_analysis',
    description: 'Deep dive into unit economics and contribution margins',
    category: 'financial' as const,
    parameters: [
      { name: 'revenue_data', type: 'object' as const, description: 'Revenue breakdown by product/customer', required: true },
      { name: 'cost_data', type: 'object' as const, description: 'Cost structure details', required: true },
      { name: 'growth_data', type: 'object' as const, description: 'Growth metrics', required: false },
    ],
    implementation: `Analyze unit economics:

1. Revenue Per Unit:
   - Average revenue per user/customer (ARPU)
   - Revenue by product line
   - Pricing tiers and mix
   - Discount/promotion impact

2. Cost Per Unit:
   - Customer acquisition cost (CAC)
   - Cost of goods sold per unit
   - Fulfillment/delivery costs
   - Customer service costs

3. Contribution Margin:
   - Gross margin by segment
   - Contribution margin by channel
   - Marginal economics at scale
   - Fixed vs variable cost structure

4. Lifetime Value:
   - Customer lifetime value (LTV)
   - LTV/CAC ratio
   - Payback period
   - Cohort analysis

Output format:
- Unit economics waterfall
- Segment profitability analysis
- Sensitivity analysis
- Path to improved economics`,
  },

  market_timing_assessment: {
    name: 'market_timing_assessment',
    description: 'Evaluate market timing and cycle position',
    category: 'market_sizing' as const,
    parameters: [
      { name: 'market', type: 'string' as const, description: 'Target market description', required: true },
      { name: 'economic_indicators', type: 'array' as const, description: 'Relevant economic indicators', required: false },
    ],
    implementation: `Assess market timing:

1. Market Cycle Position:
   - Current stage (early, growth, mature, decline)
   - Historical cycle patterns
   - Leading indicators
   - Comparison to similar markets

2. Macro Environment:
   - Economic cycle alignment
   - Interest rate environment
   - Capital availability
   - M&A activity levels

3. Industry Dynamics:
   - Competitive intensity trends
   - Technology disruption stage
   - Regulatory evolution
   - Customer behavior shifts

4. Timing Implications:
   - Entry point assessment
   - Hold period considerations
   - Exit timing scenarios
   - Downside protection needs

Output format:
- Market cycle diagram
- Timing scorecard
- Historical analogies
- Risk-adjusted timing recommendation`,
  },
};
