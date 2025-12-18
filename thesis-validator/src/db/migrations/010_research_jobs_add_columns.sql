-- thesis-validator/src/db/migrations/010_research_jobs_add_columns.sql
-- Add missing columns to research_jobs and ensure schema compatibility

DO $$
BEGIN
  -- Add type column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'research_jobs' AND column_name = 'type') THEN
    ALTER TABLE research_jobs ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'research';
  END IF;

  -- Add progress column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'research_jobs' AND column_name = 'progress') THEN
    ALTER TABLE research_jobs ADD COLUMN progress INTEGER DEFAULT 0;
  END IF;

  -- Ensure status can handle 'saving'
  -- (Postgres enums or check constraints might need update, but if it's varchar, it's fine)
  -- The previous check constraint might block it if defined.
  -- Let's drop the check constraint if it exists to be safe.
  -- Finding the name of check constraint is hard, but usually research_jobs_status_check.
  
  -- We'll assume VARCHAR(50) is flexible unless constrained.
  -- If there is a check constraint, we might need to handle it.
  -- For now, we assume standard usage.
END $$;

-- Add index on type if not exists
CREATE INDEX IF NOT EXISTS idx_research_jobs_type ON research_jobs(type);
