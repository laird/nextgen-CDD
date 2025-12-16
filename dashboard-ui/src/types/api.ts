/**
 * API Types - Shared types for Thesis Validator API
 */

export interface Engagement {
  id: string;
  name: string;
  target: {
    name: string;
    sector: string;
    location?: string;
  };
  deal_type: 'buyout' | 'growth' | 'venture' | 'bolt-on';
  status: 'pending' | 'research_active' | 'research_complete' | 'research_failed' | 'completed' | 'draft' | 'active' | 'in_review';
  thesis?: {
    statement: string;
    submitted_at: number;
  };
  created_at: number;
  updated_at: number;
  created_by: string;
  // Additional fields used by EngagementForm (populated by API client transform)
  target_company?: string;
  sector?: string;
  description?: string;
  deal_size?: number;
  lead_partner?: string;
}

export interface EngagementFilters {
  status?: string;
  sector?: string;
  limit?: number;
  offset?: number;
}

export interface CreateEngagementRequest {
  name: string;
  target: {
    name: string;
    sector: string;
    location?: string;
  };
  deal_type: 'buyout' | 'growth' | 'venture' | 'bolt-on';
  thesis_statement?: string;
}

export interface UpdateEngagementRequest {
  name?: string;
  target?: {
    name?: string;
    sector?: string;
    location?: string;
  };
  status?: Engagement['status'];
  thesis_statement?: string;
}

export interface ResearchJob {
  id: string;
  engagement_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial' | 'pending';
  started_at?: number;
  completed_at?: number;
  error_message?: string;
  error?: string;
  confidence_score?: number;
  progress?: number;
  results?: ResearchResults;
  config: ResearchConfig;
  created_at: number;
  updated_at: number;
}

export interface ResearchConfig {
  maxHypotheses?: number;
  enableDeepDive?: boolean;
  confidenceThreshold?: number;
  searchDepth?: 'quick' | 'standard' | 'thorough';
}

export interface ResearchFinding {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  source?: string;
}

export interface ResearchRisk {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation?: string;
}

export interface ResearchResults {
  verdict: 'proceed' | 'review' | 'reject' | 'validated' | 'refuted' | 'inconclusive';
  summary: string;
  confidence: number;
  key_findings: ResearchFinding[];
  risks: ResearchRisk[];
  opportunities: string[];
  recommendations: string[];
  evidence_summary?: string;
}

export interface StartResearchRequest {
  thesis: string;
  config?: Partial<ResearchConfig>;
}

export interface Hypothesis {
  id: string;
  job_id: string;
  statement: string;
  testable: boolean;
  priority: number;
  validation_status: 'pending' | 'validated' | 'rejected' | 'inconclusive';
  evidence_summary?: string;
  created_at: number;
}

export interface EvidenceItem {
  id: string;
  engagement_id: string;
  job_id: string;
  type: 'supporting' | 'contradicting' | 'neutral';
  hypothesis: string;
  content: string;
  source_url?: string;
  source_type?: string;
  confidence: number;
  created_at: number;
}

export interface ProgressEvent {
  type: 'status_update' | 'phase_start' | 'phase_complete' | 'hypothesis_generated' |
        'evidence_found' | 'contradiction_detected' | 'round_complete' | 'job_complete' |
        'completed' | 'error';
  jobId: string;
  timestamp: number | string;
  data: Record<string, unknown>;
  message?: string;
  progress?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
}

export interface SystemMetrics {
  timestamp: number;
  websocket: {
    total_connections: number;
    connections_by_engagement: Record<string, number>;
  };
  expert_calls: {
    active_sessions: number;
    sessions: Array<{
      session_id: string;
      engagement_id: string;
      user_id: string;
      started_at: number;
      chunks_processed: number;
    }>;
  };
  memory: {
    heap_used: number;
    heap_total: number;
    rss: number;
  };
  uptime: number;
}

export interface APIError {
  error: string;
  message: string;
  details?: unknown;
}

export interface HypothesisNode {
  id: string;
  engagementId: string;
  parentId: string | null;
  type: 'thesis' | 'sub_thesis' | 'assumption';
  content: string;
  confidence: number;
  status: 'untested' | 'supported' | 'challenged' | 'refuted';
  importance: 'critical' | 'high' | 'medium' | 'low' | null;
  testability: 'easy' | 'moderate' | 'difficult' | null;
  createdAt: string;
  updatedAt: string;
}

export interface HypothesisEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: 'requires' | 'supports' | 'contradicts' | 'implies';
  strength: number;
  reasoning: string | null;
}

export interface HypothesisTree {
  hypotheses: HypothesisNode[];
  edges: HypothesisEdge[];
  count: number;
}

export interface CreateHypothesisRequest {
  type: 'thesis' | 'sub_thesis' | 'assumption';
  content: string;
  parent_id?: string;
  confidence?: number;
  importance?: 'critical' | 'high' | 'medium' | 'low';
  testability?: 'easy' | 'moderate' | 'difficult';
}

export interface UpdateHypothesisRequest {
  content?: string;
  confidence?: number;
  status?: 'untested' | 'supported' | 'challenged' | 'refuted';
  importance?: 'critical' | 'high' | 'medium' | 'low';
  testability?: 'easy' | 'moderate' | 'difficult';
}

// Evidence types
export type EvidenceSourceType = 'web' | 'document' | 'expert' | 'data' | 'filing' | 'financial';
export type EvidenceSentiment = 'supporting' | 'neutral' | 'contradicting';

export interface Evidence {
  id: string;
  engagementId: string;
  content: string;
  sourceType: EvidenceSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourcePublicationDate: string | null;
  credibility: number | null;
  sentiment: EvidenceSentiment;
  documentId: string | null;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
  retrievedAt: string | null;
  createdAt: string;
  linkedHypotheses?: Array<{ hypothesisId: string; relevanceScore: number }>;
}

export interface EvidenceFilters {
  sourceType?: EvidenceSourceType;
  sentiment?: EvidenceSentiment;
  minCredibility?: number;
  hypothesisId?: string;
  documentId?: string;
  limit?: number;
  offset?: number;
}

export interface EvidenceStats {
  totalCount: number;
  bySourceType: Record<string, number>;
  bySentiment: Record<string, number>;
  averageCredibility: number;
  hypothesisCoverage: number;
}

export interface CreateEvidenceRequest {
  content: string;
  sourceType: EvidenceSourceType;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  sourcePublicationDate?: string;
  credibility?: number;
  sentiment?: EvidenceSentiment;
  hypothesisIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateEvidenceRequest {
  content?: string;
  credibility?: number;
  sentiment?: EvidenceSentiment;
  metadata?: Record<string, unknown>;
}

// Document types
export type DocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'html' | 'image' | 'unknown';
export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Document {
  id: string;
  engagementId: string;
  filename: string;
  originalFilename: string;
  format: DocumentFormat;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  status: DocumentStatus;
  chunkCount: number;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  uploadedBy: string | null;
  uploadedAt: string;
  processedAt: string | null;
}

export interface DocumentFilters {
  status?: DocumentStatus;
  format?: DocumentFormat;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Contradiction Types
// =============================================================================

export type ContradictionSeverity = 'low' | 'medium' | 'high';
export type ContradictionStatus = 'unresolved' | 'explained' | 'dismissed' | 'critical';

export interface Contradiction {
  id: string;
  engagementId: string;
  hypothesisId: string | null;
  evidenceId: string | null;
  description: string;
  severity: ContradictionSeverity;
  status: ContradictionStatus;
  bearCaseTheme: string | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContradictionFilters {
  severity?: ContradictionSeverity;
  status?: ContradictionStatus;
  hypothesisId?: string;
  limit?: number;
  offset?: number;
}

export interface ContradictionStats {
  total: number;
  bySeverity: Record<ContradictionSeverity, number>;
  byStatus: Record<ContradictionStatus, number>;
  resolutionRate: number;
}

export interface CreateContradictionRequest {
  hypothesisId?: string;
  evidenceId?: string;
  description: string;
  severity: ContradictionSeverity;
  bearCaseTheme?: string;
}

export interface ResolveContradictionRequest {
  status: 'explained' | 'dismissed';
  resolutionNotes: string;
}

// =============================================================================
// Stress Test Types
// =============================================================================

export type StressTestIntensity = 'light' | 'moderate' | 'aggressive';
export type StressTestStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StressTest {
  id: string;
  engagementId: string;
  intensity: StressTestIntensity;
  status: StressTestStatus;
  vulnerabilitiesFound: number;
  scenariosRun: number;
  overallRiskScore: number | null;
  results: StressTestResults | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface StressTestResults {
  scenarios: Array<{
    name: string;
    description: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    likelihood: number;
    findings: string[];
  }>;
  vulnerabilities: Array<{
    hypothesis: string;
    weakness: string;
    severity: 'low' | 'medium' | 'high';
    mitigation: string | null;
  }>;
  summary: string;
  overallAssessment: 'robust' | 'moderate' | 'vulnerable' | 'critical';
}

export interface StressTestStats {
  totalTests: number;
  averageRiskScore: number;
  lastTestAt: string | null;
  vulnerabilitiesByIntensity: Record<StressTestIntensity, number>;
}

export interface RunStressTestRequest {
  intensity: StressTestIntensity;
}

// =============================================================================
// Expert Call Types
// =============================================================================

export type ExpertCallStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ExpertCallInsight {
  type: 'key_point' | 'contradiction' | 'data_point' | 'follow_up';
  content: string;
  confidence: number;
  speaker?: string;
  relatedHypothesisId?: string;
}

export interface ExpertCall {
  id: string;
  engagementId: string;
  status: ExpertCallStatus;
  transcript: string | null;
  speakerLabels: Record<string, string>;
  focusAreas: string[];
  callDate: string | null;
  results: ExpertCallResults | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpertProfile {
  name: string;
  role?: string;
  organization?: string;
  expertise: string[];
  perspectiveSummary?: string;
  credibilityIndicators: string[];
  speakingTime: number;
  segmentCount: number;
}

export interface TranscriptInsight {
  id: string;
  type: 'key_point' | 'data_point' | 'market_insight' | 'competitive_intel' | 'risk_factor' | 'opportunity' | 'contradiction' | 'validation' | 'caveat' | 'recommendation';
  content: string;
  quote?: string;
  speaker: string;
  timestamp: number;
  confidence: number;
  relatedHypothesisIds?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  importance: 'high' | 'medium' | 'low';
}

export interface EnhancedInsight {
  insight: TranscriptInsight;
  relatedHypotheses: string[];
  actionItems: string[];
}

/**
 * Thesis alignment assessment for an expert call
 */
export interface ThesisAlignment {
  /** Overall assessment: does this call support or contradict the investment thesis? */
  overall: 'supports' | 'contradicts' | 'mixed' | 'neutral';
  /** Score from -1 (strongly contradicts) to +1 (strongly supports) */
  score: number;
  /** Brief explanation of the assessment */
  reasoning: string;
  /** Points from this call that support the investment thesis */
  supportingPoints: string[];
  /** Points from this call that challenge or contradict the thesis */
  challengingPoints: string[];
}

export interface ExpertCallResults {
  analysis: {
    id: string;
    callId: string;
    duration: number;
    speakers: ExpertProfile[];
    insights: TranscriptInsight[];
    keyQuotes: Array<{
      id: string;
      text: string;
      speaker: string;
      timestamp: number;
      context: string;
      significance: string;
    }>;
    topics: Array<{
      name: string;
      timeSpent: number;
      sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
      keyPoints: string[];
    }>;
    summary: string;
    contradictions?: Array<{
      statement1: string;
      statement2: string;
      speaker1: string;
      speaker2: string;
      severity: number;
    }>;
  };
  expertProfiles: ExpertProfile[];
  keyInsights: EnhancedInsight[];
  consensusPoints: string[];
  divergencePoints: string[];
  followUpQuestions: string[];
  synthesizedSummary: string;
  thesisAlignment?: ThesisAlignment;
}

export interface ExpertCallStats {
  totalCount: number;
  byStatus: Record<ExpertCallStatus, number>;
  avgDurationMs: number | null;
  lastCallAt: string | null;
}

export interface ProcessTranscriptRequest {
  transcript: string;
  callDate?: string;
  speakerLabels?: Record<string, string>;
  focusAreas?: string[];
}

// =============================================================================
// Metrics Types
// =============================================================================

export type MetricType =
  | 'evidence_credibility_avg'
  | 'source_diversity_score'
  | 'hypothesis_coverage'
  | 'contradiction_resolution_rate'
  | 'overall_confidence'
  | 'stress_test_vulnerability'
  | 'research_completeness';

export interface ResearchMetrics {
  evidenceCredibilityAvg: number;
  sourceDiversityScore: number;
  hypothesisCoverage: number;
  contradictionResolutionRate: number;
  overallConfidence: number;
  stressTestVulnerability: number;
  researchCompleteness: number;
  calculatedAt: string;
}

export interface MetricHistory {
  metricType: MetricType;
  values: Array<{
    value: number;
    recordedAt: string;
  }>;
}

// =============================================================================
// Skills Types
// =============================================================================

export type SkillCategory =
  | 'market_sizing'
  | 'competitive'
  | 'financial'
  | 'risk'
  | 'operational'
  | 'regulatory'
  | 'customer'
  | 'technology'
  | 'general';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  successRate: number;
  usageCount: number;
  parameters: SkillParameter[];
  implementation?: string;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface SkillExecutionRequest {
  parameters: Record<string, unknown>;
  context?: {
    engagementId?: string;
    hypothesisId?: string;
  };
}

export interface SkillExecutionResult {
  success: boolean;
  output: unknown;
  executionTime: number;
  tokensUsed?: number;
}
