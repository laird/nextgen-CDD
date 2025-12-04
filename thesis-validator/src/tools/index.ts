/**
 * Tools - Utility services for Thesis Validator
 *
 * Provides embedding, search, document parsing, credibility scoring,
 * and transcript processing capabilities.
 */

// Embedding
export {
  EmbeddingService,
  getEmbeddingService,
  setEmbeddingService,
  embed,
  embedBatch,
  type EmbeddingConfig,
  type EmbeddingStats,
} from './embedding.js';

// Web Search
export {
  WebSearchService,
  getWebSearchService,
  setWebSearchService,
  webSearch,
  getDomainCredibility,
  credibleDomains,
  type WebSearchResult,
  type WebSearchResponse,
  type WebSearchOptions,
} from './web-search.js';

// Document Parser
export {
  DocumentParser,
  getDocumentParser,
  setDocumentParser,
  parseDocument,
  extractTextFromChunks,
  type ParsedDocument,
  type DocumentChunk,
  type DocumentMetadata,
  type ParsedTable,
  type ImageReference,
  type ParserOptions,
} from './document-parser.js';

// Credibility Scorer
export {
  CredibilityScorer,
  getCredibilityScorer,
  setCredibilityScorer,
  scoreCredibility,
  type CredibilityScore,
  type CredibilityFactor,
  type SourceMetadata,
  type PublicationType,
} from './credibility-scorer.js';

// Transcript Processor
export {
  TranscriptProcessor,
  getTranscriptProcessor,
  setTranscriptProcessor,
  type TranscriptSegment,
  type TranscriptInsight,
  type InsightType,
  type ExpertProfile,
  type TranscriptAnalysis,
  type ExtractedQuote,
  type DiscussedTopic,
  type RealtimeChunk,
  type RealtimeInsight,
} from './transcript-processor.js';

// AlphaVantage REST API Financial Data
export {
  AlphaVantageClient,
  getAlphaVantageClient,
  setAlphaVantageClient,
  gatherFinancialEvidence,
  type AlphaVantageConfig,
  type StockQuote,
  type TimeSeriesDataPoint,
  type CompanyOverview,
  type IncomeStatement,
  type BalanceSheet,
  type CashFlowStatement,
  type NewsArticle,
  type InsiderTransaction,
  type EconomicDataPoint,
  type TechnicalIndicatorResult,
  type EarningsData,
  type MarketMovers,
  type FinancialDataResult,
} from './alphavantage-rest.js';
