# Backend Test Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive unit tests for the thesis-validator backend, covering all untested modules.

**Architecture:** Follow existing Vitest patterns from `tests/models.test.ts`. Create one test file per module, testing exported functions and classes. Use mocking via `vi.mock()` for external dependencies (LLM clients, databases).

**Tech Stack:** Vitest 2.1.1, TypeScript, vi.mock for mocking

---

## Phase 1: Configuration Tests

### Task 1.1: Test Default Configuration

**Files:**
- Create: `thesis-validator/tests/config.test.ts`
- Test: `thesis-validator/src/config/default.ts`

**Step 1: Create test file with imports**

```typescript
/**
 * Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultConfig, type Config } from '../src/config/default.js';

describe('Default Configuration', () => {
  it('should export defaultConfig object', () => {
    expect(defaultConfig).toBeDefined();
    expect(typeof defaultConfig).toBe('object');
  });

  it('should have api configuration', () => {
    expect(defaultConfig.api).toBeDefined();
    expect(defaultConfig.api.host).toBe('0.0.0.0');
    expect(defaultConfig.api.port).toBe(3000);
    expect(defaultConfig.api.logLevel).toBe('info');
  });

  it('should have llm configuration', () => {
    expect(defaultConfig.llm).toBeDefined();
    expect(defaultConfig.llm.model).toBe('claude-sonnet-4-20250514');
    expect(defaultConfig.llm.maxTokens).toBe(4096);
    expect(defaultConfig.llm.temperature).toBe(0.7);
  });

  it('should have embedding configuration', () => {
    expect(defaultConfig.embedding).toBeDefined();
    expect(defaultConfig.embedding.provider).toBe('openai');
    expect(defaultConfig.embedding.model).toBe('text-embedding-3-small');
    expect(defaultConfig.embedding.dimensions).toBe(1536);
  });

  it('should have ruvector configuration', () => {
    expect(defaultConfig.ruvector).toBeDefined();
    expect(defaultConfig.ruvector.host).toBe('localhost');
    expect(defaultConfig.ruvector.port).toBe(6333);
    expect(defaultConfig.ruvector.collections).toBeDefined();
  });

  it('should have memory configuration', () => {
    expect(defaultConfig.memory).toBeDefined();
    expect(defaultConfig.memory.deal).toBeDefined();
    expect(defaultConfig.memory.institutional).toBeDefined();
    expect(defaultConfig.memory.market).toBeDefined();
  });

  it('should have agent configuration', () => {
    expect(defaultConfig.agents).toBeDefined();
    expect(defaultConfig.agents.conductor.maxConcurrentAgents).toBe(5);
    expect(defaultConfig.agents.hypothesisBuilder.maxDepth).toBe(3);
  });

  it('should have workflow configuration', () => {
    expect(defaultConfig.workflows).toBeDefined();
    expect(defaultConfig.workflows.research.defaultDepth).toBe('standard');
    expect(defaultConfig.workflows.stressTest.devilAdvocateEnabled).toBe(true);
  });

  it('should have security configuration', () => {
    expect(defaultConfig.security).toBeDefined();
    expect(defaultConfig.security.jwtExpiresIn).toBe('24h');
    expect(defaultConfig.security.bcryptRounds).toBe(10);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd thesis-validator && npm test -- tests/config.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add thesis-validator/tests/config.test.ts
git commit -m "test: add configuration tests"
```

---

### Task 1.2: Test getConfig Function

**Files:**
- Modify: `thesis-validator/tests/config.test.ts`
- Test: `thesis-validator/src/config/index.ts`

**Step 1: Add tests for getConfig**

Add to `thesis-validator/tests/config.test.ts`:

```typescript
import { getConfig } from '../src/config/index.js';

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default config when NODE_ENV is not production', () => {
    process.env['NODE_ENV'] = 'development';
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.api.port).toBe(3000);
  });

  it('should return default config when NODE_ENV is undefined', () => {
    delete process.env['NODE_ENV'];
    const config = getConfig();
    expect(config).toBeDefined();
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd thesis-validator && npm test -- tests/config.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add thesis-validator/tests/config.test.ts
git commit -m "test: add getConfig tests"
```

---

## Phase 2: Credibility Scorer Tests

### Task 2.1: Test CredibilityScorer Class

**Files:**
- Create: `thesis-validator/tests/tools/credibility-scorer.test.ts`
- Test: `thesis-validator/src/tools/credibility-scorer.ts`

**Step 1: Create test file with basic scorer tests**

```typescript
/**
 * Credibility Scorer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CredibilityScorer,
  getCredibilityScorer,
  setCredibilityScorer,
  scoreCredibility,
  type SourceMetadata,
  type PublicationType,
} from '../../src/tools/credibility-scorer.js';

describe('CredibilityScorer', () => {
  let scorer: CredibilityScorer;

  beforeEach(() => {
    scorer = new CredibilityScorer();
  });

  describe('score()', () => {
    it('should return a credibility score with all components', () => {
      const metadata: SourceMetadata = {
        url: 'https://wsj.com/article/test',
        domain: 'wsj.com',
        author: 'John Smith',
        publicationType: 'news_major',
        publishedDate: new Date(),
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
      expect(result.components).toBeDefined();
      expect(result.components.domainReputation).toBeDefined();
      expect(result.components.publicationType).toBeDefined();
      expect(result.components.authorCredibility).toBeDefined();
      expect(result.components.freshness).toBeDefined();
      expect(result.components.citationDensity).toBeDefined();
      expect(result.factors).toHaveLength(5);
      expect(result.recommendation).toBeDefined();
    });

    it('should give high score to academic journals', () => {
      const metadata: SourceMetadata = {
        url: 'https://arxiv.org/paper/12345',
        publicationType: 'academic_journal',
        publishedDate: new Date(),
        isPeerReviewed: true,
        citationCount: 50,
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeGreaterThan(0.7);
      expect(result.recommendation).toBe('high_confidence');
    });

    it('should give low score to social media', () => {
      const metadata: SourceMetadata = {
        url: 'https://twitter.com/user/status/123',
        publicationType: 'social_media',
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeLessThan(0.5);
      expect(['low_confidence', 'verify_required']).toContain(result.recommendation);
    });

    it('should give moderate score to news trade publications', () => {
      const metadata: SourceMetadata = {
        url: 'https://techcrunch.com/article',
        publicationType: 'news_trade',
        author: 'Tech Writer',
        publishedDate: new Date(),
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeGreaterThan(0.4);
      expect(result.overall).toBeLessThan(0.8);
    });
  });

  describe('inferPublicationType()', () => {
    it('should infer government_report for .gov domains', () => {
      expect(scorer.inferPublicationType('https://sec.gov/document')).toBe('government_report');
      expect(scorer.inferPublicationType('https://data.gov.uk/report')).toBe('government_report');
    });

    it('should infer academic_journal for .edu domains', () => {
      expect(scorer.inferPublicationType('https://stanford.edu/research')).toBe('academic_journal');
      expect(scorer.inferPublicationType('https://arxiv.org/abs/1234')).toBe('academic_journal');
    });

    it('should infer news_major for major news outlets', () => {
      expect(scorer.inferPublicationType('https://wsj.com/article')).toBe('news_major');
      expect(scorer.inferPublicationType('https://nytimes.com/story')).toBe('news_major');
      expect(scorer.inferPublicationType('https://bloomberg.com/news')).toBe('news_major');
    });

    it('should infer industry_report for consulting firms', () => {
      expect(scorer.inferPublicationType('https://mckinsey.com/insights')).toBe('industry_report');
      expect(scorer.inferPublicationType('https://gartner.com/report')).toBe('industry_report');
    });

    it('should infer social_media for social platforms', () => {
      expect(scorer.inferPublicationType('https://twitter.com/user')).toBe('social_media');
      expect(scorer.inferPublicationType('https://linkedin.com/post')).toBe('social_media');
    });

    it('should return unknown for unrecognized domains', () => {
      expect(scorer.inferPublicationType('https://random-domain.xyz/page')).toBe('unknown');
    });
  });
});

describe('Singleton and Helper Functions', () => {
  it('getCredibilityScorer should return singleton instance', () => {
    const scorer1 = getCredibilityScorer();
    const scorer2 = getCredibilityScorer();
    expect(scorer1).toBe(scorer2);
  });

  it('setCredibilityScorer should replace singleton', () => {
    const customScorer = new CredibilityScorer();
    setCredibilityScorer(customScorer);
    expect(getCredibilityScorer()).toBe(customScorer);
  });

  it('scoreCredibility helper should work', () => {
    const metadata: SourceMetadata = {
      url: 'https://example.com',
    };
    const result = scoreCredibility(metadata);
    expect(result.overall).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd thesis-validator && npm test -- tests/tools/credibility-scorer.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add thesis-validator/tests/tools/credibility-scorer.test.ts
git commit -m "test: add credibility scorer tests"
```

---

### Task 2.2: Test Credibility Scorer Edge Cases

**Files:**
- Modify: `thesis-validator/tests/tools/credibility-scorer.test.ts`

**Step 1: Add edge case tests**

Add to the test file:

```typescript
describe('Credibility Score Components', () => {
  let scorer: CredibilityScorer;

  beforeEach(() => {
    scorer = new CredibilityScorer();
  });

  describe('Author Credibility', () => {
    it('should give higher score for authors with expert titles', () => {
      const expertMetadata: SourceMetadata = {
        url: 'https://example.com',
        author: 'Dr. Jane Smith',
        authorTitle: 'PhD, Professor of Economics',
        authorOrganization: 'Harvard University',
      };

      const basicMetadata: SourceMetadata = {
        url: 'https://example.com',
        author: 'John Doe',
      };

      const expertResult = scorer.score(expertMetadata);
      const basicResult = scorer.score(basicMetadata);

      expect(expertResult.components.authorCredibility).toBeGreaterThan(
        basicResult.components.authorCredibility
      );
    });

    it('should give low score when author is missing', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
      };

      const result = scorer.score(metadata);
      expect(result.components.authorCredibility).toBe(0.4);
    });
  });

  describe('Freshness', () => {
    it('should give high score for recent content', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
        publishedDate: new Date(), // Today
      };

      const result = scorer.score(metadata);
      expect(result.components.freshness).toBe(1.0);
    });

    it('should give lower score for older content', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const metadata: SourceMetadata = {
        url: 'https://example.com',
        publishedDate: twoYearsAgo,
      };

      const result = scorer.score(metadata);
      expect(result.components.freshness).toBeLessThan(0.5);
    });

    it('should give neutral score when date is unknown', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
      };

      const result = scorer.score(metadata);
      expect(result.components.freshness).toBe(0.5);
    });
  });

  describe('Citation Density', () => {
    it('should give high score for highly cited content', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
        citationCount: 150,
      };

      const result = scorer.score(metadata);
      expect(result.components.citationDensity).toBeGreaterThanOrEqual(0.95);
    });

    it('should detect citations in content', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
      };
      const content = `
        According to Smith (2023), the market grew by 20% [1].
        This was confirmed by Jones (2024) in a recent study [2].
        Source: https://example.com/study
      `;

      const result = scorer.score(metadata, content);
      expect(result.components.citationDensity).toBeGreaterThan(0.5);
    });

    it('should give high score for original research', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
        isOriginalResearch: true,
      };

      const result = scorer.score(metadata);
      expect(result.components.citationDensity).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('Recommendation Thresholds', () => {
    it('should recommend high_confidence for scores >= 0.75', () => {
      const metadata: SourceMetadata = {
        url: 'https://nature.com/article',
        publicationType: 'academic_journal',
        isPeerReviewed: true,
        author: 'Dr. Expert',
        authorTitle: 'Professor',
        authorOrganization: 'MIT',
        publishedDate: new Date(),
        citationCount: 100,
      };

      const result = scorer.score(metadata);
      expect(result.recommendation).toBe('high_confidence');
    });

    it('should recommend verify_required for very low scores', () => {
      const metadata: SourceMetadata = {
        url: 'https://random-forum.xyz/post',
        publicationType: 'forum',
      };

      const result = scorer.score(metadata);
      expect(result.recommendation).toBe('verify_required');
    });
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd thesis-validator && npm test -- tests/tools/credibility-scorer.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add thesis-validator/tests/tools/credibility-scorer.test.ts
git commit -m "test: add credibility scorer edge case tests"
```

---

## Phase 3: LLM Provider Tests

### Task 3.1: Test LLM Provider Configuration

**Files:**
- Create: `thesis-validator/tests/services/llm-provider.test.ts`
- Test: `thesis-validator/src/services/llm-provider.ts`

**Step 1: Create test file with mocked dependencies**

```typescript
/**
 * LLM Provider Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LLMProvider,
  getLLMProviderConfig,
  resetLLMProvider,
  createLLMProvider,
  type LLMProviderConfig,
} from '../../src/services/llm-provider.js';

// Mock the external SDK clients
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      }),
    },
  })),
}));

vi.mock('@anthropic-ai/vertex-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock vertex response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      }),
    },
  })),
}));

vi.mock('../../src/services/google-auth.js', () => ({
  getGoogleAuthService: vi.fn().mockReturnValue({
    initialize: vi.fn().mockResolvedValue(undefined),
    getProjectId: vi.fn().mockReturnValue('test-project'),
    getRegion: vi.fn().mockReturnValue('us-central1'),
  }),
}));

describe('LLMProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resetLLMProvider();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create provider with anthropic config', () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      const provider = new LLMProvider(config);

      expect(provider.getProviderType()).toBe('anthropic');
      expect(provider.isReady()).toBe(false);
    });

    it('should create provider with vertex-ai config', () => {
      const config: LLMProviderConfig = {
        provider: 'vertex-ai',
        projectId: 'test-project',
        region: 'us-central1',
      };

      const provider = new LLMProvider(config);

      expect(provider.getProviderType()).toBe('vertex-ai');
      expect(provider.isReady()).toBe(false);
    });

    it('should use default values for optional config', () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      const provider = new LLMProvider(config);

      expect(provider.getModel()).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('initialize()', () => {
    it('should initialize anthropic provider', async () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      const provider = new LLMProvider(config);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize vertex-ai provider', async () => {
      const config: LLMProviderConfig = {
        provider: 'vertex-ai',
        projectId: 'test-project',
        region: 'us-central1',
      };

      const provider = new LLMProvider(config);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw error if anthropic API key is missing', async () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: '',
      };

      const provider = new LLMProvider(config);

      await expect(provider.initialize()).rejects.toThrow('ANTHROPIC_API_KEY is required');
    });

    it('should not re-initialize if already initialized', async () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      const provider = new LLMProvider(config);
      await provider.initialize();
      await provider.initialize(); // Second call should be no-op

      expect(provider.isReady()).toBe(true);
    });
  });

  describe('createMessage()', () => {
    it('should create message with anthropic provider', async () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      const provider = new LLMProvider(config);

      const response = await provider.createMessage({
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1000,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.content).toBeDefined();
      expect(response.usage.input_tokens).toBe(10);
      expect(response.usage.output_tokens).toBe(20);
    });

    it('should auto-initialize if not ready', async () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      const provider = new LLMProvider(config);
      expect(provider.isReady()).toBe(false);

      await provider.createMessage({
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1000,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(provider.isReady()).toBe(true);
    });
  });

  describe('getGoogleAuth()', () => {
    it('should return null for anthropic provider', async () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      const provider = new LLMProvider(config);
      await provider.initialize();

      expect(provider.getGoogleAuth()).toBeNull();
    });

    it('should return auth service for vertex-ai provider', async () => {
      const config: LLMProviderConfig = {
        provider: 'vertex-ai',
        projectId: 'test-project',
      };

      const provider = new LLMProvider(config);
      await provider.initialize();

      expect(provider.getGoogleAuth()).not.toBeNull();
    });
  });
});

describe('getLLMProviderConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return anthropic config by default', () => {
    delete process.env['LLM_PROVIDER'];
    const config = getLLMProviderConfig();
    expect(config.provider).toBe('anthropic');
  });

  it('should return vertex-ai config when specified', () => {
    process.env['LLM_PROVIDER'] = 'vertex-ai';
    const config = getLLMProviderConfig();
    expect(config.provider).toBe('vertex-ai');
  });

  it('should read model from environment', () => {
    process.env['ANTHROPIC_MODEL'] = 'claude-3-opus';
    const config = getLLMProviderConfig();
    expect(config.model).toBe('claude-3-opus');
  });

  it('should read maxTokens from environment', () => {
    process.env['ANTHROPIC_MAX_TOKENS'] = '8192';
    const config = getLLMProviderConfig();
    expect(config.maxTokens).toBe(8192);
  });
});

describe('createLLMProvider', () => {
  it('should create a new provider instance', () => {
    const config: LLMProviderConfig = {
      provider: 'anthropic',
      apiKey: 'test-key',
    };

    const provider = createLLMProvider(config);
    expect(provider).toBeInstanceOf(LLMProvider);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd thesis-validator && npm test -- tests/services/llm-provider.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add thesis-validator/tests/services/llm-provider.test.ts
git commit -m "test: add LLM provider tests with mocked clients"
```

---

## Phase 4: Add Coverage Thresholds

### Task 4.1: Update Vitest Config with Coverage Thresholds

**Files:**
- Modify: `thesis-validator/vitest.config.ts`

**Step 1: Read current config**

Read the current vitest.config.ts file.

**Step 2: Add coverage thresholds**

Update `thesis-validator/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        statements: 20,
        branches: 15,
        functions: 20,
        lines: 20,
      },
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

**Step 3: Run coverage to verify thresholds work**

Run: `cd thesis-validator && npm run test:coverage`
Expected: Coverage report generated with threshold checking

**Step 4: Commit**

```bash
git add thesis-validator/vitest.config.ts
git commit -m "build: add initial coverage thresholds to vitest config"
```

---

## Phase 5: Run Full Test Suite

### Task 5.1: Verify All Tests Pass

**Step 1: Run all tests**

Run: `cd thesis-validator && npm test`
Expected: All tests PASS

**Step 2: Run tests with coverage**

Run: `cd thesis-validator && npm run test:coverage`
Expected: Coverage report generated, thresholds met

**Step 3: Final commit if needed**

If any adjustments were needed, commit them.

---

## Success Criteria

- [ ] `thesis-validator/tests/config.test.ts` exists and passes
- [ ] `thesis-validator/tests/tools/credibility-scorer.test.ts` exists and passes
- [ ] `thesis-validator/tests/services/llm-provider.test.ts` exists and passes
- [ ] `npm test` passes all tests
- [ ] `npm run test:coverage` generates report
- [ ] Coverage thresholds are configured in vitest.config.ts

## Manual Verification

After automated tests pass:
1. Review coverage report HTML at `thesis-validator/coverage/index.html`
2. Verify the new test files follow existing patterns from `tests/models.test.ts`
3. Confirm mocking patterns work correctly for external dependencies
