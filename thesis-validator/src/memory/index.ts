/**
 * Memory System - Vector database backed memory for Thesis Validator
 *
 * Three-tier memory architecture:
 * 1. Deal Memory - Per-engagement isolated namespace
 * 2. Institutional Memory - Cross-deal learnings
 * 3. Market Intelligence - Real-time market signals
 */

// Ruvector client
export {
  RuvectorClient,
  createRuvectorClient,
  getRuvectorClient,
  setRuvectorClient,
  type RuvectorConfig,
  type VectorEntry,
  type SearchResult,
  type ProvenanceCertificate,
  type CausalEdgeEntry,
  type ReflexionEntry,
  type SkillEntry,
  type SearchOptions,
  type CausalQueryOptions,
} from './ruvector-client.js';

// Deal Memory
export {
  DealMemory,
  createDealMemory,
  type TranscriptChunk,
  type DocumentMetadata,
  type ResearchSessionLog,
} from './deal-memory.js';

// Institutional Memory
export {
  InstitutionalMemory,
  getInstitutionalMemory,
  setInstitutionalMemory,
  type DealPattern,
  type SectorKnowledge,
  type MethodologyTemplate,
} from './institutional-memory.js';

// Market Intelligence
export {
  MarketIntelligence,
  getMarketIntelligence,
  setMarketIntelligence,
  type MarketSignal,
  type MarketSignalType,
  type SourceCredibility,
  type CompetitiveIntelligence,
  type RegulatorySignal,
  type MarketSearchOptions,
} from './market-intelligence.js';

// Reflexion Store
export {
  ReflexionStore,
  getReflexionStore,
  setReflexionStore,
  type ReflexionInsights,
  type ReflexionQueryFilters,
} from './reflexion-store.js';

// Skill Library
export {
  SkillLibrary,
  getSkillLibrary,
  setSkillLibrary,
  type SkillVersion,
  type SkillExecutionContext,
  type SkillExecutor,
} from './skill-library.js';

/**
 * Initialize all memory systems
 */
export async function initializeMemorySystems(): Promise<void> {
  const ruvector = getRuvectorClient();
  await ruvector.initialize();

  const institutionalMemory = getInstitutionalMemory();
  await institutionalMemory.initialize();

  const marketIntelligence = getMarketIntelligence();
  await marketIntelligence.initialize();

  const reflexionStore = getReflexionStore();
  await reflexionStore.initialize();

  const skillLibrary = getSkillLibrary();
  await skillLibrary.initialize();

  console.log('[Memory] All memory systems initialized');
}

/**
 * Get aggregated memory statistics
 */
export async function getMemoryStats(): Promise<{
  institutional: Awaited<ReturnType<InstitutionalMemory['getStats']>>;
  market: Awaited<ReturnType<MarketIntelligence['getStats']>>;
  reflexions: Awaited<ReturnType<ReflexionStore['getStats']>>;
  skills: Awaited<ReturnType<SkillLibrary['getStats']>>;
}> {
  const [institutional, market, reflexions, skills] = await Promise.all([
    getInstitutionalMemory().getStats(),
    getMarketIntelligence().getStats(),
    getReflexionStore().getStats(),
    getSkillLibrary().getStats(),
  ]);

  return { institutional, market, reflexions, skills };
}
