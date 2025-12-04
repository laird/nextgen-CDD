# Research Workflow Design

**Date:** 2025-12-04
**Status:** Validated
**Scope:** Core research workflow implementation for Thesis Validator

## Overview

This design covers the implementation of the core research workflow - the system's primary value proposition. Users can submit investment theses, and the multi-agent system validates them through adaptive depth analysis.

## Architecture

### Three-Layer System

**API Layer** - REST and WebSocket endpoints:
- `POST /engagements/:id/research/start` - Creates research job, returns job ID
- `GET /engagements/:id/research/jobs/:jobId` - Poll job status and results
- WebSocket `/research/:jobId/stream` - Optional real-time progress updates

**Job Processing Layer** - BullMQ workers execute research:
- **ResearchWorker** - Main worker that processes research jobs from queue
- **ConductorAgent** - Orchestrates other agents, decides workflow depth
- **Specialized Agents** - Hypothesis builder, evidence gatherer, contradiction hunter, comparables finder, expert synthesizer

**Storage Layer** - Hybrid persistence:
- **PostgreSQL** - Job metadata, research summaries, structured results
- **Vector Memory** - Embeddings of hypotheses/evidence for cross-deal learning
- **Redis** - BullMQ job queue state, real-time progress events (pub/sub)

### Interaction Model: Hybrid Async

Users submit research requests and receive a job ID immediately. They can:
- **Poll** - Check status via REST API at their convenience
- **Stream** - Connect via WebSocket to watch real-time progress
- **Disconnect safely** - Results persist whether connected or not

This gives flexibility for both "fire and forget" and "interactive monitoring" use cases.

## Workflow Execution

### Job Lifecycle

**1. Submission**
- User submits thesis via `POST /engagements/:id/research/start`
- Engagement record updated with thesis statement
- Research job created in BullMQ queue with priority
- Job ID returned to client immediately (HTTP 201)

**2. Processing**
- ResearchWorker picks up job from queue
- Initializes ConductorAgent with engagement context
- Conductor executes adaptive workflow (see below)
- Progress events published to Redis pub/sub channel
- Job status continuously updated in PostgreSQL

**3. Completion**
- Research summary saved to engagement record
- Individual findings stored as evidence items
- Vector embeddings created for hypotheses and evidence
- Job marked complete, WebSocket clients notified
- Results available via GET endpoint

### Conductor's Adaptive Workflow

The conductor uses intelligent depth control to balance speed and thoroughness:

**Phase 1: Core Analysis (Always Runs)**
1. **HypothesisBuilder** - Breaks thesis into 3-7 testable hypotheses
2. **EvidenceGatherer** - Searches web for supporting/contradicting evidence
3. **ContradictionHunter** - Analyzes conflicts in findings

**Phase 2: Deep Dive (Conditional)**

Triggered if:
- Significant contradictions found (>30% evidence conflicts)
- Low confidence in Phase 1 results (<70%)
- Critical gaps in evidence coverage

Additional agents invoked:
4. **ComparablesFinder** - Finds similar past deals from vector memory
5. **ExpertSynthesizer** - Synthesizes expert opinions from authoritative sources

**Phase 3: Final Synthesis (Always Runs)**
- Conductor generates comprehensive summary
- Assigns confidence score (0-100)
- If confidence < 70%, recommends specific areas for human review
- Produces actionable verdict (proceed/review/reject)

### Progress Events

Emitted to Redis pub/sub and forwarded to WebSocket clients:
- `hypothesis_generated` - Each hypothesis as it's created
- `evidence_found` - Each evidence item discovered
- `contradiction_detected` - When conflicts identified
- `round_complete` - Phase 1 or 2 finishes
- `job_complete` - Final results ready

## Data Models

### PostgreSQL Tables

```sql
-- Research jobs tracking
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'partial')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  config JSONB NOT NULL,           -- Research parameters/settings
  results JSONB,                   -- Final summary and verdict
  confidence_score FLOAT,          -- 0-100
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_research_jobs_engagement ON research_jobs(engagement_id);
CREATE INDEX idx_research_jobs_status ON research_jobs(status);

-- Evidence items from research
CREATE TABLE evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  job_id UUID NOT NULL REFERENCES research_jobs(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('supporting', 'contradicting', 'neutral')),
  hypothesis TEXT NOT NULL,        -- Which hypothesis this addresses
  content TEXT NOT NULL,           -- The evidence itself
  source_url TEXT,                 -- Where it came from
  source_type VARCHAR(50),         -- web, expert, comparable, etc.
  confidence FLOAT NOT NULL,       -- Agent's confidence 0-1
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_items_engagement ON evidence_items(engagement_id);
CREATE INDEX idx_evidence_items_job ON evidence_items(job_id);
CREATE INDEX idx_evidence_items_type ON evidence_items(type);

-- Hypotheses generated during research
CREATE TABLE hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES research_jobs(id),
  statement TEXT NOT NULL,
  testable BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL,           -- 1-5, higher = more critical
  validation_status VARCHAR(20) NOT NULL CHECK (validation_status IN ('pending', 'validated', 'rejected', 'inconclusive')),
  evidence_summary TEXT,           -- Summary of findings for this hypothesis
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hypotheses_job ON hypotheses(job_id);
```

### Vector Memory Storage

**DealMemory Integration:**
- Each hypothesis → embedded and stored with metadata (job_id, engagement_id, priority)
- Each evidence item → embedded with metadata (type, confidence, source_type)
- Enables semantic search: "Find similar hypotheses from past SaaS deals"
- Comparables finder uses cosine similarity to find relevant past evidence

**Memory Structure:**
```typescript
{
  type: 'hypothesis' | 'evidence',
  engagementId: string,
  jobId: string,
  content: string,              // What gets embedded
  metadata: {
    sector: string,
    dealType: string,
    confidence?: number,
    validationStatus?: string
  }
}
```

### Redis Structures

**BullMQ Queues:**
- Queue name: `research:jobs`
- Priority support: High priority for urgent deals
- Concurrency: 3 workers processing simultaneously

**Pub/Sub Channels:**
- Channel pattern: `research:progress:{jobId}`
- Published events: JSON-formatted progress updates
- TTL: Messages expire after delivery (ephemeral)

**Cache:**
- Key pattern: `research:status:{jobId}`
- Value: Current job status snapshot (for quick polling)
- TTL: 30 days

### WebSocket Event Format

```typescript
interface ProgressEvent {
  type: 'hypothesis_generated' | 'evidence_found' | 'contradiction_detected' |
        'round_complete' | 'job_complete';
  jobId: string;
  timestamp: number;
  data: {
    // Event-specific payload
    hypothesis?: { statement: string; priority: number };
    evidence?: { type: string; content: string; confidence: number };
    round?: { phase: number; duration: number };
    results?: ResearchSummary;
  };
}
```

## Error Handling & Recovery

### Agent-Level Error Handling

Each agent execution wrapped with resilience:
- **Timeout**: 2 minutes per agent call
- **Retries**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Fallback**: On failure, conductor logs error and continues with partial results
- **Circuit breaker**: After 3 consecutive failures, mark agent as degraded and skip

### Job-Level Resilience

BullMQ configuration:
```typescript
{
  attempts: 3,                    // Retry failed jobs up to 3 times
  backoff: {
    type: 'exponential',
    delay: 60000                  // Start at 1 min, doubles each retry
  },
  timeout: 1800000                // 30 min absolute max per job
}
```

### Failure Scenarios & Handling

| Scenario | Response |
|----------|----------|
| LLM API failure | Agent retries with backoff, falls back to simpler prompt if needed |
| External tool failure (web search) | Skip that evidence source, continue with available sources |
| Job timeout | Save partial results, mark status as `partial`, include progress note |
| Database connection error | Job stays in queue, retries when DB connection restored |
| Worker process crash | BullMQ automatically re-queues in-progress jobs |

### User-Facing Error Communication

Jobs have clear status progression:
- `queued` - Waiting to be processed
- `running` - Currently executing
- `completed` - Successfully finished
- `failed` - Unrecoverable error occurred
- `partial` - Completed with some failures (still has useful results)

The `error_message` field contains user-friendly explanations:
- "Evidence gathering timed out, but hypotheses were generated successfully"
- "External search API unavailable, results based on cached data"

Partial results are always viewable - even if job didn't complete fully, users can see what was discovered.

## Implementation Components

### New Files

**Workers:**
- `src/workers/research-worker.ts` - BullMQ worker that processes research jobs
  - Connects to queue, listens for jobs
  - Executes workflow, publishes progress
  - Handles errors and retries

**Services:**
- `src/services/job-queue.ts` - BullMQ queue initialization and utilities
  - Queue creation and configuration
  - Job submission helpers
  - Status tracking methods

**Workflows:**
- `src/workflows/research-workflow.ts` - Main research orchestration
  - Conductor adaptive logic
  - Agent coordination
  - Result aggregation

**API:**
- `src/api/routes/research.ts` - REST endpoints
  - POST /engagements/:id/research/start
  - GET /engagements/:id/research/jobs/:jobId
  - GET /engagements/:id/research/jobs

- `src/api/websocket/research-stream.ts` - WebSocket handler
  - Connection management
  - Redis pub/sub subscription
  - Event forwarding to clients

**Database:**
- `migrations/003_research_tables.sql` - Schema for research tables
  - research_jobs table
  - evidence_items table
  - hypotheses table
  - Indexes for performance

### Files to Modify

**Agents:**
- `src/agents/conductor.ts` - Add adaptive workflow decision logic
  - Phase 1 → evaluate → conditionally trigger Phase 2
  - Confidence scoring
  - Final synthesis

- `src/agents/hypothesis-builder.ts` - Ensure structured output
  - Return list of hypothesis objects
  - Include priority and testability flags

- `src/agents/evidence-gatherer.ts` - Add web search integration
  - Use Tavily API for web search
  - Parse and structure results
  - Classify as supporting/contradicting/neutral

**Memory:**
- `src/memory/deal-memory.ts` - Add evidence storage methods
  - storeHypothesis(hypothesis, metadata)
  - storeEvidence(evidence, metadata)
  - findSimilarEvidence(query, filters)

### Testing Strategy

**Unit Tests:**
- Each agent tested in isolation
- Mock LLM responses for deterministic testing
- Verify error handling and retries

**Integration Tests:**
- End-to-end research workflow with test engagement
- Real Redis and PostgreSQL (test database)
- Verify job lifecycle and data persistence

**Load Tests:**
- 10 concurrent research jobs
- Verify queue handles load without degradation
- Check for memory leaks

**Manual Validation:**
- Run with real investment thesis
- Human evaluation of result quality
- Verify evidence relevance and accuracy

### Development Sequence

**Phase 1: Foundation** (Days 1-2)
1. Database migrations - Create tables and indexes
2. Job queue setup - Initialize BullMQ, test basic job processing
3. Research worker skeleton - Worker that accepts jobs, logs, completes

**Phase 2: Core Workflow** (Days 3-5)
4. Implement conductor adaptive workflow logic
5. Wire up HypothesisBuilder and EvidenceGatherer
6. Add ContradictionHunter analysis
7. Test Phase 1 flow end-to-end

**Phase 3: API & Streaming** (Days 6-7)
8. Add REST endpoints for job submission and polling
9. Implement WebSocket streaming with Redis pub/sub
10. Test real-time updates

**Phase 4: Advanced Features** (Days 8-9)
11. Vector memory integration for evidence storage
12. Implement ComparablesFinder using similarity search
13. Add ExpertSynthesizer for Phase 2

**Phase 5: Polish** (Day 10)
14. Comprehensive testing and bug fixes
15. Error handling refinement
16. Documentation and examples

## Success Criteria

The research workflow is successful when:

1. **Functionality**: User can submit thesis, receive job ID, and get validated results
2. **Quality**: Results are relevant, evidence-backed, and useful for decision-making
3. **Reliability**: 95%+ jobs complete successfully, failures have clear error messages
4. **Performance**: Most jobs complete in 15-20 minutes, Phase 2 adds 10-15 minutes if triggered
5. **Scalability**: System handles 10 concurrent research jobs without degradation
6. **Observability**: Users can monitor progress via WebSocket or check status via REST

## Open Questions / Future Enhancements

**Not in MVP, consider for future:**
- User feedback loop - Let users rate evidence quality to improve future searches
- Cost tracking - Log LLM API costs per research job
- Historical analysis - "How has our confidence in SaaS deals changed over time?"
- Collaborative research - Multiple users reviewing/annotating the same research job
- Export formats - PDF report generation, Notion integration
