/**
 * Hypothesis Repository - PostgreSQL persistence for hypotheses
 */

import { getPool } from '../db/index.js';
import type { HypothesisStatus, HypothesisType } from '../models/hypothesis.js';

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
