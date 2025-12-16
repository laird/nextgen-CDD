-- =============================================================================
-- Thesis Validator - Complete PostgreSQL Schema
-- =============================================================================
-- Run this script to create a fresh database schema.
-- WARNING: This will DROP all existing tables!
--
-- Usage:
--   psql $DATABASE_URL -f scripts/create-schema.sql
-- =============================================================================

-- Drop existing tables (in reverse dependency order)
DROP TABLE IF EXISTS research_metrics CASCADE;
DROP TABLE IF EXISTS stress_tests CASCADE;
DROP TABLE IF EXISTS contradictions CASCADE;
DROP TABLE IF EXISTS evidence_hypotheses CASCADE;
DROP TABLE IF EXISTS evidence_items CASCADE;
DROP TABLE IF EXISTS evidence CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS hypothesis_edges CASCADE;
DROP TABLE IF EXISTS hypotheses CASCADE;
DROP TABLE IF EXISTS research_jobs CASCADE;
DROP TABLE IF EXISTS engagements CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;

-- =============================================================================
-- ENGAGEMENTS - Core deal tracking
-- =============================================================================
CREATE TABLE engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_company VARCHAR(255) NOT NULL,
  target JSONB NOT NULL DEFAULT '{}'::jsonb,
  deal_type VARCHAR(50) NOT NULL DEFAULT 'acquisition',
  sector VARCHAR(50) NOT NULL DEFAULT 'other',
  description TEXT,
  deal_size NUMERIC(12,2),
  lead_partner VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'in_review', 'completed', 'archived')),
  thesis JSONB,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_engagements_status ON engagements(status);
CREATE INDEX idx_engagements_sector ON engagements(sector);
CREATE INDEX idx_engagements_deal_type ON engagements(deal_type);
CREATE INDEX idx_engagements_created ON engagements(created_at DESC);

-- =============================================================================
-- RESEARCH JOBS (must come before hypotheses due to FK)
-- =============================================================================
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'partial')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_research_jobs_engagement ON research_jobs(engagement_id);
CREATE INDEX idx_research_jobs_status ON research_jobs(status);
CREATE INDEX idx_research_jobs_created ON research_jobs(created_at DESC);

-- =============================================================================
-- HYPOTHESES - Investment thesis hierarchy
-- =============================================================================
CREATE TABLE hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES hypotheses(id) ON DELETE SET NULL,
  type VARCHAR(20) CHECK (type IN ('thesis', 'sub_thesis', 'assumption', 'evidence')),
  content TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  status VARCHAR(20) DEFAULT 'untested'
    CHECK (status IN ('untested', 'supported', 'challenged', 'refuted', 'pending', 'validated', 'rejected', 'inconclusive')),
  importance VARCHAR(20) CHECK (importance IN ('critical', 'high', 'medium', 'low')),
  testability VARCHAR(20) CHECK (testability IN ('easy', 'moderate', 'difficult')),
  metadata JSONB DEFAULT '{}',
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Legacy columns for research-worker compatibility
  job_id UUID REFERENCES research_jobs(id) ON DELETE CASCADE,
  statement TEXT,
  priority INT CHECK (priority >= 1 AND priority <= 5),
  validation_status VARCHAR(20) CHECK (validation_status IN ('pending', 'validated', 'rejected', 'inconclusive'))
);

CREATE INDEX idx_hypotheses_engagement ON hypotheses(engagement_id);
CREATE INDEX idx_hypotheses_parent ON hypotheses(parent_id);
CREATE INDEX idx_hypotheses_status ON hypotheses(status);
CREATE INDEX idx_hypotheses_type ON hypotheses(type);
CREATE INDEX idx_hypotheses_job ON hypotheses(job_id);

-- Causal edges between hypotheses
CREATE TABLE hypothesis_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  relationship VARCHAR(20) NOT NULL
    CHECK (relationship IN ('requires', 'supports', 'contradicts', 'implies')),
  strength DECIMAL(3,2) DEFAULT 0.50 CHECK (strength >= 0 AND strength <= 1),
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, relationship)
);

CREATE INDEX idx_edges_source ON hypothesis_edges(source_id);
CREATE INDEX idx_edges_target ON hypothesis_edges(target_id);

-- =============================================================================
-- DOCUMENTS & EVIDENCE - Source materials
-- =============================================================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  format VARCHAR(20) NOT NULL
    CHECK (format IN ('pdf', 'docx', 'xlsx', 'pptx', 'html', 'image', 'unknown')),
  mime_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  uploaded_by VARCHAR(100),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_engagement ON documents(engagement_id);
CREATE INDEX idx_documents_status ON documents(status);

CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_type VARCHAR(20) NOT NULL
    CHECK (source_type IN ('web', 'document', 'expert', 'data', 'filing', 'financial')),
  source_url TEXT,
  source_title TEXT,
  source_author TEXT,
  source_publication_date DATE,
  credibility DECIMAL(3,2) CHECK (credibility >= 0 AND credibility <= 1),
  sentiment VARCHAR(20) NOT NULL DEFAULT 'neutral'
    CHECK (sentiment IN ('supporting', 'neutral', 'contradicting')),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  provenance JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  retrieved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evidence_engagement ON evidence(engagement_id);
CREATE INDEX idx_evidence_source_type ON evidence(source_type);
CREATE INDEX idx_evidence_sentiment ON evidence(sentiment);
CREATE INDEX idx_evidence_credibility ON evidence(credibility);
CREATE INDEX idx_evidence_document ON evidence(document_id);

-- Evidence-to-hypothesis junction
CREATE TABLE evidence_hypotheses (
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  hypothesis_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  relevance_score DECIMAL(3,2) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (evidence_id, hypothesis_id)
);

CREATE INDEX idx_ev_hyp_hypothesis ON evidence_hypotheses(hypothesis_id);

-- =============================================================================
-- EVIDENCE_ITEMS - Legacy table for research-worker compatibility
-- =============================================================================
CREATE TABLE evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('supporting', 'contradicting', 'neutral')),
  hypothesis TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  source_type VARCHAR(50),
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_items_engagement ON evidence_items(engagement_id);
CREATE INDEX idx_evidence_items_job ON evidence_items(job_id);
CREATE INDEX idx_evidence_items_type ON evidence_items(type);

-- =============================================================================
-- CONTRADICTIONS & STRESS TESTS
-- =============================================================================
CREATE TABLE contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  hypothesis_id UUID REFERENCES hypotheses(id) ON DELETE SET NULL,
  evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status VARCHAR(20) NOT NULL DEFAULT 'unresolved'
    CHECK (status IN ('unresolved', 'explained', 'dismissed', 'critical')),
  bear_case_theme TEXT,
  resolution_notes TEXT,
  resolved_by VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  found_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_contradictions_engagement ON contradictions(engagement_id);
CREATE INDEX idx_contradictions_hypothesis ON contradictions(hypothesis_id);
CREATE INDEX idx_contradictions_evidence ON contradictions(evidence_id);
CREATE INDEX idx_contradictions_severity ON contradictions(severity);
CREATE INDEX idx_contradictions_status ON contradictions(status);

CREATE TABLE stress_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  intensity VARCHAR(20) NOT NULL DEFAULT 'moderate'
    CHECK (intensity IN ('light', 'moderate', 'aggressive')),
  hypothesis_ids UUID[] DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  results JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stress_tests_engagement ON stress_tests(engagement_id);
CREATE INDEX idx_stress_tests_status ON stress_tests(status);

CREATE TABLE research_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  value DECIMAL(10,4) NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_engagement ON research_metrics(engagement_id);
CREATE INDEX idx_metrics_type ON research_metrics(metric_type);
CREATE INDEX idx_metrics_recorded ON research_metrics(recorded_at);

-- =============================================================================
-- TRIGGERS - Auto-update timestamps
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER engagements_updated_at
  BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER hypotheses_updated_at
  BEFORE UPDATE ON hypotheses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER research_jobs_updated_at
  BEFORE UPDATE ON research_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-set resolved_at on contradictions
CREATE OR REPLACE FUNCTION update_contradiction_resolved_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('explained', 'dismissed') AND OLD.status = 'unresolved' THEN
    NEW.resolved_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contradictions_resolved_at
  BEFORE UPDATE ON contradictions
  FOR EACH ROW EXECUTE FUNCTION update_contradiction_resolved_at();

-- =============================================================================
-- SCHEMA VERSION TRACKING
-- =============================================================================
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mark this schema as version 1.1 (with legacy compatibility)
INSERT INTO schema_migrations (filename) VALUES ('002_complete_schema_v1.1_legacy_compat.sql');

-- =============================================================================
-- Done!
-- =============================================================================
