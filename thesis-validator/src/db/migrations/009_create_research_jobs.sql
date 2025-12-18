-- thesis-validator/src/db/migrations/009_create_research_jobs.sql
-- Create research_jobs table for tracking async research workflows

CREATE TABLE IF NOT EXISTS research_jobs (
  id VARCHAR(255) PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'research',
  status VARCHAR(50) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'saving', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,
  results JSONB,
  confidence_score NUMERIC(5,2),
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_engagement ON research_jobs(engagement_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(status);
