/**
 * Web Search Tool - AI-optimized web research using Tavily
 *
 * Provides structured web search results for research agents.
 * Supports advanced search options and result processing.
 */

/**
 * Web search result
 */
export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  rawContent?: string;
  score: number;
  publishedDate?: string;
}

/**
 * Web search response
 */
export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  answer?: string;
  responseTime: number;
  followUpQuestions?: string[];
}

/**
 * Web search options
 */
export interface WebSearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  topic?: 'general' | 'news' | 'finance';
  daysLimit?: number;
}

/**
 * Default search options
 */
const defaultOptions: WebSearchOptions = {
  maxResults: 10,
  searchDepth: 'advanced',
  includeAnswer: true,
  includeRawContent: false,
  topic: 'general',
};

/**
 * Web Search Service using Tavily API
 */
export class WebSearchService {
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env['TAVILY_API_KEY'] ?? '';
    if (!this.apiKey) {
      console.warn('[WebSearchService] No Tavily API key configured');
    }
  }

  /**
   * Perform a web search
   */
  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse> {
    const opts = { ...defaultOptions, ...options };
    const startTime = Date.now();

    if (!this.apiKey) {
      // Return mock results for development
      return this.mockSearch(query, opts, startTime);
    }

    try {
      const httpResponse = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: opts.maxResults,
          search_depth: opts.searchDepth,
          include_domains: opts.includeDomains,
          exclude_domains: opts.excludeDomains,
          include_answer: opts.includeAnswer,
          include_raw_content: opts.includeRawContent,
          topic: opts.topic,
          days: opts.daysLimit,
        }),
      });

      if (!httpResponse.ok) {
        // Handle Quota Exceeded/Rate Limit specifically
        if (httpResponse.status === 432 || httpResponse.status === 429) {
          throw new Error(`Tavily API Rate Limit/Quota Exceeded (${httpResponse.status})`);
        }

        const errorText = await httpResponse.text();
        console.error(`[WebSearchService] Tavily API Error Body: ${errorText}`);
        throw new Error(`Tavily API error: ${httpResponse.status} ${httpResponse.statusText}`);
      }

      const data = await httpResponse.json() as {
        query: string;
        results: Array<{
          title: string;
          url: string;
          content: string;
          raw_content?: string;
          score: number;
          published_date?: string;
        }>;
        answer?: string;
        follow_up_questions?: string[];
      };

      const searchResponse: WebSearchResponse = {
        query: data.query,
        results: data.results.map((r) => {
          const result: WebSearchResult = {
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
          };

          if (r.raw_content !== undefined) {
            result.rawContent = r.raw_content;
          }

          if (r.published_date !== undefined) {
            result.publishedDate = r.published_date;
          }

          return result;
        }),
        responseTime: Date.now() - startTime,
      };

      if (data.answer !== undefined) {
        searchResponse.answer = data.answer;
      }

      if (data.follow_up_questions !== undefined) {
        searchResponse.followUpQuestions = data.follow_up_questions;
      }

      return searchResponse;
    } catch (error) {
      console.error('[WebSearchService] Search error:', error);

      // Also fallback if we caught the error above (though the return inside if handles it)
      // or if network failed completely, maybe we should fallback?
      // For now, only fallback on explicit quota error logic above.

      throw error;
    }
  }

  /**
   * Search for news articles
   */
  async searchNews(
    query: string,
    options?: Omit<WebSearchOptions, 'topic'>
  ): Promise<WebSearchResponse> {
    return this.search(query, { ...options, topic: 'news' });
  }

  /**
   * Search for financial information
   */
  async searchFinance(
    query: string,
    options?: Omit<WebSearchOptions, 'topic'>
  ): Promise<WebSearchResponse> {
    return this.search(query, { ...options, topic: 'finance' });
  }

  /**
   * Search with domain restrictions
   */
  async searchDomains(
    query: string,
    domains: string[],
    options?: WebSearchOptions
  ): Promise<WebSearchResponse> {
    return this.search(query, { ...options, includeDomains: domains });
  }

  /**
   * Search excluding specific domains
   */
  async searchExcludingDomains(
    query: string,
    excludeDomains: string[],
    options?: WebSearchOptions
  ): Promise<WebSearchResponse> {
    return this.search(query, { ...options, excludeDomains: excludeDomains });
  }

  /**
   * Search recent results only
   */
  async searchRecent(
    query: string,
    daysLimit: number,
    options?: WebSearchOptions
  ): Promise<WebSearchResponse> {
    return this.search(query, { ...options, daysLimit });
  }

  /**
   * Generate adversarial search queries for contradiction hunting
   */
  generateBearCaseQueries(hypothesis: string): string[] {
    const queries: string[] = [];

    // Negation-based queries
    queries.push(`${hypothesis} criticism`);
    queries.push(`${hypothesis} problems`);
    queries.push(`${hypothesis} challenges`);
    queries.push(`${hypothesis} failure`);
    queries.push(`${hypothesis} risks`);
    queries.push(`why ${hypothesis} won't work`);
    queries.push(`${hypothesis} skepticism`);
    queries.push(`${hypothesis} counterargument`);

    // Comparative queries
    queries.push(`${hypothesis} vs alternatives`);
    queries.push(`better than ${hypothesis}`);

    return queries;
  }

  /**
   * Mock search for development/testing
   */
  private mockSearch(
    query: string,
    _options: WebSearchOptions,
    startTime: number
  ): WebSearchResponse {
    return {
      query,
      results: [
        {
          title: `[Mock] Result for: ${query}`,
          url: 'https://example.com/mock-result',
          content: `This is a mock search result for the query: "${query}". In production, this would contain actual web search results from Tavily.`,
          score: 0.95,
          publishedDate: new Date().toISOString(),
        },
      ],
      answer: `[Mock] Based on web search, here's an answer about "${query}". Configure TAVILY_API_KEY for real results.`,
      responseTime: Date.now() - startTime,
      followUpQuestions: [
        `What are the implications of ${query}?`,
        `How does ${query} compare to alternatives?`,
      ],
    };
  }
}

/**
 * Source quality domains for credibility scoring
 */
export const credibleDomains = {
  high: [
    'sec.gov',
    'federalreserve.gov',
    'bls.gov',
    'census.gov',
    'wsj.com',
    'ft.com',
    'bloomberg.com',
    'reuters.com',
    'economist.com',
    'hbr.org',
    'mckinsey.com',
    'bcg.com',
    'bain.com',
  ],
  medium: [
    'businessinsider.com',
    'forbes.com',
    'techcrunch.com',
    'cnbc.com',
    'marketwatch.com',
    'seekingalpha.com',
    'pitchbook.com',
    'crunchbase.com',
  ],
  low: [
    'medium.com',
    'substack.com',
    'linkedin.com',
    'twitter.com',
    'reddit.com',
  ],
};

/**
 * Get domain credibility category
 */
export function getDomainCredibility(url: string): 'high' | 'medium' | 'low' | 'unknown' {
  try {
    const domain = new URL(url).hostname.replace('www.', '');

    for (const [category, domains] of Object.entries(credibleDomains) as Array<['high' | 'medium' | 'low', string[]]>) {
      if (domains.some((d) => domain.includes(d) || domain.endsWith(d))) {
        return category;
      }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// Singleton instance
let _webSearchService: WebSearchService | null = null;

/**
 * Get the singleton Web Search Service
 */
export function getWebSearchService(): WebSearchService {
  if (!_webSearchService) {
    _webSearchService = new WebSearchService();
  }
  return _webSearchService;
}

/**
 * Set a custom Web Search Service (for testing)
 */
export function setWebSearchService(service: WebSearchService): void {
  _webSearchService = service;
}

/**
 * Helper function to search the web
 */
export async function webSearch(
  query: string,
  options?: WebSearchOptions
): Promise<WebSearchResponse> {
  return getWebSearchService().search(query, options);
}
