-- thesis-validator/src/db/migrations/004_engagements_add_columns.sql
-- Add missing columns to engagements table for repository compatibility

DO $$
BEGIN
  -- Add target JSONB column if missing (stores structured target company data)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'engagements' AND column_name = 'target') THEN
    ALTER TABLE engagements ADD COLUMN target JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add deal_type column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'engagements' AND column_name = 'deal_type') THEN
    ALTER TABLE engagements ADD COLUMN deal_type VARCHAR(50) DEFAULT 'acquisition';
  END IF;
END $$;

-- Add index on deal_type for filtering
CREATE INDEX IF NOT EXISTS idx_engagements_deal_type ON engagements(deal_type);
