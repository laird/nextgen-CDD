import { z } from 'zod';
import { randomUUID } from 'crypto';

/**
 * Engagement status lifecycle
 */
export const EngagementStatusSchema = z.enum([
  'draft',
  'active',
  'in_review',
  'completed',
  'archived',
]);
export type EngagementStatus = z.infer<typeof EngagementStatusSchema>;

/**
 * Deal type classification
 */
export const DealTypeSchema = z.enum([
  'platform',
  'add_on',
  'growth_equity',
  'buyout',
  'carve_out',
  'recapitalization',
]);
export type DealType = z.infer<typeof DealTypeSchema>;

/**
 * Sector classification for the engagement
 */
export const SectorSchema = z.enum([
  'technology',
  'healthcare',
  'industrials',
  'consumer',
  'financial_services',
  'energy',
  'real_estate',
  'media',
  'telecommunications',
  'materials',
  'utilities',
  'other',
]);
export type Sector = z.infer<typeof SectorSchema>;

/**
 * Access control level for engagement
 */
export const AccessLevelSchema = z.enum([
  'viewer',
  'contributor',
  'manager',
  'admin',
]);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

/**
 * Team member assignment
 */
export const TeamMemberSchema = z.object({
  user_id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  access_level: AccessLevelSchema,
  assigned_at: z.number(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

/**
 * Retention policy for engagement data
 */
export const RetentionPolicySchema = z.object({
  deal_memory_days: z.number().min(30).max(3650),
  allow_institutional_learning: z.boolean(),
  anonymization_required: z.boolean(),
  auto_archive: z.boolean(),
  archive_after_days: z.number().optional(),
});
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

/**
 * Engagement configuration
 */
export const EngagementConfigSchema = z.object({
  enable_real_time_support: z.boolean(),
  enable_contradiction_analysis: z.boolean(),
  enable_comparables_search: z.boolean(),
  auto_refresh_market_intel: z.boolean(),
  market_intel_refresh_hours: z.number().optional(),
  max_evidence_per_hypothesis: z.number().optional(),
  min_credibility_threshold: z.number().min(0).max(1).optional(),
});
export type EngagementConfig = z.infer<typeof EngagementConfigSchema>;

/**
 * Target company information
 */
export const TargetCompanySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  sector: SectorSchema,
  sub_sector: z.string().optional(),
  headquarters: z.string().optional(),
  founded_year: z.number().optional(),
  employee_count: z.number().optional(),
  revenue_range: z.string().optional(),
  key_products: z.array(z.string()).optional(),
  key_customers: z.array(z.string()).optional(),
  competitors: z.array(z.string()).optional(),
});
export type TargetCompany = z.infer<typeof TargetCompanySchema>;

/**
 * Investment thesis summary
 */
export const InvestmentThesisSchema = z.object({
  summary: z.string(),
  key_value_drivers: z.array(z.string()),
  key_risks: z.array(z.string()),
  target_irr: z.number().optional(),
  hold_period_years: z.number().optional(),
  value_creation_levers: z.array(z.string()).optional(),
  key_questions: z.array(z.string()).optional(),
});
export type InvestmentThesis = z.infer<typeof InvestmentThesisSchema>;

/**
 * Thesis submission data (simpler format for TUI/frontend)
 */
export const ThesisSubmissionSchema = z.object({
  statement: z.string(),
  submitted_at: z.number(),
});
export type ThesisSubmission = z.infer<typeof ThesisSubmissionSchema>;

/**
 * Full engagement model
 */
export const EngagementSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  client_name: z.string(),
  deal_type: DealTypeSchema,
  status: EngagementStatusSchema,
  target_company: TargetCompanySchema,
  investment_thesis: InvestmentThesisSchema.optional(),
  thesis: ThesisSubmissionSchema.optional(), // Simpler thesis format for TUI compatibility
  team: z.array(TeamMemberSchema),
  config: EngagementConfigSchema,
  retention_policy: RetentionPolicySchema,

  // Namespace references
  deal_namespace: z.string(),

  // Timestamps
  created_at: z.number(),
  updated_at: z.number(),
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
  archived_at: z.number().optional(),

  // Metadata
  created_by: z.string(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type Engagement = z.infer<typeof EngagementSchema>;

/**
 * Simplified target schema for API requests (more flexible than internal TargetCompanySchema)
 */
export const TargetInputSchema = z.object({
  name: z.string(),
  sector: z.string(),
  location: z.string().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
});

/**
 * Request to create a new engagement
 * Accepts both 'target' and 'target_company' for frontend compatibility
 */
export const CreateEngagementRequestSchema = z.object({
  name: z.string().min(1),
  client_name: z.string().optional(),
  deal_type: z.union([DealTypeSchema, z.enum(['buyout', 'growth', 'venture', 'bolt-on'])]),
  // Accept both 'target' (TUI) and 'target_company' (internal)
  target_company: TargetInputSchema.optional(),
  target: TargetInputSchema.optional(),
  investment_thesis: InvestmentThesisSchema.optional(),
  config: EngagementConfigSchema.optional(),
  retention_policy: RetentionPolicySchema.optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).refine(
  (data) => data.target_company || data.target,
  { message: 'Either target_company or target is required' }
);
export type CreateEngagementRequest = z.infer<typeof CreateEngagementRequestSchema>;

/**
 * Request to update an engagement
 */
export const UpdateEngagementRequestSchema = z.object({
  name: z.string().min(1).optional(),
  status: EngagementStatusSchema.optional(),
  target_company: TargetCompanySchema.partial().optional(),
  investment_thesis: InvestmentThesisSchema.optional(),
  config: EngagementConfigSchema.partial().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type UpdateEngagementRequest = z.infer<typeof UpdateEngagementRequestSchema>;

/**
 * Engagement summary for listing
 */
export const EngagementSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  client_name: z.string(),
  deal_type: DealTypeSchema,
  status: EngagementStatusSchema,
  target_company_name: z.string(),
  sector: SectorSchema,
  created_at: z.number(),
  updated_at: z.number(),
  hypothesis_count: z.number(),
  evidence_count: z.number(),
  contradiction_count: z.number(),
});
export type EngagementSummary = z.infer<typeof EngagementSummarySchema>;

/**
 * Default engagement configuration
 */
export const defaultEngagementConfig: EngagementConfig = {
  enable_real_time_support: true,
  enable_contradiction_analysis: true,
  enable_comparables_search: true,
  auto_refresh_market_intel: true,
  market_intel_refresh_hours: 24,
  max_evidence_per_hypothesis: 100,
  min_credibility_threshold: 0.3,
};

/**
 * Default retention policy
 */
export const defaultRetentionPolicy: RetentionPolicy = {
  deal_memory_days: 365,
  allow_institutional_learning: true,
  anonymization_required: true,
  auto_archive: true,
  archive_after_days: 90,
};

/**
 * Map sector string to valid SectorSchema value
 */
function normalizeSector(sector: string): Sector {
  const sectorMap: Record<string, Sector> = {
    'industrial': 'industrials',
    'finance': 'financial_services',
    'fintech': 'financial_services',
    'tech': 'technology',
    'health': 'healthcare',
    'media_entertainment': 'media',
  };
  const normalized = sector.toLowerCase();
  if (sectorMap[normalized]) {
    return sectorMap[normalized];
  }
  // Check if it's already a valid sector
  const validSectors: Sector[] = [
    'technology', 'healthcare', 'industrials', 'consumer', 'financial_services',
    'energy', 'real_estate', 'media', 'telecommunications', 'materials', 'utilities', 'other'
  ];
  if (validSectors.includes(normalized as Sector)) {
    return normalized as Sector;
  }
  return 'other';
}

/**
 * Map deal type string to valid DealTypeSchema value
 */
function normalizeDealType(dealType: string): DealType {
  const dealTypeMap: Record<string, DealType> = {
    'buyout': 'buyout',
    'growth': 'growth_equity',
    'venture': 'growth_equity',
    'bolt-on': 'add_on',
    'platform': 'platform',
    'add_on': 'add_on',
    'growth_equity': 'growth_equity',
    'carve_out': 'carve_out',
    'recapitalization': 'recapitalization',
  };
  const normalized = dealType.toLowerCase();
  return dealTypeMap[normalized] ?? 'buyout';
}

/**
 * Helper function to create a new engagement
 */
export function createEngagement(
  request: CreateEngagementRequest,
  created_by: string
): Engagement {
  const id = randomUUID();
  const now = Date.now();

  // Handle target vs target_company alias
  const targetInput = request.target_company ?? request.target;
  if (!targetInput) {
    throw new Error('Either target_company or target is required');
  }

  // Normalize target company data
  const target_company: TargetCompany = {
    name: targetInput.name,
    sector: normalizeSector(targetInput.sector),
    headquarters: targetInput.location,
    description: targetInput.description,
    website: targetInput.website,
  };

  return {
    id,
    name: request.name,
    client_name: request.client_name ?? 'Unknown Client',
    deal_type: normalizeDealType(request.deal_type),
    status: 'draft',
    target_company,
    investment_thesis: request.investment_thesis,
    team: [],
    config: request.config ?? defaultEngagementConfig,
    retention_policy: request.retention_policy ?? defaultRetentionPolicy,
    deal_namespace: `deal_${id}`,
    created_at: now,
    updated_at: now,
    created_by,
    tags: request.tags ?? [],
    notes: request.notes,
  };
}

/**
 * Generate namespace names for an engagement
 */
export function getEngagementNamespaces(engagementId: string): {
  hypotheses: string;
  evidence: string;
  transcripts: string;
  graph: string;
  documents: string;
} {
  return {
    hypotheses: `deal_${engagementId}_hypotheses`,
    evidence: `deal_${engagementId}_evidence`,
    transcripts: `deal_${engagementId}_transcripts`,
    graph: `deal_${engagementId}_graph`,
    documents: `deal_${engagementId}_documents`,
  };
}
