# Slice 1: Hypothesis Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete hypothesis lifecycle with PostgreSQL persistence, CRUD API, and interactive tree visualization.

**Architecture:** Hypotheses are stored in PostgreSQL for structured queries and CRUD operations, while embeddings remain in Ruvector for semantic search. The HypothesisBuilder agent writes to PostgreSQL via a repository layer. The frontend displays an interactive tree using reactflow.

**Tech Stack:** PostgreSQL (pg), Fastify, Zod, React, reactflow, TanStack Query

---

## Task 1: Create Database Migration for Hypotheses

**Files:**
- Create: `thesis-validator/src/db/migrations/001_hypotheses.sql`
- Modify: `thesis-validator/src/db/index.ts`

**Step 1: Write the migration SQL file**

```sql
-- thesis-validator/src/db/migrations/001_hypotheses.sql
-- Hypothesis Management Tables

-- Hypotheses table
CREATE TABLE IF NOT EXISTS hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL,
  parent_id UUID REFERENCES hypotheses(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('thesis', 'sub_thesis', 'assumption')),
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
```

**Step 2: Add migration runner to db/index.ts**

Modify `thesis-validator/src/db/index.ts` to add:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const migrationsDir = path.join(__dirname, 'migrations');

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Get already executed migrations
  const { rows: executed } = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  const executedSet = new Set(executed.map(r => r.filename));

  // Read and execute pending migrations
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!executedSet.has(file)) {
      console.log(`[DB] Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      console.log(`[DB] Completed migration: ${file}`);
    }
  }
}
```

**Step 3: Run migration to verify**

Run: `cd thesis-validator && npm run db:migrate` (or create this script)

Expected: Tables created successfully

**Step 4: Commit**

```bash
git add src/db/migrations/001_hypotheses.sql src/db/index.ts
git commit -m "feat(db): add hypothesis tables migration"
```

---

## Task 2: Create Hypothesis Repository

**Files:**
- Create: `thesis-validator/src/repositories/hypothesis-repository.ts`
- Create: `thesis-validator/src/repositories/index.ts`

**Step 1: Write the failing test**

Create `thesis-validator/tests/repositories/hypothesis-repository.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { HypothesisRepository } from '../../src/repositories/hypothesis-repository.js';
import { getPool, runMigrations, closePool } from '../../src/db/index.js';

describe('HypothesisRepository', () => {
  let repo: HypothesisRepository;
  const testEngagementId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    await runMigrations();
    repo = new HypothesisRepository();
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    // Clean up test data
    const pool = getPool();
    await pool.query('DELETE FROM hypotheses WHERE engagement_id = $1', [testEngagementId]);
  });

  describe('create', () => {
    it('should create a hypothesis and return it with id', async () => {
      const result = await repo.create({
        engagementId: testEngagementId,
        type: 'thesis',
        content: 'The company has strong market position',
        createdBy: 'test-agent',
      });

      expect(result.id).toBeDefined();
      expect(result.type).toBe('thesis');
      expect(result.content).toBe('The company has strong market position');
      expect(result.confidence).toBe(0.5);
      expect(result.status).toBe('untested');
    });
  });

  describe('getById', () => {
    it('should return null for non-existent hypothesis', async () => {
      const result = await repo.getById('00000000-0000-0000-0000-000000000999');
      expect(result).toBeNull();
    });

    it('should return hypothesis by id', async () => {
      const created = await repo.create({
        engagementId: testEngagementId,
        type: 'assumption',
        content: 'Market will grow 10% annually',
        createdBy: 'test-agent',
      });

      const result = await repo.getById(created.id);
      expect(result).not.toBeNull();
      expect(result!.content).toBe('Market will grow 10% annually');
    });
  });

  describe('getByEngagement', () => {
    it('should return all hypotheses for an engagement', async () => {
      await repo.create({ engagementId: testEngagementId, type: 'thesis', content: 'H1', createdBy: 'test' });
      await repo.create({ engagementId: testEngagementId, type: 'sub_thesis', content: 'H2', createdBy: 'test' });

      const results = await repo.getByEngagement(testEngagementId);
      expect(results.length).toBe(2);
    });
  });

  describe('updateConfidence', () => {
    it('should update confidence and status', async () => {
      const created = await repo.create({
        engagementId: testEngagementId,
        type: 'thesis',
        content: 'Test hypothesis',
        createdBy: 'test',
      });

      await repo.updateConfidence(created.id, 0.85, 'supported');

      const updated = await repo.getById(created.id);
      expect(updated!.confidence).toBe(0.85);
      expect(updated!.status).toBe('supported');
    });
  });

  describe('delete', () => {
    it('should delete a hypothesis', async () => {
      const created = await repo.create({
        engagementId: testEngagementId,
        type: 'thesis',
        content: 'To be deleted',
        createdBy: 'test',
      });

      await repo.delete(created.id);

      const result = await repo.getById(created.id);
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd thesis-validator && npm test -- tests/repositories/hypothesis-repository.test.ts`

Expected: FAIL - Cannot find module

**Step 3: Write the repository implementation**

Create `thesis-validator/src/repositories/hypothesis-repository.ts`:

```typescript
/**
 * Hypothesis Repository - PostgreSQL persistence for hypotheses
 */

import { getPool } from '../db/index.js';
import type { HypothesisNode, HypothesisStatus, HypothesisType } from '../models/hypothesis.js';

export interface CreateHypothesisParams {
  engagementId: string;
  parentId?: string;
  type: HypothesisType;
  content: string;
  confidence?: number;
  status?: HypothesisStatus;
  importance?: 'critical' | 'high' | 'medium' | 'low';
  testability?: 'easy' | 'moderate' | 'difficult';
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface HypothesisRow {
  id: string;
  engagement_id: string;
  parent_id: string | null;
  type: HypothesisType;
  content: string;
  confidence: number;
  status: HypothesisStatus;
  importance: string | null;
  testability: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface HypothesisDTO {
  id: string;
  engagementId: string;
  parentId: string | null;
  type: HypothesisType;
  content: string;
  confidence: number;
  status: HypothesisStatus;
  importance: string | null;
  testability: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class HypothesisRepository {
  private mapRowToDTO(row: HypothesisRow): HypothesisDTO {
    return {
      id: row.id,
      engagementId: row.engagement_id,
      parentId: row.parent_id,
      type: row.type,
      content: row.content,
      confidence: parseFloat(row.confidence as unknown as string),
      status: row.status,
      importance: row.importance,
      testability: row.testability,
      metadata: row.metadata,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(params: CreateHypothesisParams): Promise<HypothesisDTO> {
    const pool = getPool();
    const { rows } = await pool.query<HypothesisRow>(
      `INSERT INTO hypotheses (
        engagement_id, parent_id, type, content, confidence, status,
        importance, testability, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        params.engagementId,
        params.parentId ?? null,
        params.type,
        params.content,
        params.confidence ?? 0.5,
        params.status ?? 'untested',
        params.importance ?? null,
        params.testability ?? null,
        params.metadata ?? {},
        params.createdBy,
      ]
    );
    return this.mapRowToDTO(rows[0]!);
  }

  async getById(id: string): Promise<HypothesisDTO | null> {
    const pool = getPool();
    const { rows } = await pool.query<HypothesisRow>(
      'SELECT * FROM hypotheses WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRowToDTO(rows[0]!);
  }

  async getByEngagement(engagementId: string): Promise<HypothesisDTO[]> {
    const pool = getPool();
    const { rows } = await pool.query<HypothesisRow>(
      'SELECT * FROM hypotheses WHERE engagement_id = $1 ORDER BY created_at ASC',
      [engagementId]
    );
    return rows.map(row => this.mapRowToDTO(row));
  }

  async getTree(engagementId: string): Promise<{
    hypotheses: HypothesisDTO[];
    edges: Array<{ id: string; sourceId: string; targetId: string; relationship: string; strength: number; reasoning: string | null }>;
  }> {
    const pool = getPool();

    const { rows: hypotheses } = await pool.query<HypothesisRow>(
      'SELECT * FROM hypotheses WHERE engagement_id = $1 ORDER BY created_at ASC',
      [engagementId]
    );

    const hypothesisIds = hypotheses.map(h => h.id);

    let edges: Array<{ id: string; source_id: string; target_id: string; relationship: string; strength: number; reasoning: string | null }> = [];
    if (hypothesisIds.length > 0) {
      const { rows: edgeRows } = await pool.query(
        `SELECT * FROM hypothesis_edges
         WHERE source_id = ANY($1) OR target_id = ANY($1)`,
        [hypothesisIds]
      );
      edges = edgeRows;
    }

    return {
      hypotheses: hypotheses.map(row => this.mapRowToDTO(row)),
      edges: edges.map(e => ({
        id: e.id,
        sourceId: e.source_id,
        targetId: e.target_id,
        relationship: e.relationship,
        strength: parseFloat(e.strength as unknown as string),
        reasoning: e.reasoning,
      })),
    };
  }

  async update(id: string, updates: Partial<{
    content: string;
    confidence: number;
    status: HypothesisStatus;
    importance: string;
    testability: string;
    metadata: Record<string, unknown>;
  }>): Promise<HypothesisDTO | null> {
    const pool = getPool();

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.content !== undefined) {
      setClauses.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }
    if (updates.confidence !== undefined) {
      setClauses.push(`confidence = $${paramIndex++}`);
      values.push(updates.confidence);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.importance !== undefined) {
      setClauses.push(`importance = $${paramIndex++}`);
      values.push(updates.importance);
    }
    if (updates.testability !== undefined) {
      setClauses.push(`testability = $${paramIndex++}`);
      values.push(updates.testability);
    }
    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(updates.metadata);
    }

    if (setClauses.length === 0) {
      return this.getById(id);
    }

    values.push(id);

    const { rows } = await pool.query<HypothesisRow>(
      `UPDATE hypotheses SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (rows.length === 0) return null;
    return this.mapRowToDTO(rows[0]!);
  }

  async updateConfidence(id: string, confidence: number, status?: HypothesisStatus): Promise<void> {
    const pool = getPool();
    if (status) {
      await pool.query(
        'UPDATE hypotheses SET confidence = $1, status = $2 WHERE id = $3',
        [confidence, status, id]
      );
    } else {
      await pool.query(
        'UPDATE hypotheses SET confidence = $1 WHERE id = $2',
        [confidence, id]
      );
    }
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM hypotheses WHERE id = $1',
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async addEdge(params: {
    sourceId: string;
    targetId: string;
    relationship: 'requires' | 'supports' | 'contradicts' | 'implies';
    strength?: number;
    reasoning?: string;
  }): Promise<{ id: string; sourceId: string; targetId: string; relationship: string; strength: number; reasoning: string | null }> {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO hypothesis_edges (source_id, target_id, relationship, strength, reasoning)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_id, target_id, relationship) DO UPDATE
       SET strength = EXCLUDED.strength, reasoning = EXCLUDED.reasoning
       RETURNING *`,
      [
        params.sourceId,
        params.targetId,
        params.relationship,
        params.strength ?? 0.5,
        params.reasoning ?? null,
      ]
    );
    const row = rows[0]!;
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relationship: row.relationship,
      strength: parseFloat(row.strength),
      reasoning: row.reasoning,
    };
  }

  async deleteEdge(id: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM hypothesis_edges WHERE id = $1',
      [id]
    );
    return (rowCount ?? 0) > 0;
  }
}
```

Create `thesis-validator/src/repositories/index.ts`:

```typescript
export { HypothesisRepository } from './hypothesis-repository.js';
export type { CreateHypothesisParams, HypothesisDTO, HypothesisRow } from './hypothesis-repository.js';
```

**Step 4: Run test to verify it passes**

Run: `cd thesis-validator && npm test -- tests/repositories/hypothesis-repository.test.ts`

Expected: PASS (requires DATABASE_URL to be set)

**Step 5: Commit**

```bash
git add src/repositories/ tests/repositories/
git commit -m "feat(repo): add HypothesisRepository with PostgreSQL persistence"
```

---

## Task 3: Create Hypothesis CRUD API Routes

**Files:**
- Create: `thesis-validator/src/api/routes/hypotheses.ts`
- Modify: `thesis-validator/src/api/routes/research.ts` (add import/register)

**Step 1: Write the failing test**

Create `thesis-validator/tests/api/hypotheses.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerHypothesesRoutes } from '../../src/api/routes/hypotheses.js';

describe('Hypotheses API', () => {
  const app = Fastify();
  const testEngagementId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    // Mock auth for tests
    app.addHook('preHandler', async (request) => {
      (request as any).user = { id: 'test-user', email: 'test@test.com' };
    });
    await app.register(registerHypothesesRoutes, { prefix: '/engagements' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /engagements/:engagementId/hypotheses', () => {
    it('should create a hypothesis', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/engagements/${testEngagementId}/hypotheses`,
        payload: {
          type: 'thesis',
          content: 'The company will grow revenue 20% YoY',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.hypothesis.id).toBeDefined();
      expect(body.hypothesis.content).toBe('The company will grow revenue 20% YoY');
    });
  });

  describe('GET /engagements/:engagementId/hypotheses/:id', () => {
    it('should return 404 for non-existent hypothesis', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/engagements/${testEngagementId}/hypotheses/00000000-0000-0000-0000-000000000999`,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd thesis-validator && npm test -- tests/api/hypotheses.test.ts`

Expected: FAIL - Cannot find module

**Step 3: Write the API routes implementation**

Create `thesis-validator/src/api/routes/hypotheses.ts`:

```typescript
/**
 * Hypothesis CRUD Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HypothesisRepository } from '../../repositories/index.js';
import {
  authHook,
  requireEngagementAccess,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { HypothesisTypeSchema, HypothesisStatusSchema, CausalRelationshipSchema } from '../../models/hypothesis.js';

const hypothesisRepo = new HypothesisRepository();

const CreateHypothesisBodySchema = z.object({
  type: HypothesisTypeSchema,
  content: z.string().min(1).max(2000),
  parent_id: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  testability: z.enum(['easy', 'moderate', 'difficult']).optional(),
});

const UpdateHypothesisBodySchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: HypothesisStatusSchema.optional(),
  importance: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  testability: z.enum(['easy', 'moderate', 'difficult']).optional(),
});

const CreateEdgeBodySchema = z.object({
  target_id: z.string().uuid(),
  relationship: CausalRelationshipSchema,
  strength: z.number().min(0).max(1).optional(),
  reasoning: z.string().max(500).optional(),
});

export async function registerHypothesesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authHook);

  /**
   * GET /engagements/:engagementId/hypotheses
   * List all hypotheses for an engagement
   */
  fastify.get(
    '/:engagementId/hypotheses',
    { preHandler: requireEngagementAccess('viewer') },
    async (
      request: FastifyRequest<{ Params: { engagementId: string } }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { hypotheses, edges } = await hypothesisRepo.getTree(engagementId);

      reply.send({
        hypotheses,
        edges,
        count: hypotheses.length,
      });
    }
  );

  /**
   * POST /engagements/:engagementId/hypotheses
   * Create a new hypothesis
   */
  fastify.post(
    '/:engagementId/hypotheses',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: { body: CreateHypothesisBodySchema },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: z.infer<typeof CreateHypothesisBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;
      const body = request.body;

      const hypothesis = await hypothesisRepo.create({
        engagementId,
        parentId: body.parent_id,
        type: body.type,
        content: body.content,
        confidence: body.confidence,
        importance: body.importance,
        testability: body.testability,
        createdBy: user.id,
      });

      reply.status(201).send({ hypothesis });
    }
  );

  /**
   * GET /engagements/:engagementId/hypotheses/:hypothesisId
   * Get a specific hypothesis
   */
  fastify.get(
    '/:engagementId/hypotheses/:hypothesisId',
    { preHandler: requireEngagementAccess('viewer') },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const hypothesis = await hypothesisRepo.getById(hypothesisId);

      if (!hypothesis) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Hypothesis not found',
        });
        return;
      }

      reply.send({ hypothesis });
    }
  );

  /**
   * PATCH /engagements/:engagementId/hypotheses/:hypothesisId
   * Update a hypothesis
   */
  fastify.patch(
    '/:engagementId/hypotheses/:hypothesisId',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: { body: UpdateHypothesisBodySchema },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
        Body: z.infer<typeof UpdateHypothesisBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const body = request.body;

      const hypothesis = await hypothesisRepo.update(hypothesisId, {
        content: body.content,
        confidence: body.confidence,
        status: body.status,
        importance: body.importance,
        testability: body.testability,
      });

      if (!hypothesis) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Hypothesis not found',
        });
        return;
      }

      reply.send({ hypothesis });
    }
  );

  /**
   * DELETE /engagements/:engagementId/hypotheses/:hypothesisId
   * Delete a hypothesis
   */
  fastify.delete(
    '/:engagementId/hypotheses/:hypothesisId',
    { preHandler: requireEngagementAccess('editor') },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const deleted = await hypothesisRepo.delete(hypothesisId);

      if (!deleted) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Hypothesis not found',
        });
        return;
      }

      reply.status(204).send();
    }
  );

  /**
   * POST /engagements/:engagementId/hypotheses/:hypothesisId/edges
   * Create a causal edge from this hypothesis to another
   */
  fastify.post(
    '/:engagementId/hypotheses/:hypothesisId/edges',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: { body: CreateEdgeBodySchema },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; hypothesisId: string };
        Body: z.infer<typeof CreateEdgeBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { hypothesisId } = request.params;
      const body = request.body;

      const edge = await hypothesisRepo.addEdge({
        sourceId: hypothesisId,
        targetId: body.target_id,
        relationship: body.relationship,
        strength: body.strength,
        reasoning: body.reasoning,
      });

      reply.status(201).send({ edge });
    }
  );

  /**
   * DELETE /engagements/:engagementId/hypothesis-edges/:edgeId
   * Delete a causal edge
   */
  fastify.delete(
    '/:engagementId/hypothesis-edges/:edgeId',
    { preHandler: requireEngagementAccess('editor') },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; edgeId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { edgeId } = request.params;
      const deleted = await hypothesisRepo.deleteEdge(edgeId);

      if (!deleted) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Edge not found',
        });
        return;
      }

      reply.status(204).send();
    }
  );
}
```

**Step 4: Register routes in main API**

Modify `thesis-validator/src/api/index.ts` to add:

```typescript
import { registerHypothesesRoutes } from './routes/hypotheses.js';

// In the setup function, add:
await fastify.register(registerHypothesesRoutes, { prefix: '/api/v1/engagements' });
```

**Step 5: Run test to verify it passes**

Run: `cd thesis-validator && npm test -- tests/api/hypotheses.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/api/routes/hypotheses.ts src/api/index.ts tests/api/
git commit -m "feat(api): add hypothesis CRUD endpoints"
```

---

## Task 4: Update HypothesisBuilder Agent to Use PostgreSQL

**Files:**
- Modify: `thesis-validator/src/agents/hypothesis-builder.ts`

**Step 1: Identify the code to modify**

In `hypothesis-builder.ts`, the `execute` method currently stores to vector memory only. We need to also store to PostgreSQL.

**Step 2: Write the failing test**

Add to `thesis-validator/tests/agents/hypothesis-builder.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HypothesisBuilderAgent } from '../../src/agents/hypothesis-builder.js';
import { HypothesisRepository } from '../../src/repositories/index.js';

vi.mock('../../src/repositories/index.js', () => ({
  HypothesisRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({ id: 'test-id', content: 'test', type: 'thesis' }),
    addEdge: vi.fn().mockResolvedValue({ id: 'edge-id' }),
  })),
}));

describe('HypothesisBuilderAgent', () => {
  describe('execute', () => {
    it('should store hypotheses in PostgreSQL repository', async () => {
      // Test that repository.create is called for each hypothesis
      // This verifies the agent writes to PostgreSQL
    });
  });
});
```

**Step 3: Modify hypothesis-builder.ts**

Add PostgreSQL persistence to the execute method. Add these imports and modifications:

```typescript
// Add import at top
import { HypothesisRepository } from '../repositories/index.js';

// In the HypothesisBuilderAgent class, add:
private hypothesisRepo = new HypothesisRepository();

// In execute(), after storing in vector memory, also store in PostgreSQL:
// Store hypotheses in PostgreSQL
for (const hypothesis of hypotheses) {
  await this.hypothesisRepo.create({
    engagementId: this.context.engagementId,
    type: hypothesis.type,
    content: hypothesis.content,
    confidence: hypothesis.confidence,
    status: hypothesis.status,
    createdBy: this.config.id,
  });
}

// Store relationships in PostgreSQL
for (const rel of relationships) {
  await this.hypothesisRepo.addEdge({
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    relationship: rel.relationship,
    strength: rel.strength,
    reasoning: rel.reasoning,
  });
}
```

**Step 4: Run tests**

Run: `cd thesis-validator && npm test -- tests/agents/hypothesis-builder.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/agents/hypothesis-builder.ts tests/agents/
git commit -m "feat(agent): wire HypothesisBuilder to PostgreSQL repository"
```

---

## Task 5: Add Frontend API Client Methods

**Files:**
- Modify: `dashboard-ui/src/lib/api-client.ts`
- Modify: `dashboard-ui/src/types/api.ts`

**Step 1: Add types to api.ts**

Add to `dashboard-ui/src/types/api.ts`:

```typescript
export interface HypothesisNode {
  id: string;
  engagementId: string;
  parentId: string | null;
  type: 'thesis' | 'sub_thesis' | 'assumption';
  content: string;
  confidence: number;
  status: 'untested' | 'supported' | 'challenged' | 'refuted';
  importance: 'critical' | 'high' | 'medium' | 'low' | null;
  testability: 'easy' | 'moderate' | 'difficult' | null;
  createdAt: string;
  updatedAt: string;
}

export interface HypothesisEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: 'requires' | 'supports' | 'contradicts' | 'implies';
  strength: number;
  reasoning: string | null;
}

export interface HypothesisTree {
  hypotheses: HypothesisNode[];
  edges: HypothesisEdge[];
  count: number;
}

export interface CreateHypothesisRequest {
  type: 'thesis' | 'sub_thesis' | 'assumption';
  content: string;
  parent_id?: string;
  confidence?: number;
  importance?: 'critical' | 'high' | 'medium' | 'low';
  testability?: 'easy' | 'moderate' | 'difficult';
}

export interface UpdateHypothesisRequest {
  content?: string;
  confidence?: number;
  status?: 'untested' | 'supported' | 'challenged' | 'refuted';
  importance?: 'critical' | 'high' | 'medium' | 'low';
  testability?: 'easy' | 'moderate' | 'difficult';
}
```

**Step 2: Add methods to api-client.ts**

Add to `ThesisValidatorClient` class in `dashboard-ui/src/lib/api-client.ts`:

```typescript
// Hypotheses
async getHypothesisTree(engagementId: string): Promise<HypothesisTree> {
  const response = await this.client.get(`/api/v1/engagements/${engagementId}/hypotheses`);
  return response.data;
}

async getHypothesis(engagementId: string, hypothesisId: string): Promise<{ hypothesis: HypothesisNode }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`
  );
  return response.data;
}

async createHypothesis(engagementId: string, data: CreateHypothesisRequest): Promise<{ hypothesis: HypothesisNode }> {
  const response = await this.client.post(
    `/api/v1/engagements/${engagementId}/hypotheses`,
    data
  );
  return response.data;
}

async updateHypothesis(
  engagementId: string,
  hypothesisId: string,
  data: UpdateHypothesisRequest
): Promise<{ hypothesis: HypothesisNode }> {
  const response = await this.client.patch(
    `/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`,
    data
  );
  return response.data;
}

async deleteHypothesis(engagementId: string, hypothesisId: string): Promise<void> {
  await this.client.delete(`/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`);
}
```

**Step 3: Commit**

```bash
git add dashboard-ui/src/lib/api-client.ts dashboard-ui/src/types/api.ts
git commit -m "feat(ui): add hypothesis API client methods and types"
```

---

## Task 6: Create useHypotheses Hook

**Files:**
- Create: `dashboard-ui/src/hooks/useHypotheses.ts`

**Step 1: Write the hook**

Create `dashboard-ui/src/hooks/useHypotheses.ts`:

```typescript
/**
 * React hooks for hypothesis management
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CreateHypothesisRequest, UpdateHypothesisRequest, HypothesisTree, HypothesisNode } from '../types/api';

/**
 * Hook to fetch hypothesis tree for an engagement
 */
export function useHypothesisTree(engagementId: string | null) {
  return useQuery<HypothesisTree>({
    queryKey: ['hypothesisTree', engagementId],
    queryFn: () => apiClient.getHypothesisTree(engagementId!),
    enabled: !!engagementId,
  });
}

/**
 * Hook to fetch a single hypothesis
 */
export function useHypothesis(engagementId: string | null, hypothesisId: string | null) {
  return useQuery<{ hypothesis: HypothesisNode }>({
    queryKey: ['hypothesis', engagementId, hypothesisId],
    queryFn: () => apiClient.getHypothesis(engagementId!, hypothesisId!),
    enabled: !!engagementId && !!hypothesisId,
  });
}

/**
 * Hook to create a hypothesis
 */
export function useCreateHypothesis(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateHypothesisRequest) =>
      apiClient.createHypothesis(engagementId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hypothesisTree', engagementId] });
    },
  });
}

/**
 * Hook to update a hypothesis
 */
export function useUpdateHypothesis(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ hypothesisId, data }: { hypothesisId: string; data: UpdateHypothesisRequest }) =>
      apiClient.updateHypothesis(engagementId, hypothesisId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hypothesisTree', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['hypothesis', engagementId, variables.hypothesisId] });
    },
  });
}

/**
 * Hook to delete a hypothesis
 */
export function useDeleteHypothesis(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (hypothesisId: string) =>
      apiClient.deleteHypothesis(engagementId, hypothesisId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hypothesisTree', engagementId] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add dashboard-ui/src/hooks/useHypotheses.ts
git commit -m "feat(ui): add useHypotheses hooks for hypothesis management"
```

---

## Task 7: Install reactflow Dependency

**Files:**
- Modify: `dashboard-ui/package.json`

**Step 1: Install reactflow**

Run: `cd dashboard-ui && npm install reactflow`

**Step 2: Verify installation**

Run: `cd dashboard-ui && npm ls reactflow`

Expected: Shows reactflow version

**Step 3: Commit**

```bash
git add dashboard-ui/package.json dashboard-ui/package-lock.json
git commit -m "chore(ui): add reactflow dependency for hypothesis visualization"
```

---

## Task 8: Create HypothesisTree Component

**Files:**
- Create: `dashboard-ui/src/components/hypothesis/HypothesisTree.tsx`
- Create: `dashboard-ui/src/components/hypothesis/HypothesisNode.tsx`
- Create: `dashboard-ui/src/components/hypothesis/index.ts`

**Step 1: Create the custom node component**

Create `dashboard-ui/src/components/hypothesis/HypothesisNode.tsx`:

```typescript
/**
 * Custom node component for hypothesis tree visualization
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { HypothesisNode as HypothesisNodeType } from '../../types/api';

interface HypothesisNodeData {
  hypothesis: HypothesisNodeType;
  onSelect: (id: string) => void;
}

const statusColors = {
  untested: 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600',
  supported: 'bg-green-100 border-green-400 dark:bg-green-900/30 dark:border-green-600',
  challenged: 'bg-yellow-100 border-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-600',
  refuted: 'bg-red-100 border-red-400 dark:bg-red-900/30 dark:border-red-600',
};

const typeLabels = {
  thesis: 'Thesis',
  sub_thesis: 'Sub-thesis',
  assumption: 'Assumption',
};

const importanceSizes = {
  critical: 'min-w-[280px]',
  high: 'min-w-[240px]',
  medium: 'min-w-[200px]',
  low: 'min-w-[180px]',
};

function HypothesisNodeComponent({ data }: NodeProps<HypothesisNodeData>) {
  const { hypothesis, onSelect } = data;
  const colorClass = statusColors[hypothesis.status];
  const sizeClass = importanceSizes[hypothesis.importance ?? 'medium'];

  const confidencePercent = Math.round(hypothesis.confidence * 100);
  const confidenceColor =
    confidencePercent >= 70 ? 'text-green-600 dark:text-green-400' :
    confidencePercent >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
    'text-red-600 dark:text-red-400';

  return (
    <div
      className={`rounded-lg border-2 p-3 shadow-md cursor-pointer transition-all hover:shadow-lg ${colorClass} ${sizeClass}`}
      onClick={() => onSelect(hypothesis.id)}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
          {typeLabels[hypothesis.type]}
        </span>
        <span className={`text-sm font-bold ${confidenceColor}`}>
          {confidencePercent}%
        </span>
      </div>

      <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">
        {hypothesis.content}
      </p>

      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          hypothesis.status === 'supported' ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' :
          hypothesis.status === 'challenged' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
          hypothesis.status === 'refuted' ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' :
          'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
        }`}>
          {hypothesis.status}
        </span>
        {hypothesis.importance && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {hypothesis.importance}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export const HypothesisNodeMemo = memo(HypothesisNodeComponent);
```

**Step 2: Create the tree component**

Create `dashboard-ui/src/components/hypothesis/HypothesisTree.tsx`:

```typescript
/**
 * Interactive hypothesis tree visualization using reactflow
 */
import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { HypothesisNodeMemo } from './HypothesisNode';
import type { HypothesisNode as HypothesisNodeType, HypothesisEdge, HypothesisTree as HypothesisTreeType } from '../../types/api';

interface HypothesisTreeProps {
  tree: HypothesisTreeType;
  onNodeSelect: (hypothesis: HypothesisNodeType) => void;
}

const nodeTypes: NodeTypes = {
  hypothesis: HypothesisNodeMemo,
};

const edgeColors = {
  requires: '#ef4444',
  supports: '#22c55e',
  contradicts: '#f59e0b',
  implies: '#3b82f6',
};

export function HypothesisTreeViz({ tree, onNodeSelect }: HypothesisTreeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedId(id);
    const hypothesis = tree.hypotheses.find(h => h.id === id);
    if (hypothesis) {
      onNodeSelect(hypothesis);
    }
  }, [tree.hypotheses, onNodeSelect]);

  // Convert hypotheses to reactflow nodes
  const initialNodes: Node[] = useMemo(() => {
    // Simple layout: thesis at top, sub-theses in middle, assumptions at bottom
    const theses = tree.hypotheses.filter(h => h.type === 'thesis');
    const subTheses = tree.hypotheses.filter(h => h.type === 'sub_thesis');
    const assumptions = tree.hypotheses.filter(h => h.type === 'assumption');

    const nodes: Node[] = [];

    // Position thesis nodes
    theses.forEach((h, i) => {
      nodes.push({
        id: h.id,
        type: 'hypothesis',
        position: { x: 400 + i * 350, y: 50 },
        data: { hypothesis: h, onSelect: handleNodeSelect },
      });
    });

    // Position sub-thesis nodes
    subTheses.forEach((h, i) => {
      nodes.push({
        id: h.id,
        type: 'hypothesis',
        position: { x: 100 + i * 300, y: 250 },
        data: { hypothesis: h, onSelect: handleNodeSelect },
      });
    });

    // Position assumption nodes
    assumptions.forEach((h, i) => {
      nodes.push({
        id: h.id,
        type: 'hypothesis',
        position: { x: 50 + i * 250, y: 450 },
        data: { hypothesis: h, onSelect: handleNodeSelect },
      });
    });

    return nodes;
  }, [tree.hypotheses, handleNodeSelect]);

  // Convert edges to reactflow edges
  const initialEdges: Edge[] = useMemo(() => {
    return tree.edges.map((edge: HypothesisEdge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      label: edge.relationship,
      type: 'smoothstep',
      animated: edge.relationship === 'contradicts',
      style: {
        stroke: edgeColors[edge.relationship],
        strokeWidth: Math.max(1, edge.strength * 3),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColors[edge.relationship],
      },
      labelStyle: {
        fill: edgeColors[edge.relationship],
        fontSize: 10,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: 'white',
        fillOpacity: 0.8,
      },
    }));
  }, [tree.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  if (tree.hypotheses.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">No hypotheses yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Start research to generate hypotheses
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[600px] bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        attributionPosition="bottom-left"
      >
        <Controls className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700" />
        <Background color="#94a3b8" gap={16} />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Edge Types</p>
        <div className="space-y-1">
          {Object.entries(edgeColors).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-4 h-0.5" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create index file**

Create `dashboard-ui/src/components/hypothesis/index.ts`:

```typescript
export { HypothesisTreeViz } from './HypothesisTree';
export { HypothesisNodeMemo } from './HypothesisNode';
```

**Step 4: Commit**

```bash
git add dashboard-ui/src/components/hypothesis/
git commit -m "feat(ui): add HypothesisTree visualization component with reactflow"
```

---

## Task 9: Create HypothesisDetailPanel Component

**Files:**
- Create: `dashboard-ui/src/components/hypothesis/HypothesisDetailPanel.tsx`

**Step 1: Write the component**

Create `dashboard-ui/src/components/hypothesis/HypothesisDetailPanel.tsx`:

```typescript
/**
 * Side panel showing hypothesis details and linked evidence
 */
import { X, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { HypothesisNode } from '../../types/api';

interface HypothesisDetailPanelProps {
  hypothesis: HypothesisNode;
  onClose: () => void;
  onUpdateConfidence?: (confidence: number, status: string) => void;
}

const statusOptions = [
  { value: 'untested', label: 'Untested', color: 'bg-gray-100 text-gray-800' },
  { value: 'supported', label: 'Supported', color: 'bg-green-100 text-green-800' },
  { value: 'challenged', label: 'Challenged', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'refuted', label: 'Refuted', color: 'bg-red-100 text-red-800' },
];

export function HypothesisDetailPanel({
  hypothesis,
  onClose,
  onUpdateConfidence,
}: HypothesisDetailPanelProps) {
  const confidencePercent = Math.round(hypothesis.confidence * 100);

  return (
    <div className="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 w-96 h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white">
          Hypothesis Details
        </h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Type and Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase">
            {hypothesis.type.replace('_', ' ')}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            statusOptions.find(s => s.value === hypothesis.status)?.color
          }`}>
            {hypothesis.status}
          </span>
        </div>

        {/* Content */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Statement
          </h3>
          <p className="text-gray-900 dark:text-white">
            {hypothesis.content}
          </p>
        </div>

        {/* Confidence */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Confidence
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  confidencePercent >= 70 ? 'bg-green-500' :
                  confidencePercent >= 40 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className={`font-bold ${
              confidencePercent >= 70 ? 'text-green-600' :
              confidencePercent >= 40 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {confidencePercent}%
            </span>
          </div>
        </div>

        {/* Importance & Testability */}
        <div className="grid grid-cols-2 gap-4">
          {hypothesis.importance && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Importance
              </h3>
              <span className="text-gray-900 dark:text-white capitalize">
                {hypothesis.importance}
              </span>
            </div>
          )}
          {hypothesis.testability && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Testability
              </h3>
              <span className="text-gray-900 dark:text-white capitalize">
                {hypothesis.testability}
              </span>
            </div>
          )}
        </div>

        {/* Status Update Buttons */}
        {onUpdateConfidence && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Update Status
            </h3>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => onUpdateConfidence(hypothesis.confidence, option.value)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    hypothesis.status === option.value
                      ? option.color + ' border-transparent'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Metadata
          </h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900 dark:text-white">
                {new Date(hypothesis.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Updated</dt>
              <dd className="text-gray-900 dark:text-white">
                {new Date(hypothesis.updatedAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Placeholder for linked evidence */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Linked Evidence
          </h3>
          <p className="text-sm text-gray-400 italic">
            Evidence linking will be added in Slice 2
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update index.ts**

Add to `dashboard-ui/src/components/hypothesis/index.ts`:

```typescript
export { HypothesisDetailPanel } from './HypothesisDetailPanel';
```

**Step 3: Commit**

```bash
git add dashboard-ui/src/components/hypothesis/
git commit -m "feat(ui): add HypothesisDetailPanel for viewing hypothesis details"
```

---

## Task 10: Integrate Hypothesis Tree into Main Panel

**Files:**
- Modify: `dashboard-ui/src/components/main/MainPanel.tsx`

**Step 1: Add hypothesis tree tab to MainPanel**

Modify the MainPanel component to include a "Hypotheses" tab that renders the tree:

```typescript
// Add imports at top
import { useState } from 'react';
import { HypothesisTreeViz, HypothesisDetailPanel } from '../hypothesis';
import { useHypothesisTree, useUpdateHypothesis } from '../../hooks/useHypotheses';
import type { HypothesisNode } from '../../types/api';

// In the component, add state and hooks:
const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisNode | null>(null);
const { data: hypothesisTree, isLoading: isLoadingTree } = useHypothesisTree(engagementId);
const updateHypothesis = useUpdateHypothesis(engagementId);

// Add handler:
const handleUpdateStatus = (confidence: number, status: string) => {
  if (selectedHypothesis) {
    updateHypothesis.mutate({
      hypothesisId: selectedHypothesis.id,
      data: { status: status as any },
    });
  }
};

// Add tab content for hypotheses:
{activeTab === 'hypotheses' && hypothesisTree && (
  <div className="flex h-full">
    <div className="flex-1">
      <HypothesisTreeViz
        tree={hypothesisTree}
        onNodeSelect={setSelectedHypothesis}
      />
    </div>
    {selectedHypothesis && (
      <HypothesisDetailPanel
        hypothesis={selectedHypothesis}
        onClose={() => setSelectedHypothesis(null)}
        onUpdateConfidence={handleUpdateStatus}
      />
    )}
  </div>
)}
```

**Step 2: Commit**

```bash
git add dashboard-ui/src/components/main/MainPanel.tsx
git commit -m "feat(ui): integrate hypothesis tree visualization into main panel"
```

---

## Task 11: Run Full Integration Test

**Step 1: Start the backend**

Run: `cd thesis-validator && npm run dev`

**Step 2: Start the frontend**

Run: `cd dashboard-ui && npm run dev`

**Step 3: Test the flow**

1. Create an engagement
2. Submit a thesis
3. Start research (this generates hypotheses)
4. Navigate to the Hypotheses tab
5. Verify tree visualization renders
6. Click a node and verify detail panel shows
7. Update status and verify it persists

**Step 4: Run all tests**

Run: `cd thesis-validator && npm test`
Run: `cd dashboard-ui && npm run build` (type checks)

Expected: All tests pass, build succeeds

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Slice 1 - Hypothesis Management

- PostgreSQL tables for hypotheses and edges
- HypothesisRepository with full CRUD
- REST API endpoints for hypothesis management
- HypothesisBuilder agent persists to PostgreSQL
- Interactive hypothesis tree visualization with reactflow
- HypothesisDetailPanel for viewing/updating hypotheses
- Frontend hooks and API client methods

Closes: Slice 1 of full workflow build-out"
```

---

## Success Criteria Checklist

- [ ] Hypotheses persist to PostgreSQL
- [ ] CRUD API endpoints work with authentication
- [ ] Hypothesis tree renders in UI with correct colors/sizes
- [ ] Clicking a node shows details panel
- [ ] HypothesisBuilder agent saves to PostgreSQL
- [ ] All tests pass
- [ ] TypeScript compiles without errors
