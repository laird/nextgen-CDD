-- Research jobs tracking
CREATE TABLE IF NOT EXISTS research_jobs (
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

-- Evidence items from research
CREATE TABLE IF NOT EXISTS evidence_items (
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

-- Hypotheses generated during research
CREATE TABLE IF NOT EXISTS hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  testable BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL CHECK (priority >= 1 AND priority <= 5),
  validation_status VARCHAR(20) NOT NULL CHECK (validation_status IN ('pending', 'validated', 'rejected', 'inconclusive')),
  evidence_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hypotheses_job ON hypotheses(job_id);
CREATE INDEX idx_hypotheses_priority ON hypotheses(priority DESC);

-- Update trigger for research_jobs
CREATE OR REPLACE FUNCTION update_research_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER research_jobs_updated_at
  BEFORE UPDATE ON research_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_research_jobs_updated_at();
