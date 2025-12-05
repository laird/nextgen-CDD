# Slice 2: Evidence Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete evidence system with PostgreSQL persistence, real document parsing, BullMQ processing, and frontend Evidence Explorer.

**Architecture:** Evidence metadata stored in PostgreSQL (source of truth), embeddings in Ruvector (keyed by PG ID). Documents uploaded via API, queued to BullMQ for async parsing, chunks stored as evidence records. Frontend displays filterable evidence list with research quality charts.

**Tech Stack:** PostgreSQL (pg), BullMQ, pdf-parse, mammoth, xlsx, cheerio, tesseract.js, React, recharts, TanStack Query

---

## Task 1: Create Database Migration for Evidence

**Files:**
- Create: `thesis-validator/src/db/migrations/002_evidence.sql`

**Step 1: Write the migration SQL file**

```sql
-- thesis-validator/src/db/migrations/002_evidence.sql
-- Evidence Management Tables

-- Documents table (must come first due to FK reference)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  format VARCHAR(20) NOT NULL
    CHECK (format IN ('pdf', 'docx', 'xlsx', 'pptx', 'html', 'image', 'unknown')),
  mime_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  uploaded_by VARCHAR(100),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_documents_engagement ON documents(engagement_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Evidence table
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL,
  content TEXT NOT NULL,
  source_type VARCHAR(20) NOT NULL
    CHECK (source_type IN ('web', 'document', 'expert', 'data', 'filing', 'financial')),
  source_url TEXT,
  source_title TEXT,
  source_author TEXT,
  source_publication_date DATE,
  credibility DECIMAL(3,2) CHECK (credibility >= 0 AND credibility <= 1),
  sentiment VARCHAR(20) NOT NULL DEFAULT 'neutral'
    CHECK (sentiment IN ('supporting', 'neutral', 'contradicting')),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  provenance JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  retrieved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_engagement ON evidence(engagement_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source_type ON evidence(source_type);
CREATE INDEX IF NOT EXISTS idx_evidence_sentiment ON evidence(sentiment);
CREATE INDEX IF NOT EXISTS idx_evidence_credibility ON evidence(credibility);
CREATE INDEX IF NOT EXISTS idx_evidence_document ON evidence(document_id);

-- Evidence-to-hypothesis junction table
CREATE TABLE IF NOT EXISTS evidence_hypotheses (
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  hypothesis_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  relevance_score DECIMAL(3,2) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (evidence_id, hypothesis_id)
);

CREATE INDEX IF NOT EXISTS idx_ev_hyp_hypothesis ON evidence_hypotheses(hypothesis_id);
```

**Step 2: Run migration to verify**

Run: `cd thesis-validator && npm run db:migrate`

Expected: Tables created successfully

**Step 3: Commit**

```bash
git add src/db/migrations/002_evidence.sql
git commit -m "feat(db): add evidence and documents tables migration"
```

---

## Task 2: Install Document Parsing Dependencies

**Files:**
- Modify: `thesis-validator/package.json`

**Step 1: Install parsing libraries**

Run:
```bash
cd thesis-validator && npm install pdf-parse mammoth xlsx cheerio tesseract.js
```

**Step 2: Install types**

Run:
```bash
cd thesis-validator && npm install -D @types/pdf-parse
```

**Step 3: Verify installation**

Run: `npm ls pdf-parse mammoth xlsx cheerio tesseract.js`

Expected: Shows all packages installed

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add document parsing libraries"
```

---

## Task 3: Implement Real Document Parsers

**Files:**
- Modify: `thesis-validator/src/tools/document-parser.ts`

**Step 1: Add imports for parsing libraries**

Replace placeholder imports at top of file:

```typescript
/**
 * Document Parser - Multi-format document parsing
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import Tesseract from 'tesseract.js';
```

**Step 2: Implement PDF parser**

Replace `parsePDFPlaceholder` method:

```typescript
/**
 * Parse PDF document
 */
private async parsePDF(buffer: Buffer): Promise<{ content: string; metadata: DocumentMetadata; needsOCR: boolean }> {
  try {
    const data = await pdfParse(buffer);

    // Check if PDF has actual text or is scanned
    const hasText = data.text.trim().length > 50;

    if (!hasText) {
      return {
        content: '',
        metadata: {
          wordCount: 0,
          pageCount: data.numpages,
        },
        needsOCR: true,
      };
    }

    return {
      content: data.text,
      metadata: {
        title: data.info?.Title,
        author: data.info?.Author,
        wordCount: data.text.split(/\s+/).filter(Boolean).length,
        pageCount: data.numpages,
        createdDate: data.info?.CreationDate,
      },
      needsOCR: false,
    };
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Step 3: Implement DOCX parser**

Replace `parseDOCXPlaceholder` method:

```typescript
/**
 * Parse DOCX document
 */
private async parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error(`DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Step 4: Implement XLSX parser**

Replace `parseXLSXPlaceholder` and `extractXLSXTablesPlaceholder` methods:

```typescript
/**
 * Parse XLSX document
 */
private parseXLSX(buffer: Buffer): { content: string; tables: ParsedTable[] } {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const tables: ParsedTable[] = [];
    let allContent = '';

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert to JSON for table extraction
      const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

      if (jsonData.length > 0) {
        const headers = (jsonData[0] ?? []).map(h => String(h ?? ''));
        const rows = jsonData.slice(1).map(row =>
          (row ?? []).map(cell => String(cell ?? ''))
        );

        tables.push({
          id: crypto.randomUUID(),
          headers,
          rows,
          caption: sheetName,
        });

        // Also get text content
        const textContent = XLSX.utils.sheet_to_txt(sheet);
        allContent += `\n\n--- ${sheetName} ---\n${textContent}`;
      }
    }

    return { content: allContent.trim(), tables };
  } catch (error) {
    throw new Error(`XLSX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Step 5: Implement HTML parser with cheerio**

Replace `parseHTML` method:

```typescript
/**
 * Parse HTML content using cheerio
 */
private parseHTMLContent(html: string): string {
  const $ = cheerio.load(html);

  // Remove scripts, styles, and other non-content elements
  $('script, style, noscript, iframe, svg').remove();

  // Get text content
  let text = $('body').text() || $.root().text();

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
```

**Step 6: Implement OCR with Tesseract fallback**

Add new method:

```typescript
/**
 * Perform OCR on image/scanned PDF
 */
private async performOCR(buffer: Buffer): Promise<{ content: string; confidence: number }> {
  try {
    const result = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {}, // Suppress progress logs
    });

    return {
      content: result.data.text,
      confidence: result.data.confidence / 100,
    };
  } catch (error) {
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Step 7: Update parseBuffer to use real implementations**

Update the switch statement in `parseBuffer`:

```typescript
case 'application/pdf':
  const pdfResult = await this.parsePDF(buffer);
  if (pdfResult.needsOCR) {
    const ocrResult = await this.performOCR(buffer);
    content = ocrResult.content;
    metadata = {
      ...pdfResult.metadata,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      properties: { ocrConfidence: ocrResult.confidence },
    };
  } else {
    content = pdfResult.content;
    metadata = pdfResult.metadata;
  }
  break;

case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
  content = await this.parseDOCX(buffer);
  metadata = this.extractTextMetadata(content);
  break;

case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
  const xlsxResult = this.parseXLSX(buffer);
  content = xlsxResult.content;
  metadata = this.extractTextMetadata(content);
  if (opts.extractTables) {
    tables = xlsxResult.tables;
  }
  break;

case 'text/html':
  content = this.parseHTMLContent(buffer.toString('utf-8'));
  metadata = this.extractTextMetadata(content);
  break;
```

**Step 8: Run existing tests**

Run: `cd thesis-validator && npm test`

Expected: Tests pass (no regressions)

**Step 9: Commit**

```bash
git add src/tools/document-parser.ts
git commit -m "feat(parser): implement real document parsers for PDF, DOCX, XLSX, HTML, OCR"
```

---

## Task 4: Create EvidenceRepository

**Files:**
- Create: `thesis-validator/src/repositories/evidence-repository.ts`
- Modify: `thesis-validator/src/repositories/index.ts`

**Step 1: Write the repository implementation**

Create `thesis-validator/src/repositories/evidence-repository.ts`:

```typescript
/**
 * Evidence Repository - PostgreSQL persistence for evidence
 */

import { getPool } from '../db/index.js';
import type { EvidenceSentiment, EvidenceSourceType } from '../models/evidence.js';

export interface CreateEvidenceParams {
  engagementId: string;
  content: string;
  sourceType: EvidenceSourceType;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  sourcePublicationDate?: Date;
  credibility?: number;
  sentiment?: EvidenceSentiment;
  documentId?: string;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  retrievedAt?: Date;
}

export interface EvidenceDTO {
  id: string;
  engagementId: string;
  content: string;
  sourceType: EvidenceSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourcePublicationDate: Date | null;
  credibility: number | null;
  sentiment: EvidenceSentiment;
  documentId: string | null;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
  retrievedAt: Date | null;
  createdAt: Date;
  linkedHypotheses?: Array<{ hypothesisId: string; relevanceScore: number }>;
}

export interface EvidenceFilters {
  sourceType?: EvidenceSourceType;
  sentiment?: EvidenceSentiment;
  minCredibility?: number;
  maxCredibility?: number;
  hypothesisId?: string;
  documentId?: string;
  limit?: number;
  offset?: number;
}

export interface EvidenceStats {
  totalCount: number;
  bySourceType: Record<string, number>;
  bySentiment: Record<string, number>;
  averageCredibility: number;
  hypothesisCoverage: number;
}

export class EvidenceRepository {
  async create(params: CreateEvidenceParams): Promise<EvidenceDTO> {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO evidence (
        engagement_id, content, source_type, source_url, source_title,
        source_author, source_publication_date, credibility, sentiment,
        document_id, provenance, metadata, retrieved_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        params.engagementId,
        params.content,
        params.sourceType,
        params.sourceUrl ?? null,
        params.sourceTitle ?? null,
        params.sourceAuthor ?? null,
        params.sourcePublicationDate ?? null,
        params.credibility ?? 0.5,
        params.sentiment ?? 'neutral',
        params.documentId ?? null,
        params.provenance ?? {},
        params.metadata ?? {},
        params.retrievedAt ?? null,
      ]
    );
    return this.mapRowToDTO(rows[0]!);
  }

  async getById(id: string): Promise<EvidenceDTO | null> {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM evidence WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return null;

    const evidence = this.mapRowToDTO(rows[0]!);
    evidence.linkedHypotheses = await this.getLinkedHypotheses(id);
    return evidence;
  }

  async getByEngagement(engagementId: string, filters: EvidenceFilters = {}): Promise<EvidenceDTO[]> {
    const pool = getPool();
    const conditions: string[] = ['engagement_id = $1'];
    const values: unknown[] = [engagementId];
    let paramIndex = 2;

    if (filters.sourceType) {
      conditions.push(`source_type = $${paramIndex++}`);
      values.push(filters.sourceType);
    }
    if (filters.sentiment) {
      conditions.push(`sentiment = $${paramIndex++}`);
      values.push(filters.sentiment);
    }
    if (filters.minCredibility !== undefined) {
      conditions.push(`credibility >= $${paramIndex++}`);
      values.push(filters.minCredibility);
    }
    if (filters.maxCredibility !== undefined) {
      conditions.push(`credibility <= $${paramIndex++}`);
      values.push(filters.maxCredibility);
    }
    if (filters.documentId) {
      conditions.push(`document_id = $${paramIndex++}`);
      values.push(filters.documentId);
    }

    let query = `SELECT * FROM evidence WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filters.limit);
    }
    if (filters.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filters.offset);
    }

    const { rows } = await pool.query(query, values);

    // If filtering by hypothesis, apply that filter
    let evidence = rows.map(row => this.mapRowToDTO(row));

    if (filters.hypothesisId) {
      const { rows: linkedEvidence } = await pool.query(
        'SELECT evidence_id FROM evidence_hypotheses WHERE hypothesis_id = $1',
        [filters.hypothesisId]
      );
      const linkedIds = new Set(linkedEvidence.map(r => r.evidence_id));
      evidence = evidence.filter(e => linkedIds.has(e.id));
    }

    return evidence;
  }

  async update(id: string, updates: Partial<{
    content: string;
    credibility: number;
    sentiment: EvidenceSentiment;
    metadata: Record<string, unknown>;
  }>): Promise<EvidenceDTO | null> {
    const pool = getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.content !== undefined) {
      setClauses.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }
    if (updates.credibility !== undefined) {
      setClauses.push(`credibility = $${paramIndex++}`);
      values.push(updates.credibility);
    }
    if (updates.sentiment !== undefined) {
      setClauses.push(`sentiment = $${paramIndex++}`);
      values.push(updates.sentiment);
    }
    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(updates.metadata);
    }

    if (setClauses.length === 0) return this.getById(id);

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE evidence SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (rows.length === 0) return null;
    return this.mapRowToDTO(rows[0]!);
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query('DELETE FROM evidence WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  async linkToHypothesis(evidenceId: string, hypothesisId: string, relevanceScore: number = 0.5): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO evidence_hypotheses (evidence_id, hypothesis_id, relevance_score)
       VALUES ($1, $2, $3)
       ON CONFLICT (evidence_id, hypothesis_id) DO UPDATE SET relevance_score = $3`,
      [evidenceId, hypothesisId, relevanceScore]
    );
  }

  async unlinkFromHypothesis(evidenceId: string, hypothesisId: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM evidence_hypotheses WHERE evidence_id = $1 AND hypothesis_id = $2',
      [evidenceId, hypothesisId]
    );
    return (rowCount ?? 0) > 0;
  }

  async getLinkedHypotheses(evidenceId: string): Promise<Array<{ hypothesisId: string; relevanceScore: number }>> {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT hypothesis_id, relevance_score FROM evidence_hypotheses WHERE evidence_id = $1',
      [evidenceId]
    );
    return rows.map(r => ({
      hypothesisId: r.hypothesis_id,
      relevanceScore: parseFloat(r.relevance_score),
    }));
  }

  async getStats(engagementId: string): Promise<EvidenceStats> {
    const pool = getPool();

    // Get counts and averages
    const { rows: stats } = await pool.query(`
      SELECT
        COUNT(*) as total_count,
        AVG(credibility) as avg_credibility
      FROM evidence WHERE engagement_id = $1
    `, [engagementId]);

    // Get by source type
    const { rows: bySource } = await pool.query(`
      SELECT source_type, COUNT(*) as count
      FROM evidence WHERE engagement_id = $1
      GROUP BY source_type
    `, [engagementId]);

    // Get by sentiment
    const { rows: bySentiment } = await pool.query(`
      SELECT sentiment, COUNT(*) as count
      FROM evidence WHERE engagement_id = $1
      GROUP BY sentiment
    `, [engagementId]);

    // Get hypothesis coverage
    const { rows: coverage } = await pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT hypothesis_id) FROM evidence_hypotheses eh
         JOIN evidence e ON e.id = eh.evidence_id
         WHERE e.engagement_id = $1) as linked_hypotheses,
        (SELECT COUNT(*) FROM hypotheses WHERE engagement_id = $1) as total_hypotheses
    `, [engagementId]);

    const totalHypotheses = parseInt(coverage[0]?.total_hypotheses ?? '0');
    const linkedHypotheses = parseInt(coverage[0]?.linked_hypotheses ?? '0');

    return {
      totalCount: parseInt(stats[0]?.total_count ?? '0'),
      averageCredibility: parseFloat(stats[0]?.avg_credibility ?? '0'),
      bySourceType: Object.fromEntries(bySource.map(r => [r.source_type, parseInt(r.count)])),
      bySentiment: Object.fromEntries(bySentiment.map(r => [r.sentiment, parseInt(r.count)])),
      hypothesisCoverage: totalHypotheses > 0 ? linkedHypotheses / totalHypotheses : 0,
    };
  }

  private mapRowToDTO(row: Record<string, unknown>): EvidenceDTO {
    return {
      id: row.id as string,
      engagementId: row.engagement_id as string,
      content: row.content as string,
      sourceType: row.source_type as EvidenceSourceType,
      sourceUrl: row.source_url as string | null,
      sourceTitle: row.source_title as string | null,
      sourceAuthor: row.source_author as string | null,
      sourcePublicationDate: row.source_publication_date as Date | null,
      credibility: row.credibility ? parseFloat(row.credibility as string) : null,
      sentiment: row.sentiment as EvidenceSentiment,
      documentId: row.document_id as string | null,
      provenance: row.provenance as Record<string, unknown>,
      metadata: row.metadata as Record<string, unknown>,
      retrievedAt: row.retrieved_at as Date | null,
      createdAt: row.created_at as Date,
    };
  }
}
```

**Step 2: Update index.ts to export EvidenceRepository**

Add to `thesis-validator/src/repositories/index.ts`:

```typescript
export { EvidenceRepository } from './evidence-repository.js';
export type { CreateEvidenceParams, EvidenceDTO, EvidenceFilters, EvidenceStats } from './evidence-repository.js';
```

**Step 3: Commit**

```bash
git add src/repositories/evidence-repository.ts src/repositories/index.ts
git commit -m "feat(repo): add EvidenceRepository with PostgreSQL persistence"
```

---

## Task 5: Create DocumentRepository

**Files:**
- Create: `thesis-validator/src/repositories/document-repository.ts`
- Modify: `thesis-validator/src/repositories/index.ts`

**Step 1: Write the repository implementation**

Create `thesis-validator/src/repositories/document-repository.ts`:

```typescript
/**
 * Document Repository - PostgreSQL persistence for documents
 */

import { getPool } from '../db/index.js';

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'html' | 'image' | 'unknown';
export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CreateDocumentParams {
  engagementId: string;
  filename: string;
  originalFilename: string;
  format: DocumentFormat;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  uploadedBy: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentDTO {
  id: string;
  engagementId: string;
  filename: string;
  originalFilename: string;
  format: DocumentFormat;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  status: DocumentStatus;
  chunkCount: number;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  uploadedBy: string | null;
  uploadedAt: Date;
  processedAt: Date | null;
}

export interface DocumentFilters {
  status?: DocumentStatus;
  format?: DocumentFormat;
  limit?: number;
  offset?: number;
}

export class DocumentRepository {
  async create(params: CreateDocumentParams): Promise<DocumentDTO> {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO documents (
        engagement_id, filename, original_filename, format, mime_type,
        size_bytes, storage_path, uploaded_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        params.engagementId,
        params.filename,
        params.originalFilename,
        params.format,
        params.mimeType ?? null,
        params.sizeBytes ?? null,
        params.storagePath ?? null,
        params.uploadedBy,
        params.metadata ?? {},
      ]
    );
    return this.mapRowToDTO(rows[0]!);
  }

  async getById(id: string): Promise<DocumentDTO | null> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    return this.mapRowToDTO(rows[0]!);
  }

  async getByEngagement(engagementId: string, filters: DocumentFilters = {}): Promise<DocumentDTO[]> {
    const pool = getPool();
    const conditions: string[] = ['engagement_id = $1'];
    const values: unknown[] = [engagementId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.format) {
      conditions.push(`format = $${paramIndex++}`);
      values.push(filters.format);
    }

    let query = `SELECT * FROM documents WHERE ${conditions.join(' AND ')} ORDER BY uploaded_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filters.limit);
    }
    if (filters.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filters.offset);
    }

    const { rows } = await pool.query(query, values);
    return rows.map(row => this.mapRowToDTO(row));
  }

  async updateStatus(
    id: string,
    status: DocumentStatus,
    updates?: { chunkCount?: number; errorMessage?: string }
  ): Promise<DocumentDTO | null> {
    const pool = getPool();
    const setClauses = ['status = $1'];
    const values: unknown[] = [status];
    let paramIndex = 2;

    if (status === 'completed' || status === 'failed') {
      setClauses.push(`processed_at = NOW()`);
    }
    if (updates?.chunkCount !== undefined) {
      setClauses.push(`chunk_count = $${paramIndex++}`);
      values.push(updates.chunkCount);
    }
    if (updates?.errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIndex++}`);
      values.push(updates.errorMessage);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (rows.length === 0) return null;
    return this.mapRowToDTO(rows[0]!);
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query('DELETE FROM documents WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  private mapRowToDTO(row: Record<string, unknown>): DocumentDTO {
    return {
      id: row.id as string,
      engagementId: row.engagement_id as string,
      filename: row.filename as string,
      originalFilename: row.original_filename as string,
      format: row.format as DocumentFormat,
      mimeType: row.mime_type as string | null,
      sizeBytes: row.size_bytes as number | null,
      storagePath: row.storage_path as string | null,
      status: row.status as DocumentStatus,
      chunkCount: row.chunk_count as number,
      errorMessage: row.error_message as string | null,
      metadata: row.metadata as Record<string, unknown>,
      uploadedBy: row.uploaded_by as string | null,
      uploadedAt: row.uploaded_at as Date,
      processedAt: row.processed_at as Date | null,
    };
  }
}
```

**Step 2: Update index.ts**

Add to `thesis-validator/src/repositories/index.ts`:

```typescript
export { DocumentRepository } from './document-repository.js';
export type { CreateDocumentParams, DocumentDTO, DocumentFilters, DocumentFormat, DocumentStatus } from './document-repository.js';
```

**Step 3: Commit**

```bash
git add src/repositories/document-repository.ts src/repositories/index.ts
git commit -m "feat(repo): add DocumentRepository for document metadata"
```

---

## Task 6: Create Document Processing Worker

**Files:**
- Create: `thesis-validator/src/workers/document-processor.worker.ts`
- Modify: `thesis-validator/src/workers/index.ts`

**Step 1: Write the worker implementation**

Create `thesis-validator/src/workers/document-processor.worker.ts`:

```typescript
/**
 * Document Processor Worker
 *
 * BullMQ worker that processes uploaded documents
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { readFile } from 'fs/promises';
import { DocumentRepository, EvidenceRepository } from '../repositories/index.js';
import { getDocumentParser } from '../tools/document-parser.js';
import { getEmbeddingService } from '../tools/embedding.js';

const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];

export interface DocumentJobData {
  documentId: string;
  engagementId: string;
  storagePath: string;
  mimeType: string;
}

function createRedisConnection(): Redis {
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null,
  });
}

const documentRepo = new DocumentRepository();
const evidenceRepo = new EvidenceRepository();

/**
 * Process a document job
 */
async function processDocument(job: Job<DocumentJobData>): Promise<{ chunkCount: number; evidenceIds: string[] }> {
  const { documentId, engagementId, storagePath, mimeType } = job.data;

  console.log(`[DocumentWorker] Processing document ${documentId}`);

  // Update status to processing
  await documentRepo.updateStatus(documentId, 'processing');

  try {
    // Read file from storage
    const buffer = await readFile(storagePath);

    // Parse document
    const parser = getDocumentParser();
    const parsed = await parser.parseBuffer(buffer, storagePath, mimeType);

    // Create evidence records for each chunk
    const evidenceIds: string[] = [];
    const embeddingService = getEmbeddingService();

    for (const chunk of parsed.chunks) {
      // Create evidence record
      const evidence = await evidenceRepo.create({
        engagementId,
        content: chunk.content,
        sourceType: 'document',
        sourceTitle: parsed.metadata.title ?? parsed.filename,
        documentId,
        metadata: {
          chunkIndex: chunk.chunkIndex,
          page: chunk.page,
          section: chunk.section,
        },
      });

      evidenceIds.push(evidence.id);

      // Generate and store embedding
      try {
        const embedding = await embeddingService.generateEmbedding(chunk.content);
        // Store in vector DB with evidence ID as key
        await embeddingService.storeEmbedding(evidence.id, embedding, {
          engagementId,
          type: 'evidence',
        });
      } catch (embeddingError) {
        console.warn(`[DocumentWorker] Failed to generate embedding for chunk ${chunk.id}:`, embeddingError);
      }

      // Update job progress
      await job.updateProgress((chunk.chunkIndex + 1) / parsed.chunks.length * 100);
    }

    // Update document status
    await documentRepo.updateStatus(documentId, 'completed', { chunkCount: parsed.chunks.length });

    console.log(`[DocumentWorker] Completed document ${documentId}: ${parsed.chunks.length} chunks`);

    return { chunkCount: parsed.chunks.length, evidenceIds };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DocumentWorker] Failed to process document ${documentId}:`, errorMessage);

    await documentRepo.updateStatus(documentId, 'failed', { errorMessage });

    throw error;
  }
}

/**
 * Start the document processor worker
 */
export function startDocumentProcessorWorker(): Worker<DocumentJobData> {
  const worker = new Worker<DocumentJobData>(
    'document-processing',
    processDocument,
    {
      connection: createRedisConnection(),
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[DocumentWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[DocumentWorker] Job ${job?.id} failed:`, error.message);
  });

  console.log('[DocumentWorker] Started document processor worker');

  return worker;
}
```

**Step 2: Update workers index**

Add to `thesis-validator/src/workers/index.ts`:

```typescript
export { startDocumentProcessorWorker } from './document-processor.worker.js';
export type { DocumentJobData } from './document-processor.worker.js';
```

**Step 3: Commit**

```bash
git add src/workers/document-processor.worker.ts src/workers/index.ts
git commit -m "feat(worker): add BullMQ document processor worker"
```

---

## Task 7: Update Evidence API Routes

**Files:**
- Modify: `thesis-validator/src/api/routes/evidence.ts`

**Step 1: Replace in-memory storage with repositories**

Update the imports and add repositories:

```typescript
import { EvidenceRepository, DocumentRepository } from '../../repositories/index.js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { DocumentJobData } from '../../workers/index.js';

const evidenceRepo = new EvidenceRepository();
const documentRepo = new DocumentRepository();

// BullMQ queue for document processing
const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];

const documentQueue = new Queue<DocumentJobData>('document-processing', {
  connection: new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null,
  }),
});
```

**Step 2: Update GET /evidence endpoint**

Replace the handler to use EvidenceRepository:

```typescript
fastify.get(
  '/:engagementId/evidence',
  {
    preHandler: requireEngagementAccess('viewer'),
  },
  async (request, reply) => {
    const { engagementId } = request.params;
    const { source_type, sentiment, min_credibility, hypothesis_id, limit, offset } = request.query;

    const evidence = await evidenceRepo.getByEngagement(engagementId, {
      sourceType: source_type,
      sentiment,
      minCredibility: min_credibility,
      hypothesisId: hypothesis_id,
      limit,
      offset,
    });

    reply.send({
      evidence,
      total: evidence.length,
      limit,
      offset,
    });
  }
);
```

**Step 3: Add GET /evidence/stats endpoint**

Add new endpoint:

```typescript
fastify.get(
  '/:engagementId/evidence/stats',
  {
    preHandler: requireEngagementAccess('viewer'),
  },
  async (request, reply) => {
    const { engagementId } = request.params;
    const stats = await evidenceRepo.getStats(engagementId);
    reply.send({ stats });
  }
);
```

**Step 4: Update POST /documents to use BullMQ**

Replace the document upload handler:

```typescript
fastify.post(
  '/:engagementId/documents',
  {
    preHandler: requireEngagementAccess('editor'),
  },
  async (request, reply) => {
    const user = (request as AuthenticatedRequest).user;
    const { engagementId } = request.params;

    const data = await request.file();
    if (!data) {
      reply.status(400).send({ error: 'Bad Request', message: 'No file uploaded' });
      return;
    }

    // Determine format from mime type
    let format: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'html' | 'image' | 'unknown' = 'unknown';
    if (data.mimetype.includes('pdf')) format = 'pdf';
    else if (data.mimetype.includes('wordprocessingml')) format = 'docx';
    else if (data.mimetype.includes('spreadsheetml')) format = 'xlsx';
    else if (data.mimetype.includes('presentationml')) format = 'pptx';
    else if (data.mimetype.includes('html')) format = 'html';
    else if (data.mimetype.startsWith('image/')) format = 'image';

    // Save file to temp storage (in production, use cloud storage)
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    const storagePath = `/tmp/documents/${crypto.randomUUID()}_${data.filename}`;
    const fs = await import('fs/promises');
    await fs.mkdir('/tmp/documents', { recursive: true });
    await fs.writeFile(storagePath, buffer);

    // Create document record
    const document = await documentRepo.create({
      engagementId,
      filename: data.filename,
      originalFilename: data.filename,
      format,
      mimeType: data.mimetype,
      sizeBytes: buffer.length,
      storagePath,
      uploadedBy: user.id,
    });

    // Queue for processing
    await documentQueue.add('process', {
      documentId: document.id,
      engagementId,
      storagePath,
      mimeType: data.mimetype,
    });

    reply.status(202).send({
      document_id: document.id,
      message: 'Document uploaded, processing started',
      status: 'pending',
    });
  }
);
```

**Step 5: Update GET /documents/:id to use repository**

```typescript
fastify.get(
  '/:engagementId/documents/:documentId',
  {
    preHandler: requireEngagementAccess('viewer'),
  },
  async (request, reply) => {
    const { engagementId, documentId } = request.params;
    const document = await documentRepo.getById(documentId);

    if (!document || document.engagementId !== engagementId) {
      reply.status(404).send({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    reply.send({ document });
  }
);
```

**Step 6: Commit**

```bash
git add src/api/routes/evidence.ts
git commit -m "feat(api): update evidence routes to use PostgreSQL repositories"
```

---

## Task 8: Add Frontend Types and API Client

**Files:**
- Modify: `dashboard-ui/src/types/api.ts`
- Modify: `dashboard-ui/src/lib/api-client.ts`

**Step 1: Add evidence types to api.ts**

Add to `dashboard-ui/src/types/api.ts`:

```typescript
// Evidence types
export interface Evidence {
  id: string;
  engagementId: string;
  content: string;
  sourceType: 'web' | 'document' | 'expert' | 'data' | 'filing' | 'financial';
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourcePublicationDate: string | null;
  credibility: number | null;
  sentiment: 'supporting' | 'neutral' | 'contradicting';
  documentId: string | null;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
  retrievedAt: string | null;
  createdAt: string;
  linkedHypotheses?: Array<{ hypothesisId: string; relevanceScore: number }>;
}

export interface EvidenceFilters {
  sourceType?: Evidence['sourceType'];
  sentiment?: Evidence['sentiment'];
  minCredibility?: number;
  hypothesisId?: string;
  limit?: number;
  offset?: number;
}

export interface EvidenceStats {
  totalCount: number;
  bySourceType: Record<string, number>;
  bySentiment: Record<string, number>;
  averageCredibility: number;
  hypothesisCoverage: number;
}

export interface Document {
  id: string;
  engagementId: string;
  filename: string;
  originalFilename: string;
  format: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'html' | 'image' | 'unknown';
  mimeType: string | null;
  sizeBytes: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  errorMessage: string | null;
  uploadedAt: string;
  processedAt: string | null;
}
```

**Step 2: Add evidence methods to api-client.ts**

Add to `ThesisValidatorClient` class:

```typescript
// Evidence
async getEvidence(engagementId: string, filters?: EvidenceFilters): Promise<{ evidence: Evidence[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.sourceType) params.set('source_type', filters.sourceType);
  if (filters?.sentiment) params.set('sentiment', filters.sentiment);
  if (filters?.minCredibility) params.set('min_credibility', String(filters.minCredibility));
  if (filters?.hypothesisId) params.set('hypothesis_id', filters.hypothesisId);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const response = await this.client.get(`/api/v1/engagements/${engagementId}/evidence?${params}`);
  return response.data;
}

async getEvidenceById(engagementId: string, evidenceId: string): Promise<{ evidence: Evidence }> {
  const response = await this.client.get(`/api/v1/engagements/${engagementId}/evidence/${evidenceId}`);
  return response.data;
}

async getEvidenceStats(engagementId: string): Promise<{ stats: EvidenceStats }> {
  const response = await this.client.get(`/api/v1/engagements/${engagementId}/evidence/stats`);
  return response.data;
}

async updateEvidence(
  engagementId: string,
  evidenceId: string,
  data: { credibility?: number; sentiment?: Evidence['sentiment'] }
): Promise<{ evidence: Evidence }> {
  const response = await this.client.patch(`/api/v1/engagements/${engagementId}/evidence/${evidenceId}`, data);
  return response.data;
}

// Documents
async getDocuments(engagementId: string, status?: Document['status']): Promise<{ documents: Document[]; total: number }> {
  const params = status ? `?status=${status}` : '';
  const response = await this.client.get(`/api/v1/engagements/${engagementId}/documents${params}`);
  return response.data;
}

async getDocument(engagementId: string, documentId: string): Promise<{ document: Document }> {
  const response = await this.client.get(`/api/v1/engagements/${engagementId}/documents/${documentId}`);
  return response.data;
}

async uploadDocument(engagementId: string, file: File): Promise<{ document_id: string; status: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await this.client.post(`/api/v1/engagements/${engagementId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}
```

**Step 3: Commit**

```bash
git add src/types/api.ts src/lib/api-client.ts
git commit -m "feat(ui): add evidence and document API client methods"
```

---

## Task 9: Install recharts and Create Evidence Hooks

**Files:**
- Modify: `dashboard-ui/package.json`
- Create: `dashboard-ui/src/hooks/useEvidence.ts`

**Step 1: Install recharts**

Run: `cd dashboard-ui && npm install recharts`

**Step 2: Create useEvidence hooks**

Create `dashboard-ui/src/hooks/useEvidence.ts`:

```typescript
/**
 * React hooks for evidence management
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { Evidence, EvidenceFilters, EvidenceStats, Document } from '../types/api';

export function useEvidenceList(engagementId: string | null, filters?: EvidenceFilters) {
  return useQuery({
    queryKey: ['evidence', engagementId, filters],
    queryFn: () => apiClient.getEvidence(engagementId!, filters),
    enabled: !!engagementId,
  });
}

export function useEvidence(engagementId: string | null, evidenceId: string | null) {
  return useQuery({
    queryKey: ['evidence', engagementId, evidenceId],
    queryFn: () => apiClient.getEvidenceById(engagementId!, evidenceId!),
    enabled: !!engagementId && !!evidenceId,
  });
}

export function useEvidenceStats(engagementId: string | null) {
  return useQuery<{ stats: EvidenceStats }>({
    queryKey: ['evidenceStats', engagementId],
    queryFn: () => apiClient.getEvidenceStats(engagementId!),
    enabled: !!engagementId,
  });
}

export function useUpdateEvidence(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ evidenceId, data }: { evidenceId: string; data: { credibility?: number; sentiment?: Evidence['sentiment'] } }) =>
      apiClient.updateEvidence(engagementId, evidenceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['evidenceStats', engagementId] });
    },
  });
}

export function useDocuments(engagementId: string | null, status?: Document['status']) {
  return useQuery({
    queryKey: ['documents', engagementId, status],
    queryFn: () => apiClient.getDocuments(engagementId!, status),
    enabled: !!engagementId,
    refetchInterval: (data) => {
      // Poll more frequently if any documents are processing
      const hasProcessing = data?.state.data?.documents.some(d => d.status === 'pending' || d.status === 'processing');
      return hasProcessing ? 3000 : false;
    },
  });
}

export function useUploadDocument(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => apiClient.uploadDocument(engagementId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', engagementId] });
    },
  });
}
```

**Step 3: Commit**

```bash
git add package.json package-lock.json src/hooks/useEvidence.ts
git commit -m "feat(ui): add useEvidence hooks and recharts dependency"
```

---

## Task 10: Create Evidence Explorer Component

**Files:**
- Create: `dashboard-ui/src/components/evidence/EvidenceExplorer.tsx`
- Create: `dashboard-ui/src/components/evidence/EvidenceCard.tsx`
- Create: `dashboard-ui/src/components/evidence/index.ts`

**Step 1: Create EvidenceCard component**

Create `dashboard-ui/src/components/evidence/EvidenceCard.tsx`:

```typescript
/**
 * Evidence card component for list display
 */
import type { Evidence } from '../../types/api';

interface EvidenceCardProps {
  evidence: Evidence;
  onClick: () => void;
}

const sourceTypeColors: Record<Evidence['sourceType'], string> = {
  web: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  document: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  expert: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  data: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  filing: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  financial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

const sentimentColors: Record<Evidence['sentiment'], string> = {
  supporting: 'text-green-600 dark:text-green-400',
  neutral: 'text-gray-600 dark:text-gray-400',
  contradicting: 'text-red-600 dark:text-red-400',
};

export function EvidenceCard({ evidence, onClick }: EvidenceCardProps) {
  const credibilityPercent = evidence.credibility ? Math.round(evidence.credibility * 100) : null;

  return (
    <div
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${sourceTypeColors[evidence.sourceType]}`}>
          {evidence.sourceType}
        </span>
        {credibilityPercent !== null && (
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {credibilityPercent}% credibility
          </span>
        )}
      </div>

      {evidence.sourceTitle && (
        <h3 className="font-medium text-gray-900 dark:text-white mb-1 line-clamp-1">
          {evidence.sourceTitle}
        </h3>
      )}

      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-2">
        {evidence.content}
      </p>

      <div className="flex items-center justify-between text-xs">
        <span className={sentimentColors[evidence.sentiment]}>
          {evidence.sentiment}
        </span>
        <span className="text-gray-500 dark:text-gray-500">
          {new Date(evidence.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
```

**Step 2: Create EvidenceExplorer component**

Create `dashboard-ui/src/components/evidence/EvidenceExplorer.tsx`:

```typescript
/**
 * Evidence Explorer - filterable list of evidence
 */
import { useState } from 'react';
import { useEvidenceList } from '../../hooks/useEvidence';
import { EvidenceCard } from './EvidenceCard';
import type { Evidence, EvidenceFilters } from '../../types/api';

interface EvidenceExplorerProps {
  engagementId: string;
  onSelectEvidence: (evidence: Evidence) => void;
}

export function EvidenceExplorer({ engagementId, onSelectEvidence }: EvidenceExplorerProps) {
  const [filters, setFilters] = useState<EvidenceFilters>({ limit: 20 });
  const { data, isLoading } = useEvidenceList(engagementId, filters);

  const handleFilterChange = (key: keyof EvidenceFilters, value: string | undefined) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <select
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          value={filters.sourceType ?? ''}
          onChange={(e) => handleFilterChange('sourceType', e.target.value)}
        >
          <option value="">All Sources</option>
          <option value="web">Web</option>
          <option value="document">Document</option>
          <option value="expert">Expert</option>
          <option value="data">Data</option>
          <option value="filing">Filing</option>
          <option value="financial">Financial</option>
        </select>

        <select
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          value={filters.sentiment ?? ''}
          onChange={(e) => handleFilterChange('sentiment', e.target.value)}
        >
          <option value="">All Sentiments</option>
          <option value="supporting">Supporting</option>
          <option value="neutral">Neutral</option>
          <option value="contradicting">Contradicting</option>
        </select>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Min Credibility:</label>
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            value={(filters.minCredibility ?? 0) * 100}
            onChange={(e) => handleFilterChange('minCredibility', String(parseInt(e.target.value) / 100))}
            className="w-24"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {Math.round((filters.minCredibility ?? 0) * 100)}%
          </span>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {data?.total ?? 0} evidence items
      </div>

      {/* Evidence grid */}
      {data?.evidence && data.evidence.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.evidence.map((evidence) => (
            <EvidenceCard
              key={evidence.id}
              evidence={evidence}
              onClick={() => onSelectEvidence(evidence)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No evidence found
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create index.ts**

Create `dashboard-ui/src/components/evidence/index.ts`:

```typescript
export { EvidenceExplorer } from './EvidenceExplorer';
export { EvidenceCard } from './EvidenceCard';
```

**Step 4: Commit**

```bash
git add src/components/evidence/
git commit -m "feat(ui): add EvidenceExplorer and EvidenceCard components"
```

---

## Task 11: Create Evidence Detail Panel

**Files:**
- Create: `dashboard-ui/src/components/evidence/EvidenceDetailPanel.tsx`
- Modify: `dashboard-ui/src/components/evidence/index.ts`

**Step 1: Create EvidenceDetailPanel**

Create `dashboard-ui/src/components/evidence/EvidenceDetailPanel.tsx`:

```typescript
/**
 * Evidence detail panel
 */
import { X, ExternalLink } from 'lucide-react';
import type { Evidence } from '../../types/api';

interface EvidenceDetailPanelProps {
  evidence: Evidence;
  onClose: () => void;
  onUpdateSentiment?: (sentiment: Evidence['sentiment']) => void;
}

export function EvidenceDetailPanel({ evidence, onClose, onUpdateSentiment }: EvidenceDetailPanelProps) {
  const credibilityPercent = evidence.credibility ? Math.round(evidence.credibility * 100) : null;

  return (
    <div className="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 w-96 h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white">Evidence Details</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Source info */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Source</h3>
          <div className="space-y-1">
            {evidence.sourceTitle && (
              <p className="font-medium text-gray-900 dark:text-white">{evidence.sourceTitle}</p>
            )}
            {evidence.sourceAuthor && (
              <p className="text-sm text-gray-600 dark:text-gray-400">By {evidence.sourceAuthor}</p>
            )}
            {evidence.sourceUrl && (
              <a
                href={evidence.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                View source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Content */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Content</h3>
          <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{evidence.content}</p>
        </div>

        {/* Credibility */}
        {credibilityPercent !== null && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Credibility</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    credibilityPercent >= 70 ? 'bg-green-500' :
                    credibilityPercent >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${credibilityPercent}%` }}
                />
              </div>
              <span className="font-bold text-gray-900 dark:text-white">{credibilityPercent}%</span>
            </div>
          </div>
        )}

        {/* Sentiment */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Sentiment</h3>
          <div className="flex gap-2">
            {(['supporting', 'neutral', 'contradicting'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onUpdateSentiment?.(s)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  evidence.sentiment === s
                    ? s === 'supporting' ? 'bg-green-100 text-green-800 border-green-300' :
                      s === 'contradicting' ? 'bg-red-100 text-red-800 border-red-300' :
                      'bg-gray-100 text-gray-800 border-gray-300'
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Linked Hypotheses */}
        {evidence.linkedHypotheses && evidence.linkedHypotheses.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Linked Hypotheses ({evidence.linkedHypotheses.length})
            </h3>
            <div className="space-y-2">
              {evidence.linkedHypotheses.map((link) => (
                <div key={link.hypothesisId} className="text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <span className="text-gray-600 dark:text-gray-400">
                    Relevance: {Math.round(link.relevanceScore * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Metadata</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">Type</dt>
              <dd className="text-gray-900 dark:text-white">{evidence.sourceType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900 dark:text-white">
                {new Date(evidence.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update index.ts**

Add to `dashboard-ui/src/components/evidence/index.ts`:

```typescript
export { EvidenceDetailPanel } from './EvidenceDetailPanel';
```

**Step 3: Commit**

```bash
git add src/components/evidence/
git commit -m "feat(ui): add EvidenceDetailPanel component"
```

---

## Task 12: Create Research Quality Charts

**Files:**
- Create: `dashboard-ui/src/components/evidence/ResearchQualityPanel.tsx`
- Modify: `dashboard-ui/src/components/evidence/index.ts`

**Step 1: Create ResearchQualityPanel**

Create `dashboard-ui/src/components/evidence/ResearchQualityPanel.tsx`:

```typescript
/**
 * Research quality metrics panel with charts
 */
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useEvidenceStats } from '../../hooks/useEvidence';

interface ResearchQualityPanelProps {
  engagementId: string;
}

const SOURCE_COLORS: Record<string, string> = {
  web: '#3B82F6',
  document: '#8B5CF6',
  expert: '#10B981',
  data: '#F59E0B',
  filing: '#6B7280',
  financial: '#EAB308',
};

const SENTIMENT_COLORS: Record<string, string> = {
  supporting: '#22C55E',
  neutral: '#9CA3AF',
  contradicting: '#EF4444',
};

export function ResearchQualityPanel({ engagementId }: ResearchQualityPanelProps) {
  const { data, isLoading } = useEvidenceStats(engagementId);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const { stats } = data;

  const sourceData = Object.entries(stats.bySourceType).map(([name, value]) => ({
    name,
    value,
    color: SOURCE_COLORS[name] ?? '#6B7280',
  }));

  const sentimentData = Object.entries(stats.bySentiment).map(([name, value]) => ({
    name,
    value,
    color: SENTIMENT_COLORS[name] ?? '#6B7280',
  }));

  const credibilityPercent = Math.round(stats.averageCredibility * 100);
  const coveragePercent = Math.round(stats.hypothesisCoverage * 100);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalCount}</div>
          <div className="text-sm text-gray-500">Total Evidence</div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{credibilityPercent}%</div>
          <div className="text-sm text-gray-500">Avg Credibility</div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{coveragePercent}%</div>
          <div className="text-sm text-gray-500">Hypothesis Coverage</div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {Object.keys(stats.bySourceType).length}
          </div>
          <div className="text-sm text-gray-500">Source Types</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Source Diversity Pie */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">Source Diversity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={sourceData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
              >
                {sourceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment Bar */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">Sentiment Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sentimentData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value">
                {sentimentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update index.ts**

Add to `dashboard-ui/src/components/evidence/index.ts`:

```typescript
export { ResearchQualityPanel } from './ResearchQualityPanel';
```

**Step 3: Commit**

```bash
git add src/components/evidence/
git commit -m "feat(ui): add ResearchQualityPanel with recharts visualizations"
```

---

## Task 13: Integrate Evidence Tab into EngagementDetail

**Files:**
- Modify: `dashboard-ui/src/components/engagement/EngagementDetail.tsx`

**Step 1: Add imports and state**

Add to imports:

```typescript
import { EvidenceExplorer, EvidenceDetailPanel, ResearchQualityPanel } from '../evidence';
import type { Evidence } from '../../types/api';
```

Add to component state:

```typescript
const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
```

**Step 2: Add Evidence tab to tab list**

Add "Evidence" to the tabs array alongside existing tabs.

**Step 3: Add Evidence tab content**

Add tab content section:

```typescript
{activeTab === 'evidence' && (
  <div className="space-y-6">
    <ResearchQualityPanel engagementId={engagementId} />

    <div className="flex h-[600px]">
      <div className="flex-1 overflow-auto">
        <EvidenceExplorer
          engagementId={engagementId}
          onSelectEvidence={setSelectedEvidence}
        />
      </div>
      {selectedEvidence && (
        <EvidenceDetailPanel
          evidence={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
        />
      )}
    </div>
  </div>
)}
```

**Step 4: Commit**

```bash
git add src/components/engagement/EngagementDetail.tsx
git commit -m "feat(ui): integrate evidence tab into EngagementDetail"
```

---

## Task 14: Run Full Tests and Final Commit

**Step 1: Run backend tests**

Run: `cd thesis-validator && npm test`

Expected: All tests pass (54 passed, 4 pre-existing failures)

**Step 2: Run frontend build**

Run: `cd dashboard-ui && npm run build`

Expected: Build succeeds with no TypeScript errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Slice 2 - Evidence Management

- PostgreSQL tables for evidence, documents, evidence_hypotheses
- EvidenceRepository and DocumentRepository with full CRUD
- Real document parsers (PDF, DOCX, XLSX, HTML, OCR with Tesseract)
- BullMQ document processor worker
- Evidence API routes using PostgreSQL
- Evidence Explorer UI with filtering
- Research quality charts with recharts
- Evidence tab integrated into EngagementDetail

Closes: Slice 2 of full workflow build-out"
```

---

## Success Criteria Checklist

- [ ] Evidence and documents tables created via migration
- [ ] EvidenceRepository and DocumentRepository with full CRUD
- [ ] Document parsers work for PDF, DOCX, XLSX, HTML, OCR
- [ ] BullMQ worker processes documents asynchronously
- [ ] Evidence API routes use PostgreSQL
- [ ] `/evidence/stats` endpoint returns quality metrics
- [ ] Evidence Explorer UI with filtering
- [ ] Research quality charts display
- [ ] Evidence tab integrated into EngagementDetail
- [ ] All tests pass
- [ ] TypeScript compiles without errors
