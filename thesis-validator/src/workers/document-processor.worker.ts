/**
 * Document Processor Worker
 *
 * BullMQ worker that processes uploaded documents
 */

import { Worker, Job, Queue } from 'bullmq';
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
          ...(chunk.page !== undefined ? { page: chunk.page } : {}),
          ...(chunk.section !== undefined ? { section: chunk.section } : {}),
        },
      });

      evidenceIds.push(evidence.id);

      // Generate embedding (store in metadata for now, vector DB integration later)
      try {
        const embedding = await embeddingService.embed(chunk.content);
        // Store embedding reference in metadata
        await evidenceRepo.update(evidence.id, {
          metadata: {
            ...evidence.metadata,
            hasEmbedding: true,
            embeddingDimensions: embedding.length,
          },
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

/**
 * Create document processing queue
 */
export function createDocumentQueue(): Queue<DocumentJobData> {
  return new Queue<DocumentJobData>('document-processing', {
    connection: createRedisConnection(),
  });
}
