# Inferred PostgreSQL Schema

This document shows the schema inferred from the backend repository code.

## Tables

### engagements
Source: `src/repositories/engagement-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| target_company | VARCHAR(255) | NO | | Company name |
| target | JSONB | NO | '{}' | Structured target data |
| deal_type | VARCHAR(50) | NO | 'acquisition' | |
| sector | VARCHAR(50) | NO | 'other' | |
| description | TEXT | YES | | |
| deal_size | NUMERIC(12,2) | YES | | |
| lead_partner | VARCHAR(255) | YES | | |
| status | VARCHAR(50) | NO | 'active' | draft/active/in_review/completed/archived |
| thesis | JSONB | YES | | Investment thesis |
| config | JSONB | NO | '{}' | |
| created_by | VARCHAR(255) | YES | | |
| created_at | TIMESTAMPTZ | NO | NOW() | |
| updated_at | TIMESTAMPTZ | NO | NOW() | Auto-updated |

### hypotheses
Source: `src/repositories/hypothesis-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| engagement_id | UUID | NO | | FK -> engagements |
| parent_id | UUID | YES | | FK -> hypotheses (self-ref) |
| type | VARCHAR(20) | NO | | thesis/sub_thesis/assumption/evidence |
| content | TEXT | NO | | |
| confidence | DECIMAL(3,2) | NO | 0.50 | 0-1 |
| status | VARCHAR(20) | NO | 'untested' | untested/supported/challenged/refuted |
| importance | VARCHAR(20) | YES | | critical/high/medium/low |
| testability | VARCHAR(20) | YES | | easy/moderate/difficult |
| metadata | JSONB | NO | '{}' | |
| created_by | VARCHAR(100) | YES | | |
| created_at | TIMESTAMPTZ | NO | NOW() | |
| updated_at | TIMESTAMPTZ | NO | NOW() | Auto-updated |

### hypothesis_edges
Source: `src/repositories/hypothesis-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| source_id | UUID | NO | | FK -> hypotheses |
| target_id | UUID | NO | | FK -> hypotheses |
| relationship | VARCHAR(20) | NO | | requires/supports/contradicts/implies |
| strength | DECIMAL(3,2) | NO | 0.50 | 0-1 |
| reasoning | TEXT | YES | | |
| created_at | TIMESTAMPTZ | NO | NOW() | |

**Unique constraint:** (source_id, target_id, relationship)

### documents
Source: `src/repositories/document-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| engagement_id | UUID | NO | | FK -> engagements |
| filename | TEXT | NO | | |
| original_filename | TEXT | NO | | |
| format | VARCHAR(20) | NO | | pdf/docx/xlsx/pptx/html/image/unknown |
| mime_type | TEXT | YES | | |
| size_bytes | INTEGER | YES | | |
| storage_path | TEXT | YES | | |
| status | VARCHAR(20) | NO | 'pending' | pending/processing/completed/failed |
| chunk_count | INTEGER | NO | 0 | |
| error_message | TEXT | YES | | |
| metadata | JSONB | NO | '{}' | |
| uploaded_by | VARCHAR(100) | YES | | |
| uploaded_at | TIMESTAMPTZ | NO | NOW() | |
| processed_at | TIMESTAMPTZ | YES | | |

### evidence
Source: `src/repositories/evidence-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| engagement_id | UUID | NO | | FK -> engagements |
| content | TEXT | NO | | |
| source_type | VARCHAR(20) | NO | | web/document/expert/data/filing/financial |
| source_url | TEXT | YES | | |
| source_title | TEXT | YES | | |
| source_author | TEXT | YES | | |
| source_publication_date | DATE | YES | | |
| credibility | DECIMAL(3,2) | YES | 0.5 | 0-1 |
| sentiment | VARCHAR(20) | NO | 'neutral' | supporting/neutral/contradicting |
| document_id | UUID | YES | | FK -> documents |
| provenance | JSONB | NO | '{}' | |
| metadata | JSONB | NO | '{}' | |
| retrieved_at | TIMESTAMPTZ | YES | | |
| created_at | TIMESTAMPTZ | NO | NOW() | |

### evidence_hypotheses
Source: `src/repositories/evidence-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| evidence_id | UUID | NO | | PK, FK -> evidence |
| hypothesis_id | UUID | NO | | PK, FK -> hypotheses |
| relevance_score | DECIMAL(3,2) | YES | 0.5 | 0-1 |
| created_at | TIMESTAMPTZ | NO | NOW() | |

### contradictions
Source: `src/repositories/contradiction-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| engagement_id | UUID | NO | | FK -> engagements |
| hypothesis_id | UUID | YES | | FK -> hypotheses |
| evidence_id | UUID | YES | | FK -> evidence |
| description | TEXT | NO | | |
| severity | VARCHAR(10) | NO | | low/medium/high |
| status | VARCHAR(20) | NO | 'unresolved' | unresolved/explained/dismissed/critical |
| bear_case_theme | TEXT | YES | | |
| resolution_notes | TEXT | YES | | |
| resolved_by | VARCHAR(255) | YES | | |
| metadata | JSONB | NO | '{}' | |
| found_at | TIMESTAMPTZ | NO | NOW() | |
| resolved_at | TIMESTAMPTZ | YES | | Auto-set on resolution |

### stress_tests
Source: `src/repositories/stress-test-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| engagement_id | UUID | NO | | FK -> engagements |
| intensity | VARCHAR(20) | NO | 'moderate' | light/moderate/aggressive |
| hypothesis_ids | UUID[] | NO | '{}' | Array of hypothesis IDs |
| status | VARCHAR(20) | NO | 'pending' | pending/running/completed/failed |
| results | JSONB | YES | | |
| error_message | TEXT | YES | | |
| started_at | TIMESTAMPTZ | YES | | |
| completed_at | TIMESTAMPTZ | YES | | |
| created_at | TIMESTAMPTZ | NO | NOW() | |

### research_metrics
Source: `src/repositories/metrics-repository.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| engagement_id | UUID | NO | | FK -> engagements |
| metric_type | VARCHAR(50) | NO | | See MetricType enum |
| value | DECIMAL(10,4) | NO | | |
| metadata | JSONB | NO | '{}' | |
| recorded_at | TIMESTAMPTZ | NO | NOW() | |

### research_jobs
Source: `src/api/routes/research-bullmq.ts`, `src/workers/research-worker.ts`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| engagement_id | UUID | NO | | FK -> engagements |
| status | VARCHAR(20) | NO | | queued/running/completed/failed/partial |
| started_at | TIMESTAMPTZ | YES | | |
| completed_at | TIMESTAMPTZ | YES | | |
| error_message | TEXT | YES | | |
| config | JSONB | NO | '{}' | |
| results | JSONB | YES | | |
| confidence_score | FLOAT | YES | | 0-100 |
| created_at | TIMESTAMPTZ | NO | NOW() | |
| updated_at | TIMESTAMPTZ | NO | NOW() | Auto-updated |

---

## Legacy Tables (research-worker.ts)

These tables are used by the research worker but conflict with the repository schema:

### evidence_items (LEGACY)
Used by research-worker only, different from `evidence` table.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| engagement_id | UUID | FK -> engagements |
| job_id | UUID | FK -> research_jobs |
| type | VARCHAR(20) | supporting/contradicting/neutral |
| hypothesis | TEXT | |
| content | TEXT | |
| confidence | FLOAT | 0-1 |
| created_at | TIMESTAMPTZ | |

### hypotheses (LEGACY columns)
The research-worker expects additional columns not in the repository schema:

| Column | Type | Notes |
|--------|------|-------|
| job_id | UUID | FK -> research_jobs (NOT in repository) |
| statement | TEXT | (repository uses `content`) |
| priority | INT | 1-5 (repository uses `importance`) |
| validation_status | VARCHAR(20) | (repository uses `status`) |

---

## Schema Conflicts

1. **hypotheses table**: Repository and research-worker expect different columns
2. **evidence vs evidence_items**: Two different tables for similar purpose

**Recommendation**: Either update the research-worker to use the repository schema, or add compatibility columns.
