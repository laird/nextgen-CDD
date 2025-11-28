/**
 * Evidence Gatherer Agent - Systematic research collection
 *
 * Responsibilities:
 * - Web research with source credibility assessment
 * - Document analysis from data room
 * - Evidence indexing with provenance
 * - Source deduplication and relevance scoring
 */

import { BaseAgent, createTool } from './base-agent.js';
import type { AgentResult, AgentTool } from './base-agent.js';
import type { EvidenceNode, EvidenceSourceType, EvidenceSentiment } from '../models/evidence.js';
import { createEvidenceFoundEvent, createEvent } from '../models/events.js';
import { webSearch, getDomainCredibility } from '../tools/web-search.js';
import { scoreCredibility } from '../tools/credibility-scorer.js';

/**
 * Evidence gatherer input
 */
export interface EvidenceGathererInput {
  query: string;
  hypothesisIds?: string[];
  sources?: ('web' | 'documents' | 'market_intel')[];
  maxResults?: number;
  minCredibility?: number;
}

/**
 * Evidence gatherer output
 */
export interface EvidenceGathererOutput {
  evidence: EvidenceNode[];
  searchQueries: string[];
  sourceSummary: {
    total: number;
    byType: Record<string, number>;
    averageCredibility: number;
  };
}

/**
 * Evidence Gatherer Agent implementation
 */
export class EvidenceGathererAgent extends BaseAgent {
  constructor() {
    super({
      id: 'evidence_gatherer',
      name: 'Evidence Gatherer',
      systemPrompt: `You are the Evidence Gatherer Agent for Thesis Validator, specializing in systematic research collection for due diligence.

Your role is to:
1. Design effective search strategies for gathering evidence
2. Evaluate source credibility and reliability
3. Extract and summarize relevant information
4. Categorize evidence as supporting, neutral, or contradicting
5. Maintain provenance and traceability

When gathering evidence:
- Use multiple search queries to capture different angles
- Prioritize authoritative sources (government, academic, reputable news)
- Look for primary data rather than derivative commentary
- Cross-reference claims across sources
- Note any conflicts or inconsistencies between sources
- Assess recency and relevance to current market conditions

For each piece of evidence:
- Extract the key claim or data point
- Rate credibility based on source authority
- Determine relevance to specific hypotheses
- Classify sentiment (supporting/neutral/contradicting)

Be thorough but efficient - quality over quantity.`,
    });
  }

  /**
   * Execute evidence gathering
   */
  async execute(input: EvidenceGathererInput): Promise<AgentResult<EvidenceGathererOutput>> {
    const startTime = Date.now();

    if (!this.context) {
      return this.createResult(false, undefined, {
        error: 'No context set',
        startTime,
      });
    }

    this.updateStatus('searching', 'Gathering evidence');

    try {
      const evidence: EvidenceNode[] = [];
      const searchQueries: string[] = [];
      const sources = input.sources ?? ['web', 'documents', 'market_intel'];
      const maxResults = input.maxResults ?? 20;
      const minCredibility = input.minCredibility ?? 0.3;

      // Generate search queries
      const queries = await this.generateSearchQueries(input.query);
      searchQueries.push(...queries);

      // Search web sources
      if (sources.includes('web')) {
        const webEvidence = await this.searchWeb(queries, maxResults, minCredibility);
        evidence.push(...webEvidence);
      }

      // Search documents
      if (sources.includes('documents')) {
        const docEvidence = await this.searchDocuments(input.query, maxResults);
        evidence.push(...docEvidence);
      }

      // Search market intelligence
      if (sources.includes('market_intel') && this.context.marketIntelligence) {
        const marketEvidence = await this.searchMarketIntel(input.query, maxResults);
        evidence.push(...marketEvidence);
      }

      // Link evidence to hypotheses
      if (input.hypothesisIds && input.hypothesisIds.length > 0) {
        await this.linkToHypotheses(evidence, input.hypothesisIds);
      }

      // Store evidence in deal memory
      for (const e of evidence) {
        const embedding = await this.embed(e.content);
        await this.context.dealMemory.addEvidence({
          content: e.content,
          source: e.source,
          sentiment: e.sentiment,
          hypothesis_ids: input.hypothesisIds,
          tags: e.tags,
        }, embedding);

        // Emit evidence found event
        this.emitEvent(createEvidenceFoundEvent(
          this.context.engagementId,
          e.id,
          {
            hypothesis_id: input.hypothesisIds?.[0],
            content_preview: e.content.slice(0, 200),
            source_type: e.source.type,
            sentiment: e.sentiment,
            credibility_score: e.source.credibility_score,
          },
          this.config.id
        ));
      }

      // Calculate summary
      const byType: Record<string, number> = {};
      let totalCredibility = 0;
      for (const e of evidence) {
        byType[e.source.type] = (byType[e.source.type] ?? 0) + 1;
        totalCredibility += e.source.credibility_score;
      }

      this.updateStatus('idle', `Found ${evidence.length} pieces of evidence`);

      return this.createResult(true, {
        evidence,
        searchQueries,
        sourceSummary: {
          total: evidence.length,
          byType,
          averageCredibility: evidence.length > 0 ? totalCredibility / evidence.length : 0,
        },
      }, {
        reasoning: `Gathered ${evidence.length} evidence items from ${Object.keys(byType).length} source types`,
        startTime,
      });
    } catch (error) {
      this.updateStatus('error', error instanceof Error ? error.message : 'Unknown error');

      return this.createResult(false, undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
      });
    }
  }

  /**
   * Generate varied search queries
   */
  private async generateSearchQueries(baseQuery: string): Promise<string[]> {
    const prompt = `Generate 5 different search queries to thoroughly research the following topic:

Topic: ${baseQuery}

Create queries that:
1. The main topic directly
2. Market size / TAM aspects
3. Competitive landscape
4. Risk factors or challenges
5. Recent news or developments

Output as JSON array of strings:
["query1", "query2", ...]`;

    const response = await this.callLLM(prompt, { temperature: 0.3 });
    const queries = this.parseJSON<string[]>(response.content);

    return queries ?? [baseQuery];
  }

  /**
   * Search web sources
   */
  private async searchWeb(
    queries: string[],
    maxResults: number,
    minCredibility: number
  ): Promise<EvidenceNode[]> {
    const evidence: EvidenceNode[] = [];
    const seenUrls = new Set<string>();
    const resultsPerQuery = Math.ceil(maxResults / queries.length);

    for (const query of queries) {
      try {
        const searchResult = await webSearch(query, {
          maxResults: resultsPerQuery,
          searchDepth: 'advanced',
          includeAnswer: false,
        });

        for (const result of searchResult.results) {
          // Skip duplicates
          if (seenUrls.has(result.url)) continue;
          seenUrls.add(result.url);

          // Score credibility
          const credibilityResult = scoreCredibility({
            url: result.url,
            publicationType: this.inferPublicationType(result.url),
            publishedDate: result.publishedDate ? new Date(result.publishedDate) : undefined,
          }, result.content);

          // Filter by minimum credibility
          if (credibilityResult.overall < minCredibility) continue;

          // Determine sentiment
          const sentiment = await this.classifySentiment(result.content);

          evidence.push({
            id: crypto.randomUUID(),
            content: result.content,
            source: {
              type: 'web',
              url: result.url,
              retrieved_at: Date.now(),
              credibility_score: credibilityResult.overall,
              title: result.title,
            },
            relevance: {
              hypothesis_ids: [],
              relevance_scores: [],
            },
            sentiment,
            tags: [query],
            created_at: Date.now(),
            updated_at: Date.now(),
          });
        }
      } catch (error) {
        console.error(`[EvidenceGatherer] Search error for "${query}":`, error);
      }
    }

    return evidence.slice(0, maxResults);
  }

  /**
   * Search data room documents
   */
  private async searchDocuments(query: string, maxResults: number): Promise<EvidenceNode[]> {
    if (!this.context) return [];

    const embedding = await this.embed(query);
    const results = await this.context.dealMemory.searchDocuments(embedding, {
      top_k: maxResults,
    });

    const evidence: EvidenceNode[] = [];
    for (const result of results) {
      const sentiment = await this.classifySentiment(result.content ?? '');

      evidence.push({
        id: crypto.randomUUID(),
        content: result.content ?? '',
        source: {
          type: 'document',
          document_id: result.metadata['document_id'] as string,
          retrieved_at: Date.now(),
          credibility_score: 0.9, // Data room docs are generally high credibility
          title: result.metadata['filename'] as string,
        },
        relevance: {
          hypothesis_ids: [],
          relevance_scores: [result.score],
        },
        sentiment,
        tags: ['data_room'],
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    return evidence;
  }

  /**
   * Search market intelligence
   */
  private async searchMarketIntel(query: string, maxResults: number): Promise<EvidenceNode[]> {
    if (!this.context?.marketIntelligence) return [];

    const embedding = await this.embed(query);
    const results = await this.context.marketIntelligence.searchSignals(embedding, {
      top_k: maxResults,
    });

    const evidence: EvidenceNode[] = [];
    for (const result of results) {
      const sentiment = await this.classifySentiment(result.content ?? '');

      evidence.push({
        id: crypto.randomUUID(),
        content: result.content ?? '',
        source: {
          type: 'data',
          url: result.metadata['source_url'] as string | undefined,
          retrieved_at: Date.now(),
          credibility_score: result.metadata['credibility_score'] as number ?? 0.7,
          title: result.metadata['title'] as string,
        },
        relevance: {
          hypothesis_ids: [],
          relevance_scores: [result.score],
        },
        sentiment,
        tags: ['market_intel', result.metadata['type'] as string],
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    return evidence;
  }

  /**
   * Link evidence to hypotheses
   */
  private async linkToHypotheses(evidence: EvidenceNode[], hypothesisIds: string[]): Promise<void> {
    if (!this.context) return;

    for (const e of evidence) {
      const evidenceEmbedding = await this.embed(e.content);
      const relevanceScores: number[] = [];

      for (const hypothesisId of hypothesisIds) {
        const hypothesis = await this.context.dealMemory.getHypothesis(hypothesisId);
        if (!hypothesis) {
          relevanceScores.push(0);
          continue;
        }

        // Calculate relevance using embedding similarity
        const hypothesisEmbedding = hypothesis.embedding;
        if (hypothesisEmbedding) {
          const similarity = this.cosineSimilarity(evidenceEmbedding, hypothesisEmbedding);
          relevanceScores.push(similarity);
        } else {
          relevanceScores.push(0.5);
        }
      }

      e.relevance = {
        hypothesis_ids: hypothesisIds,
        relevance_scores: relevanceScores,
      };
    }
  }

  /**
   * Classify evidence sentiment
   */
  private async classifySentiment(content: string): Promise<EvidenceSentiment> {
    if (content.length < 50) return 'neutral';

    const prompt = `Classify the sentiment of this text as it relates to a business thesis:

"${content.slice(0, 500)}"

Respond with exactly one word: "supporting", "neutral", or "contradicting"`;

    try {
      const response = await this.callLLM(prompt, { temperature: 0.1, maxTokens: 20 });
      const sentiment = response.content.trim().toLowerCase();

      if (sentiment.includes('supporting')) return 'supporting';
      if (sentiment.includes('contradicting')) return 'contradicting';
      return 'neutral';
    } catch {
      return 'neutral';
    }
  }

  /**
   * Infer publication type from URL
   */
  private inferPublicationType(url: string): any {
    const domain = getDomainCredibility(url);
    // Map domain credibility to publication type
    return undefined; // Let credibility scorer infer
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  /**
   * Get gatherer tools
   */
  private getTools(): AgentTool[] {
    return [
      createTool(
        'web_search',
        'Search the web for evidence',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            max_results: { type: 'number', description: 'Maximum results' },
          },
          required: ['query'],
        },
        async (input) => {
          const result = await webSearch(input['query'] as string, {
            maxResults: (input['max_results'] as number) ?? 10,
          });
          return result;
        }
      ),

      createTool(
        'search_documents',
        'Search data room documents',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
        async (input) => {
          if (!this.context) return { results: [] };
          const embedding = await this.embed(input['query'] as string);
          const results = await this.context.dealMemory.searchDocuments(embedding);
          return { results };
        }
      ),

      createTool(
        'assess_credibility',
        'Assess the credibility of a source',
        {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Source URL' },
            content: { type: 'string', description: 'Source content' },
          },
          required: ['url'],
        },
        async (input) => {
          const result = scoreCredibility({
            url: input['url'] as string,
          }, input['content'] as string | undefined);
          return result;
        }
      ),
    ];
  }
}

/**
 * Create an evidence gatherer agent instance
 */
export function createEvidenceGathererAgent(): EvidenceGathererAgent {
  return new EvidenceGathererAgent();
}
