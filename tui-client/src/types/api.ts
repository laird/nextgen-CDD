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
  status: 'pending' | 'research_active' | 'research_complete' | 'research_failed' | 'completed';
  thesis?: {
    statement: string;
    submitted_at: number;
  };
  created_at: number;
  updated_at: number;
  created_by: string;
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
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial';
  started_at?: number;
  completed_at?: number;
  error_message?: string;
  confidence_score?: number;
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

export interface ResearchResults {
  verdict: 'proceed' | 'review' | 'reject';
  summary: string;
  key_findings: string[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
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
  timestamp: number;
  data: Record<string, unknown>;
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
