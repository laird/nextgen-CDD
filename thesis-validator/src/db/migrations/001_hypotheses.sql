-- thesis-validator/src/db/migrations/001_hypotheses.sql
-- Hypothesis Management Tables

-- Hypotheses table
CREATE TABLE IF NOT EXISTS hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL,
  parent_id UUID REFERENCES hypotheses(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('thesis', 'sub_thesis', 'assumption', 'evidence')),
  content TEXT NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  status VARCHAR(20) NOT NULL DEFAULT 'untested'
    CHECK (status IN ('untested', 'supported', 'challenged', 'refuted')),
  importance VARCHAR(20) CHECK (importance IN ('critical', 'high', 'medium', 'low')),
  testability VARCHAR(20) CHECK (testability IN ('easy', 'moderate', 'difficult')),
  metadata JSONB DEFAULT '{}',
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_engagement ON hypotheses(engagement_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_parent ON hypotheses(parent_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);
CREATE INDEX IF NOT EXISTS idx_hypotheses_type ON hypotheses(type);

-- Causal edges between hypotheses
CREATE TABLE IF NOT EXISTS hypothesis_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  relationship VARCHAR(20) NOT NULL
    CHECK (relationship IN ('requires', 'supports', 'contradicts', 'implies')),
  strength DECIMAL(3,2) DEFAULT 0.50 CHECK (strength >= 0 AND strength <= 1),
  reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_id, target_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON hypothesis_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON hypothesis_edges(target_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for hypotheses
DROP TRIGGER IF EXISTS update_hypotheses_updated_at ON hypotheses;
CREATE TRIGGER update_hypotheses_updated_at
  BEFORE UPDATE ON hypotheses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
