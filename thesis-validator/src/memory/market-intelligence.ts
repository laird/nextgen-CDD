/**
 * Market Intelligence - Real-time market signals with temporal decay
 *
 * Continuously updated vector store of market signals:
 * - Web research embeddings with freshness scoring
 * - Competitive intelligence with entity resolution
 * - Regulatory and policy signals
 * - Industry news and analyst reports
 * - Public company filings and earnings call transcripts
 */

import type { Sector } from '../models/index.js';
import type { RuvectorClient, SearchResult, SearchOptions } from './ruvector-client.js';
import { getRuvectorClient } from './ruvector-client.js';

/**
 * Market signal types
 */
export type MarketSignalType =
  | 'web_research'
  | 'competitive_intel'
  | 'regulatory'
  | 'industry_news'
  | 'analyst_report'
  | 'earnings_call'
  | 'sec_filing'
  | 'press_release'
  | 'social_media';

/**
 * Source credibility levels
 */
export type SourceCredibility = 'high' | 'medium' | 'low' | 'unknown';

/**
 * Market signal entry
 */
export interface MarketSignal {
  id: string;
  type: MarketSignalType;
  sector: Sector;
  title: string;
  content: string;
  summary?: string;
  source: {
    name: string;
    url?: string;
    credibility: SourceCredibility;
    credibility_score: number;
  };
  entities: string[]; // Company/entity names mentioned
  sentiment?: {
    score: number; // -1 to 1
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  relevance_tags: string[];
  published_at: number;
  retrieved_at: number;
  expires_at?: number;
  embedding?: Float32Array;
}

/**
 * Competitive intelligence entry
 */
export interface CompetitiveIntelligence {
  id: string;
  target_company: string;
  competitor: string;
  intel_type: 'product_launch' | 'pricing_change' | 'partnership' | 'acquisition' | 'leadership_change' | 'market_share' | 'strategy_shift';
  content: string;
  impact_assessment?: string;
  confidence: number;
  sources: string[];
  detected_at: number;
  embedding?: Float32Array;
}

/**
 * Regulatory signal entry
 */
export interface RegulatorySignal {
  id: string;
  jurisdiction: string;
  agency: string;
  signal_type: 'proposed_rule' | 'final_rule' | 'guidance' | 'enforcement' | 'investigation' | 'policy_change';
  affected_sectors: Sector[];
  title: string;
  content: string;
  impact_assessment?: string;
  effective_date?: number;
  comment_deadline?: number;
  source_url: string;
  published_at: number;
  retrieved_at: number;
  embedding?: Float32Array;
}

/**
 * Market intelligence search options
 */
export interface MarketSearchOptions extends Partial<SearchOptions> {
  signal_types?: MarketSignalType[];
  sectors?: Sector[];
  min_credibility?: number;
  max_age_days?: number;
  entities?: string[];
}

/**
 * Time decay configuration
 */
const TIME_DECAY_CONFIG = {
  half_life_days: 30, // Information loses half relevance after 30 days
  max_age_days: 365, // Information older than this is heavily discounted
  freshness_boost_hours: 24, // Very recent info gets a boost
};

/**
 * Market Intelligence Manager
 */
export class MarketIntelligence {
  private client: RuvectorClient;
  private namespacePrefix = 'market_intel';

  constructor(client?: RuvectorClient) {
    this.client = client ?? getRuvectorClient();
  }

  /**
   * Get namespace for a sector
   */
  private getNamespace(sector: Sector | 'global'): string {
    return `${this.namespacePrefix}_${sector}`;
  }

  /**
   * Initialize market intelligence namespaces
   */
  async initialize(): Promise<void> {
    const sectors: (Sector | 'global')[] = [
      'global',
      'technology',
      'healthcare',
      'industrials',
      'consumer',
      'financial_services',
      'energy',
      'real_estate',
      'media',
      'telecommunications',
      'materials',
      'utilities',
      'other',
    ];

    for (const sector of sectors) {
      await this.client.createNamespace(this.getNamespace(sector));
    }
  }

  /**
   * Calculate temporal decay weight
   */
  private calculateTemporalDecay(timestamp: number): number {
    const ageMs = Date.now() - timestamp;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    // Apply exponential decay
    const decayFactor = Math.exp(-Math.log(2) * ageDays / TIME_DECAY_CONFIG.half_life_days);

    // Apply maximum age cutoff
    if (ageDays > TIME_DECAY_CONFIG.max_age_days) {
      return decayFactor * 0.1; // Heavy discount for very old content
    }

    // Apply freshness boost
    const ageHours = ageMs / (60 * 60 * 1000);
    if (ageHours < TIME_DECAY_CONFIG.freshness_boost_hours) {
      return Math.min(1.0, decayFactor * 1.2); // 20% boost for fresh content
    }

    return decayFactor;
  }

  /**
   * Store a market signal
   */
  async storeSignal(signal: Omit<MarketSignal, 'id'>, embedding?: Float32Array): Promise<MarketSignal> {
    const id = crypto.randomUUID();
    const fullSignal: MarketSignal = { id, ...signal, embedding };

    await this.client.insert(this.getNamespace(signal.sector), {
      id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        type: signal.type,
        sector: signal.sector,
        title: signal.title,
        source_name: signal.source.name,
        source_url: signal.source.url,
        credibility: signal.source.credibility,
        credibility_score: signal.source.credibility_score,
        entities: signal.entities,
        sentiment_score: signal.sentiment?.score,
        sentiment_label: signal.sentiment?.label,
        relevance_tags: signal.relevance_tags,
        published_at: signal.published_at,
        retrieved_at: signal.retrieved_at,
        expires_at: signal.expires_at,
      },
      content: signal.content,
    });

    // Also store in global namespace for cross-sector search
    await this.client.insert(this.getNamespace('global'), {
      id: `global_${id}`,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        original_id: id,
        type: signal.type,
        sector: signal.sector,
        title: signal.title,
        source_name: signal.source.name,
        credibility_score: signal.source.credibility_score,
        entities: signal.entities,
        published_at: signal.published_at,
      },
      content: signal.summary ?? signal.content.slice(0, 500),
    });

    return fullSignal;
  }

  /**
   * Search market signals with temporal decay
   */
  async searchSignals(
    query: Float32Array,
    options: MarketSearchOptions = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 20,
      similarity_weight: 0.6,
      recency_weight: 0.2,
      credibility_weight: 0.2,
    };

    // Apply filters
    if (options.min_credibility) {
      searchOptions.filter = searchOptions.filter ?? {};
      // Note: In production, this would use a range filter
    }

    // Determine which namespaces to search
    const namespaces: string[] = [];
    if (options.sectors && options.sectors.length > 0) {
      for (const sector of options.sectors) {
        namespaces.push(this.getNamespace(sector));
      }
    } else {
      namespaces.push(this.getNamespace('global'));
    }

    // Search across namespaces
    let results: SearchResult[] = [];
    for (const ns of namespaces) {
      const nsResults = await this.client.search(ns, query, searchOptions);
      results = results.concat(nsResults);
    }

    // Apply temporal decay weighting
    for (const result of results) {
      const publishedAt = result.metadata['published_at'] as number ?? result.metadata['retrieved_at'] as number;
      const temporalDecay = this.calculateTemporalDecay(publishedAt);
      result.score *= temporalDecay;
    }

    // Filter by signal types
    if (options.signal_types && options.signal_types.length > 0) {
      results = results.filter((r) =>
        options.signal_types!.includes(r.metadata['type'] as MarketSignalType)
      );
    }

    // Filter by max age
    if (options.max_age_days) {
      const minTimestamp = Date.now() - options.max_age_days * 24 * 60 * 60 * 1000;
      results = results.filter((r) => {
        const publishedAt = r.metadata['published_at'] as number;
        return publishedAt >= minTimestamp;
      });
    }

    // Filter by entities
    if (options.entities && options.entities.length > 0) {
      results = results.filter((r) => {
        const signalEntities = r.metadata['entities'] as string[] ?? [];
        return options.entities!.some((e) =>
          signalEntities.some((se) => se.toLowerCase().includes(e.toLowerCase()))
        );
      });
    }

    // Re-sort by adjusted score and return top_k
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.top_k ?? 20);
  }

  /**
   * Store competitive intelligence
   */
  async storeCompetitiveIntel(
    intel: Omit<CompetitiveIntelligence, 'id'>,
    embedding?: Float32Array
  ): Promise<CompetitiveIntelligence> {
    const id = crypto.randomUUID();
    const fullIntel: CompetitiveIntelligence = { id, ...intel, embedding };

    await this.client.insert(`${this.namespacePrefix}_competitive`, {
      id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        target_company: intel.target_company,
        competitor: intel.competitor,
        intel_type: intel.intel_type,
        confidence: intel.confidence,
        sources: intel.sources,
        detected_at: intel.detected_at,
      },
      content: `${intel.content}\n\nImpact: ${intel.impact_assessment ?? 'Not assessed'}`,
    });

    return fullIntel;
  }

  /**
   * Search competitive intelligence
   */
  async searchCompetitiveIntel(
    query: Float32Array,
    options: {
      top_k?: number;
      target_company?: string;
      competitor?: string;
      intel_types?: CompetitiveIntelligence['intel_type'][];
    } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 10,
    };

    if (options.target_company || options.competitor) {
      searchOptions.filter = {};
      if (options.target_company) searchOptions.filter['target_company'] = options.target_company;
      if (options.competitor) searchOptions.filter['competitor'] = options.competitor;
    }

    let results = await this.client.search(`${this.namespacePrefix}_competitive`, query, searchOptions);

    // Filter by intel types
    if (options.intel_types && options.intel_types.length > 0) {
      results = results.filter((r) =>
        options.intel_types!.includes(r.metadata['intel_type'] as CompetitiveIntelligence['intel_type'])
      );
    }

    return results;
  }

  /**
   * Store regulatory signal
   */
  async storeRegulatorySignal(
    signal: Omit<RegulatorySignal, 'id'>,
    embedding?: Float32Array
  ): Promise<RegulatorySignal> {
    const id = crypto.randomUUID();
    const fullSignal: RegulatorySignal = { id, ...signal, embedding };

    await this.client.insert(`${this.namespacePrefix}_regulatory`, {
      id,
      vector: embedding ?? new Float32Array(1536).fill(0),
      metadata: {
        jurisdiction: signal.jurisdiction,
        agency: signal.agency,
        signal_type: signal.signal_type,
        affected_sectors: signal.affected_sectors,
        effective_date: signal.effective_date,
        comment_deadline: signal.comment_deadline,
        source_url: signal.source_url,
        published_at: signal.published_at,
        retrieved_at: signal.retrieved_at,
      },
      content: `${signal.title}\n\n${signal.content}\n\nImpact: ${signal.impact_assessment ?? 'Not assessed'}`,
    });

    return fullSignal;
  }

  /**
   * Search regulatory signals
   */
  async searchRegulatorySignals(
    query: Float32Array,
    options: {
      top_k?: number;
      jurisdictions?: string[];
      signal_types?: RegulatorySignal['signal_type'][];
      sectors?: Sector[];
    } = {}
  ): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      top_k: options.top_k ?? 10,
    };

    let results = await this.client.search(`${this.namespacePrefix}_regulatory`, query, searchOptions);

    // Apply filters
    if (options.jurisdictions && options.jurisdictions.length > 0) {
      results = results.filter((r) =>
        options.jurisdictions!.includes(r.metadata['jurisdiction'] as string)
      );
    }

    if (options.signal_types && options.signal_types.length > 0) {
      results = results.filter((r) =>
        options.signal_types!.includes(r.metadata['signal_type'] as RegulatorySignal['signal_type'])
      );
    }

    if (options.sectors && options.sectors.length > 0) {
      results = results.filter((r) => {
        const affectedSectors = r.metadata['affected_sectors'] as Sector[];
        return options.sectors!.some((s) => affectedSectors.includes(s));
      });
    }

    return results;
  }

  /**
   * Get recent signals for a sector
   */
  async getRecentSignals(sector: Sector, limit = 50): Promise<MarketSignal[]> {
    const results = await this.client.search(this.getNamespace(sector), new Float32Array(1536), {
      top_k: limit,
      min_score: -Infinity,
    });

    // Sort by published_at descending
    results.sort((a, b) => {
      const aTime = a.metadata['published_at'] as number ?? 0;
      const bTime = b.metadata['published_at'] as number ?? 0;
      return bTime - aTime;
    });

    return results.map((r) => ({
      id: r.id,
      type: r.metadata['type'] as MarketSignalType,
      sector: r.metadata['sector'] as Sector,
      title: r.metadata['title'] as string,
      content: r.content ?? '',
      source: {
        name: r.metadata['source_name'] as string,
        url: r.metadata['source_url'] as string | undefined,
        credibility: r.metadata['credibility'] as SourceCredibility,
        credibility_score: r.metadata['credibility_score'] as number,
      },
      entities: (r.metadata['entities'] as string[]) ?? [],
      sentiment: r.metadata['sentiment_score'] !== undefined ? {
        score: r.metadata['sentiment_score'] as number,
        label: r.metadata['sentiment_label'] as 'positive' | 'negative' | 'neutral',
        confidence: 0.8,
      } : undefined,
      relevance_tags: (r.metadata['relevance_tags'] as string[]) ?? [],
      published_at: r.metadata['published_at'] as number,
      retrieved_at: r.metadata['retrieved_at'] as number,
      expires_at: r.metadata['expires_at'] as number | undefined,
    }));
  }

  /**
   * Clean up expired signals
   */
  async cleanupExpired(): Promise<number> {
    // In production, this would iterate through all namespaces
    // and delete signals past their expiration date
    console.log('[MarketIntelligence] Cleanup expired signals');
    return 0;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total_signals: number;
    by_sector: Record<string, number>;
    competitive_intel_count: number;
    regulatory_signals_count: number;
  }> {
    const sectors: Sector[] = [
      'technology', 'healthcare', 'industrials', 'consumer',
      'financial_services', 'energy', 'real_estate', 'media',
      'telecommunications', 'materials', 'utilities', 'other',
    ];

    const bySector: Record<string, number> = {};
    let totalSignals = 0;

    for (const sector of sectors) {
      const stats = await this.client.getNamespaceStats(this.getNamespace(sector));
      bySector[sector] = stats.vector_count;
      totalSignals += stats.vector_count;
    }

    const [competitiveStats, regulatoryStats] = await Promise.all([
      this.client.getNamespaceStats(`${this.namespacePrefix}_competitive`),
      this.client.getNamespaceStats(`${this.namespacePrefix}_regulatory`),
    ]);

    return {
      total_signals: totalSignals,
      by_sector: bySector,
      competitive_intel_count: competitiveStats.vector_count,
      regulatory_signals_count: regulatoryStats.vector_count,
    };
  }
}

// Singleton instance
let _marketIntelligence: MarketIntelligence | null = null;

/**
 * Get the singleton Market Intelligence instance
 */
export function getMarketIntelligence(): MarketIntelligence {
  if (!_marketIntelligence) {
    _marketIntelligence = new MarketIntelligence();
  }
  return _marketIntelligence;
}

/**
 * Set a custom Market Intelligence instance (for testing)
 */
export function setMarketIntelligence(intel: MarketIntelligence): void {
  _marketIntelligence = intel;
}
