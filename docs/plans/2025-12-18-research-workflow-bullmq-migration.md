# Research Workflow BullMQ Migration

## Overview

Migrate research workflow job tracking from in-memory storage to BullMQ + PostgreSQL persistence. This ensures research jobs survive server restarts and provides proper production-grade reliability.

## Problem

- Research jobs stored in in-memory `Map<string, ResearchJob>`
- Jobs lost when server restarts (deployment, crash, scaling)
- Workflows killed mid-execution on restart
- Frontend shows stale "Initializing" status after restart

## Solution

Replace in-memory job tracking with existing BullMQ infrastructure:
- Store job status in `research_jobs` PostgreSQL table
- Enqueue jobs to BullMQ queue (Redis-backed)
- Worker processes jobs and survives restarts
- Jobs automatically resume after server restart

## Architecture

```
Frontend → POST /research → Insert DB + Enqueue BullMQ → Return job_id
                                    ↓
                              Worker picks up job
                                    ↓
                              Execute workflow
                                    ↓
                              Publish progress → Redis → WebSocket → Frontend
                                    ↓
                              Update research_jobs table
```

## Implementation

### 1. New Repository: `src/repositories/research-job-repository.ts`

```typescript
export interface ResearchJobDTO {
  id: string;
  engagementId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial';
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
  results: Record<string, unknown> | null;
  confidenceScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ResearchJobRepository {
  async create(params): Promise<ResearchJobDTO>;
  async getById(id: string): Promise<ResearchJobDTO | null>;
  async getByEngagement(engagementId: string, options?): Promise<ResearchJobDTO[]>;
  async getActiveByEngagement(engagementId: string): Promise<ResearchJobDTO | null>;
  async updateStatus(id: string, status: string, extras?): Promise<void>;
  async markRunning(id: string): Promise<void>;
  async markCompleted(id: string, results: unknown, confidenceScore: number): Promise<void>;
  async markFailed(id: string, errorMessage: string): Promise<void>;
}
```

### 2. Modify API Route: `src/api/routes/research.ts`

**Remove:**
- In-memory `jobStore` Map
- `executeResearchWorkflowAsync` direct call

**Add:**
- Import `ResearchJobQueue` and `ResearchJobRepository`
- Check for existing active job (prevent duplicates)
- Create job record in PostgreSQL
- Enqueue to BullMQ
- Read job status from PostgreSQL (not in-memory)

### 3. Modify Server Entry: `src/index.ts`

**Add:**
- Import and instantiate `ResearchWorker`
- Start worker with `concurrency: 2`
- Graceful shutdown handling for worker

### 4. Optional Cleanup: `src/workers/research-worker.ts`

- Replace inline SQL with repository calls
- Consistent with rest of codebase

## Error Handling

| Scenario | Handling |
|----------|----------|
| Redis unavailable | Worker fails to start with clear error |
| Duplicate job submission | Return 409 with existing job ID |
| Worker crashes mid-job | BullMQ retries (3 attempts, exponential backoff) |
| Server restart during job | Job persists in queue, resumes on restart |

## Files Changed

| File | Change |
|------|--------|
| `src/repositories/research-job-repository.ts` | New |
| `src/repositories/index.ts` | Export new repository |
| `src/api/routes/research.ts` | Replace in-memory with repository + queue |
| `src/index.ts` | Start worker, graceful shutdown |
| `src/workers/research-worker.ts` | Use repository (optional) |

## What Stays the Same

- Frontend code (no changes)
- API response formats
- WebSocket progress endpoint
- BullMQ queue infrastructure
- Database schema

## Success Criteria

1. Research job survives server restart
2. Frontend shows correct status after restart
3. Progress updates continue after reconnect
4. No duplicate jobs for same engagement
5. Failed jobs retry automatically
