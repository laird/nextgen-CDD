/**
 * Engagement Repository - PostgreSQL persistence for engagements
 */

import { getPool } from '../db/index.js';

export interface EngagementRow {
  id: string;
  target_company: string;
  target: Record<string, unknown>;
  deal_type: string;
  sector: string;
  description: string | null;
  deal_size: number | null;
  lead_partner: string | null;
  status: string;
  thesis: Record<string, unknown> | null;
  config: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEngagementParams {
  id: string;
  targetCompanyName: string;
  sector: string;
  description?: string;
  dealType: string;
  dealSize?: number;
  leadPartner?: string;
  createdBy: string;
  thesis?: string;
}

export interface EngagementDTO {
  id: string;
  name: string;
  target_company: {
    name: string;
    sector: string;
    description?: string;
  };
  deal_type: string;
  status: string;
  thesis?: {
    statement: string;
    submitted_at: number;
    key_questions?: string[];
  };
  created_by: string;
  created_at: number;
  updated_at: number;
  config: Record<string, unknown>;
}

export class EngagementRepository {
  async create(params: CreateEngagementParams): Promise<EngagementDTO> {
    const pool = getPool();
    const now = new Date();

    const config: Record<string, unknown> = {};

    if (params.thesis) {
      config.thesis = {
        statement: params.thesis,
        submitted_at: now.getTime(),
      };
    }

    // Build target JSONB object matching schema
    const target = {
      name: params.targetCompanyName,
      sector: params.sector,
      ...(params.description ? { description: params.description } : {}),
    };

    const { rows } = await pool.query(
      `INSERT INTO engagements (id, target_company, target, deal_type, sector, description, deal_size, lead_partner, status, config, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
       RETURNING *`,
      [
        params.id,
        params.targetCompanyName,
        JSON.stringify(target),
        params.dealType,
        params.sector,
        params.description ?? null,
        params.dealSize ?? null,
        params.leadPartner ?? null,
        'active',
        JSON.stringify(config),
        params.createdBy,
        now,
      ]
    );

    return this.mapRowToDTO(rows[0]!);
  }

  async getById(id: string): Promise<EngagementDTO | null> {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM engagements WHERE id = $1',
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToDTO(rows[0]!);
  }

  async getByIds(ids: string[]): Promise<EngagementDTO[]> {
    if (ids.length === 0) return [];

    const pool = getPool();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `SELECT * FROM engagements WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
      ids
    );

    return rows.map((row) => this.mapRowToDTO(row));
  }

  async getAll(options?: {
    status?: string;
    sector?: string;
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
  }): Promise<{ engagements: EngagementDTO[]; total: number }> {
    const pool = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Exclude archived by default unless explicitly requested
    if (!options?.includeArchived && !options?.status) {
      conditions.push(`status != $${paramIndex++}`);
      values.push('archived');
    }

    if (options?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(options.status);
    }
    if (options?.sector) {
      conditions.push(`sector = $${paramIndex++}`);
      values.push(options.sector);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM engagements ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Get paginated results
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    values.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT * FROM engagements ${whereClause} ORDER BY updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return {
      engagements: rows.map((row) => this.mapRowToDTO(row)),
      total,
    };
  }

  async update(id: string, updates: Partial<{
    targetCompanyName: string;
    sector: string;
    description: string;
    status: string;
    thesis: { statement: string; submitted_at: number; key_questions?: string[] };
    config: Record<string, unknown>;
  }>): Promise<EngagementDTO | null> {
    const pool = getPool();

    // First get current record
    const current = await this.getById(id);
    if (!current) return null;

    const updateFields: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.targetCompanyName !== undefined) {
      updateFields.push(`target_company = $${paramIndex++}`);
      values.push(updates.targetCompanyName);
    }
    if (updates.sector !== undefined) {
      updateFields.push(`sector = $${paramIndex++}`);
      values.push(updates.sector);
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.thesis !== undefined) {
      // Update the thesis column directly
      updateFields.push(`thesis = $${paramIndex++}`);
      values.push(JSON.stringify(updates.thesis));
    }
    if (updates.config !== undefined) {
      // Merge config updates
      const newConfig = { ...current.config, ...updates.config };
      updateFields.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(newConfig));
    }

    values.push(id);

    const { rows } = await pool.query(
      `UPDATE engagements SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (rows.length === 0) return null;
    return this.mapRowToDTO(rows[0]!);
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM engagements WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async exists(id: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT 1 FROM engagements WHERE id = $1',
      [id]
    );
    return rows.length > 0;
  }

  private mapRowToDTO(row: EngagementRow): EngagementDTO {
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config ?? {});
    const target = typeof row.target === 'string' ? JSON.parse(row.target) : (row.target ?? {});
    const thesis = typeof row.thesis === 'string' ? JSON.parse(row.thesis) : row.thesis;

    const dto: EngagementDTO = {
      id: row.id,
      name: row.target_company, // Use target_company as name for compatibility
      target_company: {
        name: target.name ?? row.target_company,
        sector: target.sector ?? row.sector,
        ...(target.description || row.description ? { description: target.description ?? row.description } : {}),
      },
      deal_type: row.deal_type ?? 'buyout',
      status: row.status,
      created_by: row.created_by ?? 'unknown',
      created_at: new Date(row.created_at).getTime(),
      updated_at: new Date(row.updated_at).getTime(),
      config,
    };

    if (thesis) {
      dto.thesis = thesis;
    }

    return dto;
  }
}
