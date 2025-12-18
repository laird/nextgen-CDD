# Architecture & Design Decisions

**Last Updated:** 2025-12-18

This document describes the key architectural decisions, design patterns, and technical choices in the Thesis Validator system. It's intended for developers who need to understand the "why" behind the implementation.

## Table of Contents

- [System Overview](#system-overview)
- [Core Design Patterns](#core-design-patterns)
- [Agent Architecture](#agent-architecture)
- [Memory System](#memory-system)
- [Background Processing](#background-processing)
- [Database Design](#database-design)
- [LLM Provider Abstraction](#llm-provider-abstraction)
- [Real-time Communication](#real-time-communication)
- [Error Handling](#error-handling)
- [Key Trade-offs](#key-trade-offs)

---

## System Overview

Thesis Validator is a multi-agent AI system for private equity commercial and technical due diligence. The system validates investment theses by:

1. Breaking theses into testable hypotheses
2. Gathering evidence from multiple sources (web, documents, expert calls)
3. Hunting for contradictions and risks
4. Finding comparable companies and deals
5. Synthesizing findings into actionable insights

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Clients                                      │
│        Dashboard UI (React)  │  TUI Client (Ink)  │  REST/WS APIs        │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                           API Layer (Fastify)                              │
│    REST Routes │ WebSocket Server │ JWT Auth │ Request Validation (Zod)   │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                         Background Workers (BullMQ)                        │
│    Research Worker (research-jobs)  │  Document Processor (documents)      │
│    - 10 min lock, 5 min renewal     │  - 2 concurrent workers              │
│    - Real-time progress via pub/sub │  - Chunking + embedding              │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                           Workflow Layer                                   │
│    Research Workflow │ Stress Test │ Expert Call │ Closeout               │
│    (Orchestrates multi-phase agent execution)                              │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                            Agent Layer                                     │
│    Conductor │ HypothesisBuilder │ EvidenceGatherer │ ContradictionHunter │
│    ComparablesFinder │ ExpertSynthesizer                                   │
│    (All extend BaseAgent, use callLLM/callLLMWithTools)                    │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                          Repository Layer                                  │
│    Engagement │ Hypothesis │ Evidence │ Contradiction │ Metrics │ Docs    │
│    (PostgreSQL access via pg, typed with Zod)                              │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                           Memory Layer                                     │
│    Deal Memory │ Institutional Memory │ Market Intelligence │ Reflexion   │
│    (Vector storage via Ruvector for semantic search)                       │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                          Infrastructure                                    │
│    PostgreSQL 16 │ Redis 7 (BullMQ) │ Ruvector │ Claude (Anthropic/Vertex) │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Core Design Patterns

### 1. Repository Pattern

**Decision:** Use repositories to abstract database access.

**Rationale:**
- Separates data access logic from business logic
- Makes testing easier (can mock repositories)
- Provides a consistent interface for all entities
- Enables future database changes without affecting higher layers

**Implementation:**
```typescript
// Each repository follows this pattern
class EngagementRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<Engagement | null> { ... }
  async findAll(filters: EngagementFilters): Promise<Engagement[]> { ... }
  async create(data: CreateEngagement): Promise<Engagement> { ... }
  async update(id: string, data: UpdateEngagement): Promise<Engagement> { ... }
  async delete(id: string): Promise<void> { ... }
}
```

### 2. Agent Pattern

**Decision:** All AI agents extend a common `BaseAgent` class.

**Rationale:**
- Consistent interface for all agents (`execute()` method)
- Shared utilities for LLM calls, logging, error handling
- Enables the Conductor agent to orchestrate multiple agents uniformly
- Simplifies adding new agents

**Implementation:**
```typescript
abstract class BaseAgent<TInput, TOutput> {
  abstract execute(input: TInput): Promise<AgentResult<TOutput>>;

  protected async callLLM(prompt: string): Promise<string> { ... }
  protected async callLLMWithTools(prompt: string, tools: Tool[]): Promise<ToolResult> { ... }
}
```

### 3. Workflow Pattern

**Decision:** Use multi-phase workflows to orchestrate complex operations.

**Rationale:**
- Research workflows can take 5-10+ minutes
- Need to track progress and allow for recovery
- Each phase has clear inputs/outputs
- Enables parallel and sequential agent execution

**Phases in Research Workflow:**
1. **Phase 1: Hypothesis Building** - Decompose thesis into testable hypotheses
2. **Phase 2: Comparables Search** - Find relevant historical deals
3. **Phase 3: Evidence Gathering** - Execute skills and search for evidence
4. **Phase 4: Contradiction Detection** - Hunt for disconfirming evidence

### 4. Zod Schema Validation

**Decision:** Use Zod for all data validation.

**Rationale:**
- Runtime validation for API inputs
- Type inference from schemas (single source of truth)
- Detailed error messages
- Composable schemas

**Example:**
```typescript
const CreateEngagementSchema = z.object({
  targetCompany: z.string().min(1),
  dealType: z.enum(['acquisition', 'investment', 'merger']),
  thesis: z.string().optional(),
});

type CreateEngagement = z.infer<typeof CreateEngagementSchema>;
```

---

## Agent Architecture

### Agent Hierarchy

```
BaseAgent (abstract)
├── ConductorAgent      - Orchestrates workflow execution
├── HypothesisBuilder   - Decomposes theses into testable hypotheses
├── EvidenceGatherer    - Collects evidence from various sources
├── ContradictionHunter - Finds disconfirming evidence
├── ComparablesFinder   - Identifies similar deals/companies
└── ExpertSynthesizer   - Processes expert call transcripts
```

### Agent Communication

Agents don't communicate directly. Instead:
1. The Conductor agent manages workflow state
2. Agents read from/write to repositories
3. Results are passed through workflow phases
4. Progress is broadcast via Redis pub/sub

### Design Decision: No Agent-to-Agent Messaging

**Rationale:**
- Simpler debugging and tracing
- Clear data flow through repositories
- Easier to resume after failures
- Workflows can be replayed from any point

---

## Memory System

### Three-Tier Memory Architecture

**Design Decision:** Separate memory into three tiers with different scopes and lifecycles.

| Tier | Scope | Lifecycle | Purpose |
|------|-------|-----------|---------|
| **Deal Memory** | Per-engagement | Engagement lifetime | Hypotheses, evidence, transcripts |
| **Institutional Memory** | Cross-deal | Permanent | Patterns, learnings, methodologies |
| **Market Intelligence** | Global | Temporal decay | News, trends, regulatory changes |

### Vector Storage (Ruvector)

**Decision:** Use Ruvector for semantic search over embeddings.

**Rationale:**
- Fast local vector similarity search
- No external service dependency
- HNSW algorithm for approximate nearest neighbors
- Supports filtering by metadata

**Configuration:**
- Dimensions: 1536 (OpenAI text-embedding-3-large)
- Metric: Cosine similarity
- HNSW M: 16, EF Construction: 200, EF Search: 100

### Reflexion Pattern

**Decision:** Implement agent self-improvement through reflexion.

**How it works:**
1. After workflow completion, agents review their performance
2. Successful patterns are stored in institutional memory
3. Failures generate "reflexion episodes" with lessons learned
4. Future workflows query for relevant reflexions

---

## Background Processing

### BullMQ for Job Queue

**Decision:** Use BullMQ for long-running background tasks.

**Rationale:**
- Persistent job storage in Redis
- Automatic retries with backoff
- Job progress tracking
- Lock management for long jobs

### Critical: Lock Management for Long Jobs

Research workflows can take 10+ minutes. Without proper lock management, Redis would reassign "stuck" jobs to other workers.

**Solution:**
```typescript
const LOCK_DURATION = 10 * 60 * 1000; // 10 minutes
const LOCK_RENEWAL_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Worker configuration
worker.on('active', (job) => {
  // Extend lock every 5 minutes while job is processing
  const interval = setInterval(() => {
    job.extendLock(token, LOCK_DURATION);
  }, LOCK_RENEWAL_INTERVAL);
});
```

### Cloud Run Considerations

**Critical Decision:** Set `min-instances=1` in Cloud Run.

**Why:**
- BullMQ workers run in-process with the API server
- If Cloud Run scales to zero, no workers process jobs
- Jobs would stay "queued" forever
- Small cost (~$15-30/month) is essential for functionality

### Real-time Progress Updates

**Pattern:** Redis pub/sub for progress streaming.

```typescript
// Worker publishes progress
await redis.publish(`research:${engagementId}:progress`, JSON.stringify({
  phase: 'hypothesis_building',
  step: 3,
  total: 5,
  message: 'Building hypothesis tree...'
}));

// WebSocket handler subscribes and forwards to clients
subscriber.subscribe(`research:${engagementId}:progress`);
subscriber.on('message', (channel, message) => {
  ws.send(message);
});
```

---

## Database Design

### PostgreSQL Schema Philosophy

**Decisions:**
- UUID primary keys for all tables
- Created/updated timestamps on all tables
- Soft delete via `deleted_at` column (where applicable)
- JSONB for flexible/evolving data structures
- Foreign keys with cascade delete where appropriate

### Key Tables

| Table | Purpose |
|-------|---------|
| `engagements` | Core deal tracking |
| `hypotheses` | Hypothesis tree structure |
| `evidence` | Evidence items with credibility scores |
| `contradictions` | Detected contradictions |
| `documents` | Uploaded document metadata |
| `research_jobs` | Async job tracking |
| `metrics_snapshots` | Research quality metrics over time |
| `stress_test_results` | Stress test scenarios and outcomes |

### JSONB Usage

**When to use JSONB:**
- Agent outputs (variable structure)
- Metadata that evolves
- Arrays of complex objects

**When to use columns:**
- Frequently queried fields
- Indexed fields
- Fields with fixed schemas

---

## LLM Provider Abstraction

### Multi-Provider Support

**Decision:** Abstract LLM calls to support multiple providers.

**Supported Providers:**
1. **Anthropic** (Direct API) - Production default
2. **Vertex AI** (Google Cloud) - For GCP deployments
3. **Ollama** (Local) - For development without API costs

### Implementation via Vercel AI SDK

```typescript
// Provider selection based on environment
function getLLMProvider(): LanguageModel {
  switch (config.llmProvider) {
    case 'anthropic':
      return createAnthropic({ apiKey: config.anthropicApiKey });
    case 'vertex-ai':
      return createVertexAI({ project: config.gcpProject });
    case 'ollama':
      return createOllama({ baseUrl: config.ollamaUrl });
  }
}
```

### Model Configuration

**Decision:** Allow model override per provider.

```bash
# Default model
LLM_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Override to use a different model
LLM_MODEL=claude-opus-4-20250514
```

---

## Real-time Communication

### WebSocket Architecture

**Decision:** WebSocket for real-time updates, REST for CRUD operations.

**WebSocket Events:**
- `research:progress` - Workflow phase updates
- `agent:status` - Agent start/complete/error
- `evidence:found` - New evidence discovered
- `hypothesis:updated` - Confidence score changes

### Why Not SSE (Server-Sent Events)?

**Trade-off decision:**
- WebSocket: Bidirectional, works better with Cloud Run
- SSE: Simpler, but Cloud Run timeout issues with long connections

Chose WebSocket for bidirectional capability (future: expert call real-time assistance).

---

## Error Handling

### AgentResult Pattern

**Decision:** All agents return `AgentResult` instead of throwing.

```typescript
interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: AgentError;
  metadata?: Record<string, unknown>;
}
```

**Rationale:**
- Explicit success/failure handling
- Rich error context
- Enables partial results
- Easier retry logic

### Retry Strategy

**LLM Calls:**
- Max 3 retries
- Exponential backoff (1s, 2s, 4s)
- Retry on rate limit, timeout, transient errors
- No retry on validation errors

**Background Jobs:**
- Max 3 attempts
- 1 minute between attempts
- Dead letter queue for failed jobs

---

## Key Trade-offs

### 1. In-Process Workers vs. Separate Worker Service

**Chose:** In-process workers

**Pros:**
- Simpler deployment (one service)
- Shared code/configuration
- Lower operational overhead

**Cons:**
- Can't scale workers independently
- Heavy jobs affect API responsiveness

**Mitigation:** Cloud Run scales horizontally; each instance runs both API and workers.

### 2. Ruvector (Local) vs. Managed Vector DB

**Chose:** Ruvector (local vector storage)

**Pros:**
- No external dependency
- Lower latency
- No additional cost
- Works offline

**Cons:**
- Data on local filesystem (Cloud Run uses /tmp)
- No built-in replication
- Less feature-rich than Pinecone/Weaviate

**Mitigation:** Store critical data in PostgreSQL; vector store is for similarity search only.

### 3. Monolithic Repository vs. Microservices

**Chose:** Monorepo with separate packages

**Pros:**
- Shared types and utilities
- Atomic cross-package changes
- Simpler development setup

**Cons:**
- Larger build artifacts
- All code in one repo

**Current Structure:**
- `thesis-validator/` - Backend (could be split later)
- `dashboard-ui/` - Frontend
- `tui-client/` - CLI

### 4. JWT Authentication vs. Session-based

**Chose:** JWT with optional disable for development

**Pros:**
- Stateless (easier scaling)
- Works well with SPAs
- Standard approach for APIs

**Cons:**
- Can't revoke tokens easily
- Token size overhead

**Mitigation:** Short token expiry (1 hour), refresh token pattern.

---

## Future Considerations

### Potential Improvements

1. **Separate Worker Service** - If scaling becomes an issue
2. **Managed Vector DB** - For multi-region deployment
3. **Event Sourcing** - For audit trail requirements
4. **GraphQL** - For complex client queries
5. **Agent Parallelization** - More concurrent evidence gathering

### Migration Paths

The current architecture supports incremental evolution:
- Repositories can be swapped for different databases
- Agents can be deployed as separate services
- Memory tiers can use external services
- Workers can be extracted to separate Cloud Run service

---

## References

- [docs/deployment.md](deployment.md) - GCP deployment guide
- [docs/local-deployment.md](local-deployment.md) - Local development setup
- [thesis-validator/docs/inferred-schema.md](../thesis-validator/docs/inferred-schema.md) - Database schema
- [docs/plans/](plans/) - Historical design documents and implementation plans
