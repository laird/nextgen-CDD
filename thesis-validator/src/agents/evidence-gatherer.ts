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
import type { EvidenceNode, EvidenceSentiment, EvidenceSourceType } from '../models/evidence.js';
import { createEvidenceFoundEvent, createHypothesisUpdatedEvent } from '../models/events.js';
import type { HypothesisStatus } from '../models/hypothesis.js';
import { webSearch } from '../tools/web-search.js';
import { scoreCredibility, type SourceMetadata } from '../tools/credibility-scorer.js';
import {
  getAlphaVantageClient,
  gatherFinancialEvidence,
  type FinancialDataResult,
  type StockQuote,
  type CompanyOverview,
  type NewsArticle,
} from '../tools/alphavantage-rest.js';
import { EvidenceRepository } from '../repositories/evidence-repository.js';
import { HypothesisRepository } from '../repositories/hypothesis-repository.js';

/**
 * Evidence gatherer input
 */
export interface EvidenceGathererInput {
  query: string;
  hypothesisIds?: string[];
  sources?: ('web' | 'documents' | 'market_intel' | 'financial')[];
  maxResults?: number;
  minCredibility?: number;
  /** Stock symbols to gather financial data for (e.g., ['AAPL', 'MSFT']) */
  symbols?: string[];
  /** Financial data options */
  financialOptions?: {
    includeQuote?: boolean;
    includeFundamentals?: boolean;
    includeNews?: boolean;
    includeEarnings?: boolean;
    includeTechnicals?: boolean;
  };
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
  private evidenceRepo: EvidenceRepository;
  private hypothesisRepo: HypothesisRepository;

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
    this.evidenceRepo = new EvidenceRepository();
    this.hypothesisRepo = new HypothesisRepository();
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

      // Search financial data via AlphaVantage REST API
      if (sources.includes('financial')) {
        const financialEvidence = await this.searchFinancialData(
          input.query,
          input.symbols,
          input.financialOptions,
          maxResults
        );
        evidence.push(...financialEvidence);
      }

      // Link evidence to hypotheses
      if (input.hypothesisIds && input.hypothesisIds.length > 0) {
        await this.linkToHypotheses(evidence, input.hypothesisIds);
      }

      // Store evidence in deal memory and PostgreSQL
      for (const e of evidence) {
        const embedding = await this.embed(e.content);
        await this.context.dealMemory.addEvidence({
          content: e.content,
          source: e.source,
          sentiment: e.sentiment,
          hypothesis_ids: input.hypothesisIds,
          tags: e.tags,
        }, embedding);

        // Also persist to PostgreSQL for API access
        try {
          const savedEvidence = await this.evidenceRepo.create({
            engagementId: this.context.engagementId,
            content: e.content,
            sourceType: e.source.type as EvidenceSourceType,
            ...(e.source.url ? { sourceUrl: e.source.url } : {}),
            ...(e.source.title ? { sourceTitle: e.source.title } : {}),
            credibility: e.source.credibility_score,
            sentiment: e.sentiment,
            metadata: { tags: e.tags },
            retrievedAt: new Date(e.source.retrieved_at),
          });

          // Link to hypotheses if any (only if hypothesis exists in PostgreSQL)
          if (input.hypothesisIds) {
            for (let i = 0; i < input.hypothesisIds.length; i++) {
              const hypothesisId = input.hypothesisIds[i];
              const relevanceScore = e.relevance.relevance_scores[i] ?? 0.5;
              if (hypothesisId) {
                // Check if hypothesis exists in PostgreSQL before linking
                const hypothesisExists = await this.hypothesisRepo.getById(hypothesisId);
                if (hypothesisExists) {
                  await this.evidenceRepo.linkToHypothesis(savedEvidence.id, hypothesisId, relevanceScore);
                } else {
                  // Hypothesis not in PostgreSQL (in-memory only), skip linking
                  console.log(`[EvidenceGatherer] Skipping hypothesis link - ID ${hypothesisId} not in PostgreSQL`);
                }
              }
            }
          }
        } catch (dbError) {
          console.error('[EvidenceGatherer] Failed to persist evidence to PostgreSQL:', dbError);
          // Continue - vector memory is still updated
        }

        // Emit evidence found event
        const eventData: {
          content_preview: string;
          source_type: string;
          sentiment: string;
          credibility_score: number;
          hypothesis_id?: string;
        } = {
          content_preview: e.content.slice(0, 200),
          source_type: e.source.type,
          sentiment: e.sentiment,
          credibility_score: e.source.credibility_score,
        };

        // Only add hypothesis_id if it exists
        const firstHypothesisId = input.hypothesisIds?.[0];
        if (firstHypothesisId !== undefined) {
          eventData.hypothesis_id = firstHypothesisId;
        }

        this.emitEvent(createEvidenceFoundEvent(
          this.context.engagementId,
          e.id,
          eventData,
          this.config.id
        ));
      }

      // Update hypothesis status based on evidence gathered
      if (input.hypothesisIds && input.hypothesisIds.length > 0 && evidence.length > 0) {
        await this.updateHypothesesFromEvidence(evidence, input.hypothesisIds);
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
          const credibilityMetadata: SourceMetadata = {};

          // Only add properties if they have values (for exactOptionalPropertyTypes)
          credibilityMetadata.url = result.url;

          const pubType = this.inferPublicationType(result.url);
          if (pubType !== undefined) {
            credibilityMetadata.publicationType = pubType;
          }
          if (result.publishedDate !== undefined) {
            credibilityMetadata.publishedDate = new Date(result.publishedDate);
          }

          const credibilityResult = scoreCredibility(credibilityMetadata, result.content);

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

      // Compute credibility based on document type and metadata
      const credibilityScore = this.computeDocumentCredibility(
        result.metadata['filename'] as string,
        result.metadata['document_type'] as string | undefined,
        result.score
      );

      evidence.push({
        id: crypto.randomUUID(),
        content: result.content ?? '',
        source: {
          type: 'document',
          document_id: result.metadata['document_id'] as string,
          retrieved_at: Date.now(),
          credibility_score: credibilityScore,
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
   * Compute credibility score for document evidence
   * Based on document type, filename patterns, and relevance score
   */
  private computeDocumentCredibility(
    filename: string | undefined,
    documentType: string | undefined,
    relevanceScore: number
  ): number {
    // Base credibility by document type
    const typeCredibility: Record<string, number> = {
      'financial_statement': 0.95,
      'audit_report': 0.95,
      'legal_document': 0.92,
      'contract': 0.90,
      'due_diligence_report': 0.90,
      'management_presentation': 0.82,
      'market_analysis': 0.80,
      'internal_memo': 0.75,
      'email': 0.70,
      'notes': 0.65,
    };

    let baseScore = typeCredibility[documentType ?? ''] ?? 0.80;

    // Adjust based on filename patterns (only if filename is available)
    if (filename) {
      const lowerFilename = filename.toLowerCase();
      if (lowerFilename.includes('audit') || lowerFilename.includes('10-k') || lowerFilename.includes('10k')) {
        baseScore = Math.max(baseScore, 0.93);
      } else if (lowerFilename.includes('financ') || lowerFilename.includes('statement')) {
        baseScore = Math.max(baseScore, 0.90);
      } else if (lowerFilename.includes('legal') || lowerFilename.includes('contract')) {
        baseScore = Math.max(baseScore, 0.88);
      } else if (lowerFilename.includes('draft') || lowerFilename.includes('wip')) {
        baseScore = Math.min(baseScore, 0.72);
      } else if (lowerFilename.includes('notes') || lowerFilename.includes('memo')) {
        baseScore = Math.min(baseScore, 0.75);
      }
    }

    // Relevance affects credibility slightly (highly relevant docs more reliable)
    const relevanceBonus = (relevanceScore - 0.5) * 0.1;

    // Add small variance to avoid all documents having the same score
    const variance = (Math.random() - 0.5) * 0.06;

    const finalScore = Math.max(0.5, Math.min(0.98, baseScore + relevanceBonus + variance));
    return Math.round(finalScore * 100) / 100;
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

      // Compute credibility based on signal type and metadata
      const credibilityScore = this.computeMarketIntelCredibility(
        result.metadata['type'] as string | undefined,
        result.metadata['credibility_score'] as number | undefined,
        result.metadata['source'] as string | undefined,
        result.score
      );

      evidence.push({
        id: crypto.randomUUID(),
        content: result.content ?? '',
        source: {
          type: 'data',
          url: result.metadata['source_url'] as string | undefined,
          retrieved_at: Date.now(),
          credibility_score: credibilityScore,
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
   * Compute credibility score for market intelligence evidence
   * Based on signal type, source, and stored credibility
   */
  private computeMarketIntelCredibility(
    signalType: string | undefined,
    storedCredibility: number | undefined,
    source: string | undefined,
    relevanceScore: number
  ): number {
    // If we have a stored credibility score, use it with small variance
    if (storedCredibility !== undefined) {
      const variance = (Math.random() - 0.5) * 0.04;
      return Math.round(Math.max(0.3, Math.min(0.95, storedCredibility + variance)) * 100) / 100;
    }

    // Base credibility by signal type
    const typeCredibility: Record<string, number> = {
      'regulatory_filing': 0.90,
      'earnings_report': 0.88,
      'patent_filing': 0.85,
      'industry_report': 0.82,
      'analyst_report': 0.80,
      'news': 0.72,
      'press_release': 0.68,
      'social_signal': 0.55,
      'rumor': 0.40,
    };

    let baseScore = typeCredibility[signalType ?? ''] ?? 0.70;

    // Adjust based on source if available
    if (source) {
      const lowerSource = source.toLowerCase();
      if (lowerSource.includes('sec') || lowerSource.includes('government')) {
        baseScore = Math.max(baseScore, 0.88);
      } else if (lowerSource.includes('reuters') || lowerSource.includes('bloomberg')) {
        baseScore = Math.max(baseScore, 0.82);
      }
    }

    // Relevance affects credibility slightly
    const relevanceBonus = (relevanceScore - 0.5) * 0.08;

    // Add variance
    const variance = (Math.random() - 0.5) * 0.08;

    const finalScore = Math.max(0.35, Math.min(0.92, baseScore + relevanceBonus + variance));
    return Math.round(finalScore * 100) / 100;
  }

  /**
   * Search financial data via AlphaVantage REST API
   */
  private async searchFinancialData(
    query: string,
    symbols?: string[],
    options?: {
      includeQuote?: boolean;
      includeFundamentals?: boolean;
      includeNews?: boolean;
      includeEarnings?: boolean;
      includeTechnicals?: boolean;
    },
    maxResults?: number
  ): Promise<EvidenceNode[]> {
    const evidence: EvidenceNode[] = [];

    // If no symbols provided, try to extract them from the query
    let targetSymbols = symbols ?? [];
    if (targetSymbols.length === 0) {
      targetSymbols = await this.extractSymbolsFromQuery(query);
    }

    // If still no symbols, search for relevant companies
    if (targetSymbols.length === 0) {
      try {
        const client = getAlphaVantageClient();
        const searchResults = await client.searchSymbol(query);
        targetSymbols = searchResults.slice(0, 3).map((r) => r.symbol);
      } catch (error) {
        console.error('[EvidenceGatherer] Symbol search error:', error);
      }
    }

    // Gather financial evidence for each symbol
    for (const symbol of targetSymbols.slice(0, maxResults ?? 5)) {
      try {
        const financialResults = await gatherFinancialEvidence(symbol, options);

        for (const result of financialResults) {
          const sentiment = this.inferFinancialSentiment(result);

          evidence.push({
            id: crypto.randomUUID(),
            content: result.summary,
            source: {
              type: 'financial',
              url: `https://www.alphavantage.co/query?symbol=${symbol}`,
              retrieved_at: result.retrievedAt,
              credibility_score: result.credibilityScore,
              title: `${symbol} ${result.type} data`,
            },
            relevance: {
              hypothesis_ids: [],
              relevance_scores: [],
            },
            sentiment,
            tags: ['financial', result.type, symbol],
            created_at: Date.now(),
            updated_at: Date.now(),
          });
        }
      } catch (error) {
        console.error(`[EvidenceGatherer] Financial data error for ${symbol}:`, error);
      }
    }

    return evidence;
  }

  /**
   * Extract stock symbols from a query using LLM
   */
  private async extractSymbolsFromQuery(query: string): Promise<string[]> {
    const prompt = `Extract any stock ticker symbols mentioned or implied in this query. Return as JSON array of uppercase symbols.
If the query mentions company names, return their ticker symbols.
If no symbols are mentioned or implied, return an empty array.

Query: "${query}"

Output format: ["AAPL", "MSFT"] or []`;

    try {
      const response = await this.callLLM(prompt, { temperature: 0.1, maxTokens: 100 });
      const symbols = this.parseJSON<string[]>(response.content);
      return symbols ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Infer sentiment from financial data
   */
  private inferFinancialSentiment(result: FinancialDataResult): EvidenceSentiment {
    // For news, use the sentiment data directly
    if (result.type === 'news') {
      const articles = result.data as NewsArticle[];
      if (articles.length === 0) return 'neutral';

      const avgSentiment = articles.reduce((sum, a) => sum + a.overallSentimentScore, 0) / articles.length;
      if (avgSentiment > 0.15) return 'supporting';
      if (avgSentiment < -0.15) return 'contradicting';
      return 'neutral';
    }

    // For quote data, check price movement
    if (result.type === 'quote') {
      const quote = result.data as StockQuote;
      if (quote.change > 0) return 'supporting';
      if (quote.change < 0) return 'contradicting';
      return 'neutral';
    }

    // For fundamentals, check key metrics
    if (result.type === 'fundamentals') {
      const overview = result.data as CompanyOverview;
      // Positive signals: growing revenue, positive earnings
      if (overview.quarterlyRevenueGrowthYOY > 0 && overview.eps > 0) {
        return 'supporting';
      }
      if (overview.quarterlyRevenueGrowthYOY < -0.1 || overview.eps < 0) {
        return 'contradicting';
      }
      return 'neutral';
    }

    // For earnings, check surprise
    if (result.type === 'earnings') {
      const summary = result.summary;
      if (summary.includes('Surprise:')) {
        const match = summary.match(/Surprise: ([-\d.]+)%/);
        if (match) {
          const surprise = parseFloat(match[1]!);
          if (surprise > 5) return 'supporting';
          if (surprise < -5) return 'contradicting';
        }
      }
      return 'neutral';
    }

    // Default to neutral for technical indicators and economic data
    return 'neutral';
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
   * Update hypothesis status and confidence based on gathered evidence
   * - Supporting evidence increases confidence
   * - Contradicting evidence decreases confidence and may change status
   * - Status changes from 'untested' to 'supported' or 'challenged' based on evidence
   */
  private async updateHypothesesFromEvidence(
    evidence: EvidenceNode[],
    hypothesisIds: string[]
  ): Promise<void> {
    if (!this.context) return;

    for (const hypothesisId of hypothesisIds) {
      // Get current hypothesis from deal memory
      const hypothesis = await this.context.dealMemory.getHypothesis(hypothesisId);
      if (!hypothesis) continue;

      // Count evidence by sentiment for this hypothesis
      let supportingCount = 0;
      let contradictingCount = 0;
      let totalCredibility = 0;

      for (const e of evidence) {
        // Check if evidence is linked to this hypothesis
        const hypothesisIndex = e.relevance.hypothesis_ids.indexOf(hypothesisId);
        if (hypothesisIndex === -1) continue;

        // Weight by credibility
        const weight = e.source.credibility_score;
        totalCredibility += weight;

        if (e.sentiment === 'supporting') {
          supportingCount += weight;
        } else if (e.sentiment === 'contradicting') {
          contradictingCount += weight;
        }
      }

      // Skip if no evidence related to this hypothesis
      if (totalCredibility === 0) continue;

      // Calculate confidence delta based on evidence sentiment
      // Supporting evidence increases confidence, contradicting decreases
      const supportRatio = supportingCount / totalCredibility;
      const contradictRatio = contradictingCount / totalCredibility;
      const confidenceDelta = (supportRatio - contradictRatio) * 0.15; // Max +/- 0.15 per evidence batch

      const newConfidence = Math.max(0, Math.min(1, hypothesis.confidence + confidenceDelta));

      // Determine new status based on evidence
      let newStatus: HypothesisStatus = hypothesis.status;
      if (hypothesis.status === 'untested') {
        // First evidence determines initial status direction
        if (supportRatio > contradictRatio && supportingCount > 0) {
          newStatus = 'supported';
        } else if (contradictRatio > supportRatio && contradictingCount > 0) {
          newStatus = 'challenged';
        }
      } else if (hypothesis.status === 'supported' && contradictRatio > 0.5) {
        // Strong contradicting evidence challenges a previously supported hypothesis
        newStatus = 'challenged';
      }

      // Only update if something changed
      if (newConfidence !== hypothesis.confidence || newStatus !== hypothesis.status) {
        // Update deal memory (vector DB)
        await this.context.dealMemory.updateHypothesisConfidence(
          hypothesisId,
          newConfidence,
          newStatus
        );

        // Also update PostgreSQL for API access
        try {
          await this.hypothesisRepo.update(hypothesisId, {
            confidence: newConfidence,
            status: newStatus,
          });
        } catch (pgError) {
          // Hypothesis may not exist in PostgreSQL (in-memory only from older workflow)
          console.log(`[EvidenceGatherer] Could not update hypothesis ${hypothesisId} in PostgreSQL:`, pgError);
        }

        // Emit hypothesis updated event
        this.emitEvent(createHypothesisUpdatedEvent(
          this.context.engagementId,
          hypothesisId,
          {
            confidence: newConfidence,
            confidence_delta: confidenceDelta,
            status: newStatus,
            previous_status: hypothesis.status,
          },
          this.config.id
        ));
      }
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
  private inferPublicationType(_url: string): undefined {
    // Let credibility scorer infer the publication type
    return undefined;
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
   * Get all available tools for evidence gathering
   * Includes web search, document search, credibility assessment, and AlphaVantage REST API financial data tools
   */
  public getTools(): AgentTool[] {
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

      // AlphaVantage REST API Financial Data Tools
      createTool(
        'get_stock_quote',
        'Get real-time stock quote for a symbol including price, volume, and change',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol (e.g., AAPL, MSFT)' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.getQuote(input['symbol'] as string);
        }
      ),

      createTool(
        'get_company_fundamentals',
        'Get company overview with key fundamentals including market cap, P/E ratio, revenue, and growth metrics',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.getCompanyOverview(input['symbol'] as string);
        }
      ),

      createTool(
        'get_income_statement',
        'Get income statements (annual and quarterly) for a company',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.getIncomeStatement(input['symbol'] as string);
        }
      ),

      createTool(
        'get_balance_sheet',
        'Get balance sheet data (annual and quarterly) for a company',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.getBalanceSheet(input['symbol'] as string);
        }
      ),

      createTool(
        'get_cash_flow',
        'Get cash flow statements (annual and quarterly) for a company',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.getCashFlow(input['symbol'] as string);
        }
      ),

      createTool(
        'get_earnings',
        'Get earnings data including quarterly surprises and estimates for a company',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.getEarnings(input['symbol'] as string);
        }
      ),

      createTool(
        'get_market_news',
        'Get market news and sentiment for specific tickers or topics',
        {
          type: 'object',
          properties: {
            tickers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Stock ticker symbols to get news for',
            },
            topics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Topics to filter news (e.g., earnings, technology, finance)',
            },
            limit: { type: 'number', description: 'Maximum number of articles (default 50)' },
          },
        },
        async (input) => {
          const client = getAlphaVantageClient();
          const tickers = input['tickers'] as string[] | undefined;
          const topics = input['topics'] as string[] | undefined;
          return client.getNewsSentiment({
            ...(tickers && { tickers }),
            ...(topics && { topics }),
            limit: (input['limit'] as number) ?? 50,
          });
        }
      ),

      createTool(
        'get_insider_transactions',
        'Get insider trading transactions for a company',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.getInsiderTransactions(input['symbol'] as string);
        }
      ),

      createTool(
        'get_top_movers',
        'Get top gainers, losers, and most actively traded stocks',
        {
          type: 'object',
          properties: {},
        },
        async () => {
          const client = getAlphaVantageClient();
          return client.getTopGainersLosers();
        }
      ),

      createTool(
        'get_daily_prices',
        'Get daily time series price data for a stock',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
            outputSize: {
              type: 'string',
              enum: ['compact', 'full'],
              description: 'compact (last 100 data points) or full (all available data)',
            },
            adjusted: { type: 'boolean', description: 'Whether to get adjusted prices' },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          const outputSize = input['outputSize'] as 'compact' | 'full' | undefined;
          const adjusted = input['adjusted'] as boolean | undefined;
          return client.getDailyTimeSeries(input['symbol'] as string, {
            ...(outputSize && { outputSize }),
            ...(adjusted !== undefined && { adjusted }),
          });
        }
      ),

      createTool(
        'get_technical_indicators',
        'Get technical indicators (RSI, MACD) for a stock',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
            indicators: {
              type: 'array',
              items: { type: 'string', enum: ['RSI', 'MACD', 'SMA', 'EMA', 'BBANDS'] },
              description: 'Technical indicators to retrieve',
            },
          },
          required: ['symbol'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          const symbol = input['symbol'] as string;
          const indicators = (input['indicators'] as string[]) ?? ['RSI', 'MACD'];
          const results: Record<string, unknown> = {};

          for (const indicator of indicators) {
            switch (indicator) {
              case 'RSI':
                results['RSI'] = await client.getRSI(symbol);
                break;
              case 'MACD':
                results['MACD'] = await client.getMACD(symbol);
                break;
              case 'SMA':
                results['SMA'] = await client.getSMA(symbol);
                break;
              case 'EMA':
                results['EMA'] = await client.getEMA(symbol);
                break;
              case 'BBANDS':
                results['BBANDS'] = await client.getBollingerBands(symbol);
                break;
            }
          }

          return results;
        }
      ),

      createTool(
        'get_economic_indicators',
        'Get economic indicator data (GDP, CPI, inflation, unemployment, treasury yields)',
        {
          type: 'object',
          properties: {
            indicator: {
              type: 'string',
              enum: ['GDP', 'CPI', 'INFLATION', 'UNEMPLOYMENT', 'TREASURY_YIELD', 'FEDERAL_FUNDS_RATE'],
              description: 'Economic indicator to retrieve',
            },
          },
          required: ['indicator'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          const indicator = input['indicator'] as string;

          switch (indicator) {
            case 'GDP':
              return { indicator: 'GDP', data: await client.getRealGDP() };
            case 'CPI':
              return { indicator: 'CPI', data: await client.getCPI() };
            case 'INFLATION':
              return { indicator: 'INFLATION', data: await client.getInflation() };
            case 'UNEMPLOYMENT':
              return { indicator: 'UNEMPLOYMENT', data: await client.getUnemployment() };
            case 'TREASURY_YIELD':
              return { indicator: 'TREASURY_YIELD', data: await client.getTreasuryYield() };
            case 'FEDERAL_FUNDS_RATE':
              return { indicator: 'FEDERAL_FUNDS_RATE', data: await client.getFederalFundsRate() };
            default:
              throw new Error(`Unknown indicator: ${indicator}`);
          }
        }
      ),

      createTool(
        'search_symbols',
        'Search for stock symbols by company name or keywords',
        {
          type: 'object',
          properties: {
            keywords: { type: 'string', description: 'Company name or keywords to search for' },
          },
          required: ['keywords'],
        },
        async (input) => {
          const client = getAlphaVantageClient();
          return client.searchSymbol(input['keywords'] as string);
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
