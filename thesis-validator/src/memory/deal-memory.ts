/**
 * Deal Memory - Per-engagement isolated memory namespace
 *
 * Contains all research artifacts for a single engagement:
 * - Hypothesis trees with causal relationships
 * - Evidence nodes with provenance
 * - Expert transcripts with speaker attribution
 * - Document embeddings from data room
 * - Research session logs
 */

import type {
  HypothesisNode,
  CausalEdge,
  HypothesisTree,
  EvidenceNode,
  ContradictionNode,
  CreateHypothesisRequest,
  CreateEvidenceRequest,
} from '../models/index.js';
import {
  createHypothesisNode,
  createCausalEdge,
  createEvidenceNode,
  createContradictionNode,
} from '../models/index.js';
import type { RuvectorClient, SearchOptions, SearchResult } from './ruvector-client.js';
import { getRuvectorClient } from './ruvector-client.js';

/**
 * Transcript chunk with speaker attribution
 */
export interface TranscriptChunk {
  id: string;
  call_id: string;
  speaker: string;
  text: string;
  timestamp: number;
  start_time_ms: number;
  end_time_ms: number;
  embedding?: Float32Array;
}

/**
 * Document metadata from data room
 */
export interface DocumentMetadata {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count?: number;
  uploaded_at: number;
  processed_at?: number;
  source_path: string;
  tags?: string[];
}

/**
 * Research session log entry
 */
export interface ResearchSessionLog {
  id: string;
  session_id: string;
  agent_id: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: number;
}

/**
 * Deal Memory Manager - Manages per-engagement memory
 */
export class DealMemory {
  private client: RuvectorClient;
  private engagementId: string;
  private namespaces: {
    hypotheses: string;
    evidence: string;
    transcripts: string;
    graph: string;
    documents: string;
    logs: string;
  };

  constructor(engagementId: string, client?: RuvectorClient) {
    this.client = client ?? getRuvectorClient();
    this.engagementId = engagementId;
    this.namespaces = {
      hypotheses: `deal_${engagementId}_hypotheses`,
      evidence: `deal_${engagementId}_evidence`,
      transcripts: `deal_${engagementId}_transcripts`,
      graph: `deal_${engagementId}_graph`,
      documents: `deal_${engagementId}_documents`,
      logs: `deal_${engagementId}_logs`,
    };
  }

  /**
   * Initialize deal memory namespaces
   */
  async initialize(): Promise<void> {
    for (const ns of Object.values(this.namespaces)) {
      await this.client.createNamespace(ns);
    }
  }

  /**
   * Clean up and delete all deal memory
   */
  async destroy(): Promise<void> {
    for (const ns of Object.values(this.namespaces)) {
      await this.client.deleteNamespace(ns);
    }
  }

  // =========== Hypothesis Operations ===========

  /**
   * Create a new hypothesis node
   */
  async createHypothesis(
    request: CreateHypothesisRequest,
    createdBy: string,
    embedding?: Float32Array
  ): Promise<HypothesisNode> {
    const hypothesis = createHypothesisNode({
      type: request.type,
      content: request.content,
      created_by: createdBy,
    });

    await this.client.insert(this.namespaces.hypotheses, {
      id: hypothesis.id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        type: hypothesis.type,
        status: hypothesis.status,
        confidence: hypothesis.confidence,
        created_at: hypothesis.metadata.created_at,
        created_by: hypothesis.metadata.created_by,
      },
      content: hypothesis.content,
    });

    // Create causal edge if parent specified
    if (request.parent_id && request.relationship) {
      const edgeParams: {
        source_id: string;
        target_id: string;
        relationship: CausalEdge['relationship'];
        strength?: number;
        reasoning?: string;
      } = {
        source_id: request.parent_id,
        target_id: hypothesis.id,
        relationship: request.relationship,
      };

      if (request.strength !== undefined) {
        edgeParams.strength = request.strength;
      }
      if (request.reasoning !== undefined) {
        edgeParams.reasoning = request.reasoning;
      }

      await this.addCausalEdge(edgeParams);
    }

    if (embedding !== undefined) {
      // Create a new Float32Array to ensure correct buffer type
      const embedArray = new Float32Array(embedding);
      return { ...hypothesis, embedding: embedArray };
    }
    return hypothesis;
  }

  /**
   * Get a hypothesis by ID
   */
  async getHypothesis(id: string): Promise<HypothesisNode | null> {
    const result = await this.client.get(this.namespaces.hypotheses, id);
    if (!result) return null;

    // Create a new Float32Array to ensure correct buffer type
    const embedding = new Float32Array(result.vector instanceof Float32Array ? result.vector : result.vector);
    return {
      id: result.id,
      type: result.metadata['type'] as HypothesisNode['type'],
      content: result.content ?? '',
      embedding,
      confidence: result.metadata['confidence'] as number,
      status: result.metadata['status'] as HypothesisNode['status'],
      metadata: {
        created_at: result.metadata['created_at'] as number,
        updated_at: result.metadata['updated_at'] as number ?? Date.now(),
        created_by: result.metadata['created_by'] as string,
        source_refs: (result.metadata['source_refs'] as string[]) ?? [],
      },
    };
  }

  /**
   * Update hypothesis confidence and status
   */
  async updateHypothesisConfidence(
    id: string,
    confidence: number,
    status?: HypothesisNode['status']
  ): Promise<void> {
    const existing = await this.client.get(this.namespaces.hypotheses, id);
    if (!existing) throw new Error(`Hypothesis not found: ${id}`);

    await this.client.insert(this.namespaces.hypotheses, {
      ...existing,
      metadata: {
        ...existing.metadata,
        confidence,
        status: status ?? existing.metadata['status'],
        updated_at: Date.now(),
      },
    });
  }

  /**
   * Search hypotheses semantically
   */
  async searchHypotheses(
    query: Float32Array,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult[]> {
    return this.client.search(this.namespaces.hypotheses, query, {
      top_k: 10,
      ...options,
    });
  }

  /**
   * Get all hypotheses for the engagement
   */
  async getAllHypotheses(): Promise<HypothesisNode[]> {
    const stats = await this.client.getNamespaceStats(this.namespaces.hypotheses);
    if (stats.vector_count === 0) return [];

    // Search with a zero vector to get all entries
    const results = await this.client.search(this.namespaces.hypotheses, new Float32Array(1536), {
      top_k: stats.vector_count,
      min_score: -Infinity,
    });

    return results.map((r) => ({
      id: r.id,
      type: r.metadata['type'] as HypothesisNode['type'],
      content: r.content ?? '',
      confidence: r.metadata['confidence'] as number,
      status: r.metadata['status'] as HypothesisNode['status'],
      metadata: {
        created_at: r.metadata['created_at'] as number,
        updated_at: r.metadata['updated_at'] as number ?? Date.now(),
        created_by: r.metadata['created_by'] as string,
        source_refs: (r.metadata['source_refs'] as string[]) ?? [],
      },
    }));
  }

  // =========== Causal Graph Operations ===========

  /**
   * Add a causal edge between hypotheses
   */
  async addCausalEdge(params: {
    source_id: string;
    target_id: string;
    relationship: CausalEdge['relationship'];
    strength?: number;
    reasoning?: string;
  }): Promise<CausalEdge> {
    const edge = createCausalEdge(params);

    await this.client.causalAddEdge(this.namespaces.graph, {
      source_id: edge.source_id,
      target_id: edge.target_id,
      relationship: edge.relationship,
      strength: edge.strength,
      metadata: { reasoning: edge.reasoning },
    });

    return edge;
  }

  /**
   * Query causal dependencies for a hypothesis
   */
  async queryCausalDependencies(
    hypothesisId: string,
    direction: 'upstream' | 'downstream' | 'both' = 'both',
    maxDepth = 3
  ): Promise<CausalEdge[]> {
    const results = await this.client.causalQuery(this.namespaces.graph, hypothesisId, {
      direction,
      max_depth: maxDepth,
    });

    return results.map((r) => ({
      id: r.id,
      source_id: r.source_id,
      target_id: r.target_id,
      relationship: r.relationship as CausalEdge['relationship'],
      strength: r.strength,
      reasoning: (r.metadata?.['reasoning'] as string) ?? '',
    }));
  }

  /**
   * Get the full hypothesis tree
   */
  async getHypothesisTree(rootThesisId: string): Promise<HypothesisTree | null> {
    const rootHypothesis = await this.getHypothesis(rootThesisId);
    if (!rootHypothesis) return null;

    const nodes = await this.getAllHypotheses();
    const edges = await this.queryCausalDependencies(rootThesisId, 'downstream', 10);

    return {
      id: crypto.randomUUID(),
      engagement_id: this.engagementId,
      root_thesis_id: rootThesisId,
      nodes,
      edges,
      created_at: rootHypothesis.metadata.created_at,
      updated_at: Date.now(),
    };
  }

  // =========== Evidence Operations ===========

  /**
   * Add evidence to deal memory
   */
  async addEvidence(
    request: CreateEvidenceRequest,
    embedding?: Float32Array
  ): Promise<EvidenceNode> {
    const evidenceParams: {
      content: string;
      source: EvidenceNode['source'];
      sentiment?: EvidenceNode['sentiment'];
      hypothesis_ids?: string[];
      tags?: string[];
    } = {
      content: request.content,
      source: request.source,
    };

    if (request.sentiment !== undefined) {
      evidenceParams.sentiment = request.sentiment;
    }
    if (request.hypothesis_ids !== undefined) {
      evidenceParams.hypothesis_ids = request.hypothesis_ids;
    }
    if (request.tags !== undefined) {
      evidenceParams.tags = request.tags;
    }

    const evidence = createEvidenceNode(evidenceParams);

    await this.client.insert(this.namespaces.evidence, {
      id: evidence.id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        source_type: evidence.source.type,
        source_url: evidence.source.url,
        credibility_score: evidence.source.credibility_score,
        sentiment: evidence.sentiment,
        hypothesis_ids: evidence.relevance.hypothesis_ids,
        tags: evidence.tags,
        created_at: evidence.created_at,
      },
      content: evidence.content,
    });

    if (embedding !== undefined) {
      // Create a new Float32Array to ensure correct buffer type
      const embedArray = new Float32Array(embedding);
      return { ...evidence, embedding: embedArray };
    }
    return evidence;
  }

  /**
   * Get evidence by ID
   */
  async getEvidence(id: string): Promise<EvidenceNode | null> {
    const result = await this.client.get(this.namespaces.evidence, id);
    if (!result) return null;

    // Create a new Float32Array to ensure correct buffer type
    const embedding = new Float32Array(result.vector instanceof Float32Array ? result.vector : result.vector);
    return {
      id: result.id,
      content: result.content ?? '',
      embedding,
      source: {
        type: result.metadata['source_type'] as EvidenceNode['source']['type'],
        url: result.metadata['source_url'] as string | undefined,
        retrieved_at: result.metadata['created_at'] as number,
        credibility_score: result.metadata['credibility_score'] as number,
      },
      relevance: {
        hypothesis_ids: (result.metadata['hypothesis_ids'] as string[]) ?? [],
        relevance_scores: [],
      },
      sentiment: result.metadata['sentiment'] as EvidenceNode['sentiment'],
      tags: (result.metadata['tags'] as string[]) ?? [],
      created_at: result.metadata['created_at'] as number,
      updated_at: Date.now(),
    };
  }

  /**
   * Search evidence semantically
   */
  async searchEvidence(
    query: Float32Array,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult[]> {
    return this.client.recallWithCertificate(this.namespaces.evidence, query, {
      top_k: 10,
      ...options,
    });
  }

  /**
   * Get evidence for a specific hypothesis
   */
  async getEvidenceForHypothesis(hypothesisId: string): Promise<EvidenceNode[]> {
    const stats = await this.client.getNamespaceStats(this.namespaces.evidence);
    if (stats.vector_count === 0) return [];

    const results = await this.client.search(this.namespaces.evidence, new Float32Array(1536), {
      top_k: stats.vector_count,
      min_score: -Infinity,
      filter: { hypothesis_ids: hypothesisId },
    });

    return results.map((r) => ({
      id: r.id,
      content: r.content ?? '',
      source: {
        type: r.metadata['source_type'] as EvidenceNode['source']['type'],
        url: r.metadata['source_url'] as string | undefined,
        retrieved_at: r.metadata['created_at'] as number,
        credibility_score: r.metadata['credibility_score'] as number,
      },
      relevance: {
        hypothesis_ids: (r.metadata['hypothesis_ids'] as string[]) ?? [],
        relevance_scores: [],
      },
      sentiment: r.metadata['sentiment'] as EvidenceNode['sentiment'],
      tags: (r.metadata['tags'] as string[]) ?? [],
      created_at: r.metadata['created_at'] as number,
      updated_at: Date.now(),
    }));
  }

  // =========== Contradiction Operations ===========

  /**
   * Add a contradiction
   */
  async addContradiction(params: {
    evidence_id: string;
    hypothesis_id: string;
    severity: number;
    explanation: string;
  }): Promise<ContradictionNode> {
    const contradiction = createContradictionNode(params);

    await this.client.insert(this.namespaces.evidence, {
      id: `contradiction_${contradiction.id}`,
      vector: new Float32Array(1536).fill(0),
      metadata: {
        type: 'contradiction',
        evidence_id: contradiction.evidence_id,
        hypothesis_id: contradiction.hypothesis_id,
        severity: contradiction.severity,
        resolution_status: contradiction.resolution_status,
        created_at: contradiction.created_at,
      },
      content: contradiction.explanation,
    });

    return contradiction;
  }

  /**
   * Get contradictions for a hypothesis
   */
  async getContradictions(hypothesisId: string): Promise<ContradictionNode[]> {
    const results = await this.client.search(this.namespaces.evidence, new Float32Array(1536), {
      top_k: 100,
      min_score: -Infinity,
      filter: {
        type: 'contradiction',
        hypothesis_id: hypothesisId,
      },
    });

    return results.map((r) => ({
      id: r.id.replace('contradiction_', ''),
      evidence_id: r.metadata['evidence_id'] as string,
      hypothesis_id: r.metadata['hypothesis_id'] as string,
      severity: r.metadata['severity'] as number,
      explanation: r.content ?? '',
      resolution_status: r.metadata['resolution_status'] as ContradictionNode['resolution_status'],
      created_at: r.metadata['created_at'] as number,
    }));
  }

  // =========== Transcript Operations ===========

  /**
   * Store a transcript chunk
   */
  async storeTranscriptChunk(chunk: TranscriptChunk): Promise<void> {
    await this.client.insert(this.namespaces.transcripts, {
      id: chunk.id,
      vector: chunk.embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        call_id: chunk.call_id,
        speaker: chunk.speaker,
        timestamp: chunk.timestamp,
        start_time_ms: chunk.start_time_ms,
        end_time_ms: chunk.end_time_ms,
      },
      content: chunk.text,
    });
  }

  /**
   * Search transcripts semantically
   */
  async searchTranscripts(
    query: Float32Array,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult[]> {
    return this.client.search(this.namespaces.transcripts, query, {
      top_k: 10,
      ...options,
    });
  }

  /**
   * Get all transcript chunks for a call
   */
  async getTranscriptForCall(callId: string): Promise<TranscriptChunk[]> {
    const results = await this.client.search(this.namespaces.transcripts, new Float32Array(1536), {
      top_k: 10000,
      min_score: -Infinity,
      filter: { call_id: callId },
    });

    return results
      .map((r) => ({
        id: r.id,
        call_id: r.metadata['call_id'] as string,
        speaker: r.metadata['speaker'] as string,
        text: r.content ?? '',
        timestamp: r.metadata['timestamp'] as number,
        start_time_ms: r.metadata['start_time_ms'] as number,
        end_time_ms: r.metadata['end_time_ms'] as number,
      }))
      .sort((a, b) => a.start_time_ms - b.start_time_ms);
  }

  // =========== Document Operations ===========

  /**
   * Index a document
   */
  async indexDocument(
    doc: DocumentMetadata,
    chunks: Array<{ content: string; embedding: Float32Array; page?: number }>
  ): Promise<void> {
    // Store document metadata
    await this.client.insert(this.namespaces.documents, {
      id: doc.id,
      vector: new Float32Array(1536).fill(0),
      metadata: {
        type: 'document_metadata',
        filename: doc.filename,
        mime_type: doc.mime_type,
        size_bytes: doc.size_bytes,
        page_count: doc.page_count,
        uploaded_at: doc.uploaded_at,
        source_path: doc.source_path,
        tags: doc.tags,
      },
    });

    // Store document chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      await this.client.insert(this.namespaces.documents, {
        id: `${doc.id}_chunk_${i}`,
        vector: chunk.embedding,
        metadata: {
          type: 'document_chunk',
          document_id: doc.id,
          filename: doc.filename,
          page: chunk.page,
          chunk_index: i,
          uploaded_at: doc.uploaded_at,
        },
        content: chunk.content,
      });
    }
  }

  /**
   * Search documents semantically
   */
  async searchDocuments(
    query: Float32Array,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult[]> {
    return this.client.search(this.namespaces.documents, query, {
      top_k: 10,
      filter: { type: 'document_chunk' },
      ...options,
    });
  }

  // =========== Research Log Operations ===========

  /**
   * Log a research action
   */
  async logAction(log: Omit<ResearchSessionLog, 'id'>): Promise<void> {
    const id = crypto.randomUUID();
    await this.client.insert(this.namespaces.logs, {
      id,
      vector: new Float32Array(1536).fill(0),
      metadata: {
        session_id: log.session_id,
        agent_id: log.agent_id,
        action: log.action,
        details: log.details,
        timestamp: log.timestamp,
      },
    });
  }

  /**
   * Get research logs for a session
   */
  async getSessionLogs(sessionId: string): Promise<ResearchSessionLog[]> {
    const results = await this.client.search(this.namespaces.logs, new Float32Array(1536), {
      top_k: 10000,
      min_score: -Infinity,
      filter: { session_id: sessionId },
    });

    return results
      .map((r) => ({
        id: r.id,
        session_id: r.metadata['session_id'] as string,
        agent_id: r.metadata['agent_id'] as string,
        action: r.metadata['action'] as string,
        details: r.metadata['details'] as Record<string, unknown>,
        timestamp: r.metadata['timestamp'] as number,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // =========== Statistics ===========

  /**
   * Get deal memory statistics
   */
  async getStats(): Promise<{
    hypothesis_count: number;
    evidence_count: number;
    transcript_count: number;
    document_count: number;
    edge_count: number;
  }> {
    const [hypotheses, evidence, transcripts, documents, graph] = await Promise.all([
      this.client.getNamespaceStats(this.namespaces.hypotheses),
      this.client.getNamespaceStats(this.namespaces.evidence),
      this.client.getNamespaceStats(this.namespaces.transcripts),
      this.client.getNamespaceStats(this.namespaces.documents),
      this.client.getNamespaceStats(this.namespaces.graph),
    ]);

    return {
      hypothesis_count: hypotheses.vector_count,
      evidence_count: evidence.vector_count,
      transcript_count: transcripts.vector_count,
      document_count: documents.vector_count,
      edge_count: graph.edge_count,
    };
  }
}

/**
 * Factory function to create deal memory for an engagement
 */
export async function createDealMemory(
  engagementId: string,
  client?: RuvectorClient
): Promise<DealMemory> {
  const memory = new DealMemory(engagementId, client);
  await memory.initialize();
  return memory;
}
