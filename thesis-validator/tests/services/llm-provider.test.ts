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
  AnthropicVertex: vi.fn().mockImplementation(() => ({
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

      expect(provider.getModel()).toBe('claude-opus-4-5@20251101');
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
