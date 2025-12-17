/**
 * Model Provider Factory
 *
 * Provides a unified interface for creating LLM model instances using the Vercel AI SDK.
 * Supports multiple providers: Anthropic, Google Vertex AI, and Ollama.
 *
 * This abstraction allows easy switching between providers without changing agent code.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/**
 * Supported model providers
 */
export type ModelProviderType = 'anthropic' | 'vertex-ai' | 'ollama';

/**
 * Model provider configuration
 */
export interface ModelProviderConfig {
  provider: ModelProviderType;
  model?: string;
  // Anthropic-specific
  apiKey?: string;
  // Vertex AI-specific
  projectId?: string;
  region?: string;
  // Ollama-specific
  baseUrl?: string;
}

/**
 * Default models for each provider
 */
const DEFAULT_MODELS: Record<ModelProviderType, string> = {
  anthropic: 'claude-opus-4-5@20251101',
  'vertex-ai': 'claude-opus-4-5@20251101',
  ollama: 'llama3.2',
};

/**
 * Get model provider configuration from environment variables
 */
export function getModelProviderConfig(): ModelProviderConfig {
  const providerEnv = process.env['LLM_PROVIDER'] ?? 'anthropic';
  let provider: ModelProviderType;

  if (providerEnv === 'vertex-ai') {
    provider = 'vertex-ai';
  } else if (providerEnv === 'ollama') {
    provider = 'ollama';
  } else {
    provider = 'anthropic';
  }

  const config: ModelProviderConfig = {
    provider,
    model:
      process.env['LLM_MODEL'] ??
      process.env['ANTHROPIC_MODEL'] ??
      process.env['VERTEX_AI_MODEL'] ??
      process.env['OLLAMA_MODEL'] ??
      DEFAULT_MODELS[provider],
  };

  // Anthropic config
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey !== undefined) {
    config.apiKey = apiKey;
  }

  // Vertex AI config
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  if (projectId !== undefined) {
    config.projectId = projectId;
  }

  const region = process.env['GOOGLE_CLOUD_REGION'];
  if (region !== undefined) {
    config.region = region;
  }

  // Ollama config
  const baseUrl = process.env['OLLAMA_BASE_URL'];
  if (baseUrl !== undefined) {
    config.baseUrl = baseUrl;
  }

  return config;
}

/**
 * Create a language model instance based on provider configuration
 */
export function createModel(config?: Partial<ModelProviderConfig>): LanguageModel {
  const fullConfig = { ...getModelProviderConfig(), ...config };
  const modelId = fullConfig.model ?? DEFAULT_MODELS[fullConfig.provider];

  switch (fullConfig.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        // API key is read from ANTHROPIC_API_KEY env var by default
      });
      return anthropic(modelId);
    }

    case 'vertex-ai': {
      const vertexConfig: { project?: string; location?: string } = {};
      if (fullConfig.projectId) {
        vertexConfig.project = fullConfig.projectId;
      }
      if (fullConfig.region) {
        vertexConfig.location = fullConfig.region;
      } else {
        vertexConfig.location = 'us-central1';
      }
      const vertex = createVertex(vertexConfig);
      return vertex(modelId);
    }

    case 'ollama': {
      // Use OpenAI-compatible provider for Ollama since Ollama supports the OpenAI API
      const ollama = createOpenAICompatible({
        name: 'ollama',
        baseURL: fullConfig.baseUrl ?? 'http://localhost:11434/v1',
      });
      return ollama.languageModel(modelId);
    }

    default:
      throw new Error(`Unsupported model provider: ${fullConfig.provider}`);
  }
}

/**
 * Create a model instance for a specific provider (for explicit provider selection)
 */
export function createAnthropicModel(modelId?: string): LanguageModel {
  const anthropic = createAnthropic({});
  return anthropic(modelId ?? DEFAULT_MODELS.anthropic);
}

export function createVertexModel(
  modelId?: string,
  options?: { projectId?: string; region?: string }
): LanguageModel {
  const vertexConfig: { project?: string; location?: string } = {};
  if (options?.projectId) {
    vertexConfig.project = options.projectId;
  }
  vertexConfig.location = options?.region ?? 'us-central1';
  const vertex = createVertex(vertexConfig);
  return vertex(modelId ?? DEFAULT_MODELS['vertex-ai']);
}

export function createOllamaModel(modelId?: string, baseUrl?: string): LanguageModel {
  const ollama = createOpenAICompatible({
    name: 'ollama',
    baseURL: baseUrl ?? 'http://localhost:11434/v1',
  });
  return ollama.languageModel(modelId ?? DEFAULT_MODELS.ollama);
}

/**
 * Get the default model ID for a provider
 */
export function getDefaultModel(provider: ModelProviderType): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Check if a provider is available (has required configuration)
 */
export function isProviderAvailable(provider: ModelProviderType): boolean {
  switch (provider) {
    case 'anthropic':
      return !!process.env['ANTHROPIC_API_KEY'];
    case 'vertex-ai':
      return !!process.env['GOOGLE_CLOUD_PROJECT'];
    case 'ollama':
      // Ollama is always "available" - it just needs to be running locally
      return true;
    default:
      return false;
  }
}

/**
 * List available providers based on current configuration
 */
export function listAvailableProviders(): ModelProviderType[] {
  const providers: ModelProviderType[] = ['anthropic', 'vertex-ai', 'ollama'];
  return providers.filter(isProviderAvailable);
}
