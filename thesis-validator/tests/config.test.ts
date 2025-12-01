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

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default config when NODE_ENV is not production', async () => {
    process.env['NODE_ENV'] = 'development';
    // Dynamically import to get fresh module after env change
    const { getConfig } = await import('../src/config/index.js');
    const config = await getConfig();
    expect(config).toBeDefined();
    expect(config.api.port).toBe(3000);
  });

  it('should return default config when NODE_ENV is undefined', async () => {
    delete process.env['NODE_ENV'];
    // Dynamically import to get fresh module after env change
    const { getConfig } = await import('../src/config/index.js');
    const config = await getConfig();
    expect(config).toBeDefined();
  });
});
