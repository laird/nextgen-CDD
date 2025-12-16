/**
 * Services Module
 *
 * Exports all service modules for easy importing
 */

// Google Cloud Authentication
export {
  GoogleAuthService,
  getGoogleAuthService,
  resetGoogleAuthService,
  type GoogleAuthConfig,
} from './google-auth.js';

// LLM Provider (legacy - for backwards compatibility)
export {
  LLMProvider,
  getLLMProvider,
  getLLMProviderConfig,
  createLLMProvider,
  resetLLMProvider,
  type LLMProviderType,
  type LLMProviderConfig,
  type LLMMessage,
  type LLMTool,
  type LLMRequest,
  type LLMResponse,
} from './llm-provider.js';

// Model Provider (new - Vercel AI SDK based)
export {
  createModel,
  createAnthropicModel,
  createVertexModel,
  createOllamaModel,
  getModelProviderConfig,
  getDefaultModel,
  isProviderAvailable,
  listAvailableProviders,
  type ModelProviderType,
  type ModelProviderConfig,
} from './model-provider.js';
