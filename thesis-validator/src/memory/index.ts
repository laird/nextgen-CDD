/**
 * Memory System - Vector database backed memory for Thesis Validator
 *
 * Three-tier memory architecture:
 * 1. Deal Memory - Per-engagement isolated namespace
 * 2. Institutional Memory - Cross-deal learnings
 * 3. Market Intelligence - Real-time market signals
 */

import { getRuvectorClient } from './ruvector-client.js';
import { getInstitutionalMemory } from './institutional-memory.js';
import { getMarketIntelligence } from './market-intelligence.js';
import { getReflexionStore } from './reflexion-store.js';
import { getSkillLibrary } from './skill-library.js';

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
export { createLLMSkillExecutor } from './skill-executor.js';

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

  // Seed default skills if ENABLE_SKILL_LIBRARY is set
  if (process.env['ENABLE_SKILL_LIBRARY'] === 'true') {
    try {
      const seededCount = await skillLibrary.seedDefaultSkills('system');
      if (seededCount > 0) {
        console.log(`[Memory] Seeded ${seededCount} default skills`);
      }
    } catch (error) {
      console.warn('[Memory] Failed to seed default skills:', error);
    }
  }

  console.log('[Memory] All memory systems initialized');
}

/**
 * Get aggregated memory statistics
 */
export async function getMemoryStats(): Promise<{
  institutional: {
    reflexion_count: number;
    skill_count: number;
    pattern_count: number;
    sector_knowledge_count: number;
    methodology_count: number;
    entity_count: number;
  };
  market: {
    total_signals: number;
    by_sector: Record<string, number>;
    competitive_intel_count: number;
    regulatory_signals_count: number;
  };
  reflexions: {
    total_episodes: number;
    success_rate: number;
    episodes_by_task_type: Record<string, number>;
    episodes_by_sector: Record<string, number>;
  };
  skills: {
    total_skills: number;
    by_category: Record<string, number>;
    average_success_rate: number;
    total_executions: number;
  };
}> {
  const [institutional, market, reflexions, skills] = await Promise.all([
    getInstitutionalMemory().getStats(),
    getMarketIntelligence().getStats(),
    getReflexionStore().getStats(),
    getSkillLibrary().getStats(),
  ]);

  return { institutional, market, reflexions, skills };
}
