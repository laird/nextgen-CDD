/**
 * Evidence Routes
 *
 * REST API endpoints for evidence and document management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  authHook,
  requireEngagementAccess,
  type AuthenticatedRequest,
} from '../middleware/index.js';
import { getEngagement } from './engagements.js';
import { createDealMemory } from '../../memory/index.js';
import {
  CreateEvidenceRequestSchema,
  EvidenceBatchInsertRequestSchema,
  createEvidenceNode,
  type EvidenceNode,
  type ContradictionNode,
} from '../../models/index.js';
import { parseDocument, extractTextFromChunks } from '../../tools/index.js';

/**
 * Document metadata store
 */
interface DocumentRecord {
  id: string;
  engagementId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: number;
  status: 'processing' | 'ready' | 'failed';
  chunkCount?: number;
  error?: string;
}

const documentStore = new Map<string, DocumentRecord>();

/**
 * Register evidence routes
 */
export async function registerEvidenceRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authHook);

  /**
   * Get evidence for engagement
   * GET /engagements/:engagementId/evidence
   */
  fastify.get(
    '/:engagementId/evidence',
    {
      preHandler: requireEngagementAccess('viewer'),
      schema: {
        querystring: z.object({
          query: z.string().optional(),
          hypothesis_id: z.string().uuid().optional(),
          source_type: z.string().optional(),
          sentiment: z.enum(['supporting', 'contradicting', 'neutral']).optional(),
          min_credibility: z.coerce.number().min(0).max(1).optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Querystring: {
          query?: string;
          hypothesis_id?: string;
          source_type?: string;
          sentiment?: 'supporting' | 'contradicting' | 'neutral';
          min_credibility?: number;
          limit: number;
          offset: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { query, hypothesis_id, source_type, sentiment, min_credibility, limit, offset } =
        request.query;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = createDealMemory();

      // Search evidence
      let evidence = await dealMemory.searchEvidence(
        engagementId,
        query ?? '',
        limit + offset + 100 // Get extra for filtering
      );

      // Apply filters
      if (hypothesis_id) {
        evidence = evidence.filter((e) => e.hypothesis_ids.includes(hypothesis_id));
      }
      if (source_type) {
        evidence = evidence.filter((e) => e.source.type === source_type);
      }
      if (sentiment) {
        evidence = evidence.filter((e) => e.sentiment === sentiment);
      }
      if (min_credibility !== undefined) {
        evidence = evidence.filter((e) => e.credibility_score >= min_credibility);
      }

      // Apply pagination
      const total = evidence.length;
      const paginated = evidence.slice(offset, offset + limit);

      reply.send({
        evidence: paginated,
        total,
        limit,
        offset,
      });
    }
  );

  /**
   * Get single evidence with provenance
   * GET /engagements/:engagementId/evidence/:evidenceId
   */
  fastify.get(
    '/:engagementId/evidence/:evidenceId',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; evidenceId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, evidenceId } = request.params;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = createDealMemory();
      const evidence = await dealMemory.searchEvidence(engagementId, '', 1000);
      const item = evidence.find((e) => e.id === evidenceId);

      if (!item) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Evidence not found',
        });
        return;
      }

      reply.send({
        evidence: item,
        provenance: item.provenance,
      });
    }
  );

  /**
   * Add evidence manually
   * POST /engagements/:engagementId/evidence
   */
  fastify.post(
    '/:engagementId/evidence',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: CreateEvidenceRequestSchema,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: z.infer<typeof CreateEvidenceRequestSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;
      const evidenceRequest = request.body;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Create evidence node
      const evidence = createEvidenceNode(evidenceRequest, user.id);

      // Store in deal memory
      const dealMemory = createDealMemory();
      await dealMemory.storeEvidence(engagementId, evidence);

      reply.status(201).send({
        evidence,
        message: 'Evidence added successfully',
      });
    }
  );

  /**
   * Batch add evidence
   * POST /engagements/:engagementId/evidence/batch
   */
  fastify.post(
    '/:engagementId/evidence/batch',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: EvidenceBatchInsertRequestSchema,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: z.infer<typeof EvidenceBatchInsertRequestSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;
      const { evidence: evidenceRequests } = request.body;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = createDealMemory();
      const created: EvidenceNode[] = [];
      const errors: { index: number; error: string }[] = [];

      for (let i = 0; i < evidenceRequests.length; i++) {
        try {
          const evidence = createEvidenceNode(evidenceRequests[i]!, user.id);
          await dealMemory.storeEvidence(engagementId, evidence);
          created.push(evidence);
        } catch (error) {
          errors.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      reply.status(201).send({
        created_count: created.length,
        error_count: errors.length,
        evidence: created,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  );

  /**
   * Get contradictions for engagement
   * GET /engagements/:engagementId/contradictions
   */
  fastify.get(
    '/:engagementId/contradictions',
    {
      preHandler: requireEngagementAccess('viewer'),
      schema: {
        querystring: z.object({
          hypothesis_id: z.string().uuid().optional(),
          severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          status: z.enum(['pending', 'investigating', 'resolved', 'dismissed']).optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Querystring: {
          hypothesis_id?: string;
          severity?: 'low' | 'medium' | 'high' | 'critical';
          status?: 'pending' | 'investigating' | 'resolved' | 'dismissed';
          limit: number;
          offset: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { hypothesis_id, severity, status, limit, offset } = request.query;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const dealMemory = createDealMemory();
      let contradictions = await dealMemory.searchContradictions(engagementId, '', 200);

      // Apply filters
      if (hypothesis_id) {
        contradictions = contradictions.filter((c) => c.hypothesis_id === hypothesis_id);
      }
      if (severity) {
        contradictions = contradictions.filter((c) => c.severity === severity);
      }
      if (status) {
        contradictions = contradictions.filter((c) => c.status === status);
      }

      // Apply pagination
      const total = contradictions.length;
      const paginated = contradictions.slice(offset, offset + limit);

      reply.send({
        contradictions: paginated,
        total,
        limit,
        offset,
      });
    }
  );

  /**
   * Update contradiction status
   * PATCH /engagements/:engagementId/contradictions/:contradictionId
   */
  fastify.patch(
    '/:engagementId/contradictions/:contradictionId',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          status: z.enum(['pending', 'investigating', 'resolved', 'dismissed']).optional(),
          resolution_notes: z.string().optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; contradictionId: string };
        Body: {
          status?: 'pending' | 'investigating' | 'resolved' | 'dismissed';
          resolution_notes?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, contradictionId } = request.params;
      const updates = request.body;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Note: In production, this would update the contradiction in the database
      reply.send({
        message: 'Contradiction updated',
        updates,
      });
    }
  );

  /**
   * Upload document
   * POST /engagements/:engagementId/documents
   */
  fastify.post(
    '/:engagementId/documents',
    {
      preHandler: requireEngagementAccess('editor'),
    },
    async (request: FastifyRequest<{ Params: { engagementId: string } }>, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { engagementId } = request.params;

      const engagement = getEngagement(engagementId);
      if (!engagement) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Handle multipart upload
      const data = await request.file();
      if (!data) {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'No file uploaded',
        });
        return;
      }

      // Create document record
      const docId = crypto.randomUUID();
      const document: DocumentRecord = {
        id: docId,
        engagementId,
        filename: data.filename,
        contentType: data.mimetype,
        size: 0, // Would be calculated from stream
        uploadedBy: user.id,
        uploadedAt: Date.now(),
        status: 'processing',
      };
      documentStore.set(docId, document);

      // Process document asynchronously
      processDocumentAsync(document, data);

      reply.status(202).send({
        document_id: docId,
        message: 'Document uploaded, processing started',
        status_url: `/engagements/${engagementId}/documents/${docId}`,
      });
    }
  );

  /**
   * Get document status
   * GET /engagements/:engagementId/documents/:documentId
   */
  fastify.get(
    '/:engagementId/documents/:documentId',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; documentId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, documentId } = request.params;

      const document = documentStore.get(documentId);
      if (!document || document.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      reply.send({
        document: {
          id: document.id,
          filename: document.filename,
          content_type: document.contentType,
          size: document.size,
          uploaded_by: document.uploadedBy,
          uploaded_at: document.uploadedAt,
          status: document.status,
          chunk_count: document.chunkCount,
          error: document.error,
        },
      });
    }
  );

  /**
   * List documents for engagement
   * GET /engagements/:engagementId/documents
   */
  fastify.get(
    '/:engagementId/documents',
    {
      preHandler: requireEngagementAccess('viewer'),
      schema: {
        querystring: z.object({
          status: z.enum(['processing', 'ready', 'failed']).optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Querystring: { status?: 'processing' | 'ready' | 'failed'; limit: number; offset: number };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { status, limit, offset } = request.query;

      let documents = Array.from(documentStore.values()).filter(
        (d) => d.engagementId === engagementId
      );

      if (status) {
        documents = documents.filter((d) => d.status === status);
      }

      // Sort by upload date descending
      documents.sort((a, b) => b.uploadedAt - a.uploadedAt);

      const total = documents.length;
      const paginated = documents.slice(offset, offset + limit);

      reply.send({
        documents: paginated.map((d) => ({
          id: d.id,
          filename: d.filename,
          content_type: d.contentType,
          size: d.size,
          uploaded_at: d.uploadedAt,
          status: d.status,
        })),
        total,
        limit,
        offset,
      });
    }
  );

  /**
   * Delete document
   * DELETE /engagements/:engagementId/documents/:documentId
   */
  fastify.delete(
    '/:engagementId/documents/:documentId',
    {
      preHandler: requireEngagementAccess('editor'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; documentId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, documentId } = request.params;

      const document = documentStore.get(documentId);
      if (!document || document.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      documentStore.delete(documentId);

      // Note: In production, also delete from deal memory and storage

      reply.send({
        message: 'Document deleted successfully',
      });
    }
  );
}

/**
 * Process document asynchronously
 */
async function processDocumentAsync(
  document: DocumentRecord,
  fileData: { filename: string; mimetype: string; file: NodeJS.ReadableStream }
): Promise<void> {
  try {
    // Read file content
    const chunks: Buffer[] = [];
    for await (const chunk of fileData.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    document.size = buffer.length;

    // Determine format from mime type
    let format: 'pdf' | 'docx' | 'xlsx' | 'txt' | 'html' | 'json' = 'txt';
    if (fileData.mimetype.includes('pdf')) format = 'pdf';
    else if (fileData.mimetype.includes('wordprocessingml')) format = 'docx';
    else if (fileData.mimetype.includes('spreadsheetml')) format = 'xlsx';
    else if (fileData.mimetype.includes('html')) format = 'html';
    else if (fileData.mimetype.includes('json')) format = 'json';

    // Parse document
    const parseResult = await parseDocument(buffer, {
      format,
      chunk_size: 1000,
      chunk_overlap: 200,
      extract_tables: true,
      extract_metadata: true,
    });

    document.chunkCount = parseResult.chunks.length;
    document.status = 'ready';

    // Store chunks in deal memory
    const dealMemory = createDealMemory();
    await dealMemory.storeDocument(document.engagementId, {
      id: document.id,
      filename: document.filename,
      content: extractTextFromChunks(parseResult.chunks),
      metadata: parseResult.metadata,
      chunks: parseResult.chunks,
      uploadedAt: document.uploadedAt,
    });
  } catch (error) {
    document.status = 'failed';
    document.error = error instanceof Error ? error.message : 'Processing failed';
  }
}
