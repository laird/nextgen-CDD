/**
 * LLM Provider Service
 *
 * Provides a unified interface for LLM interactions, supporting both:
 * 1. Direct Anthropic API (using API key)
 * 2. Vertex AI (using Google Cloud Application Default Credentials)
 *
 * The provider is selected based on configuration, allowing seamless switching
 * between deployment environments.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { getGoogleAuthService, type GoogleAuthService } from './google-auth.js';

/**
 * Supported LLM providers
 */
export type LLMProviderType = 'anthropic' | 'vertex-ai';

/**
 * LLM Provider configuration
 */
export interface LLMProviderConfig {
  provider: LLMProviderType;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  // Anthropic-specific
  apiKey?: string;
  // Vertex AI-specific
  projectId?: string;
  region?: string;
}

/**
 * Message format for LLM requests
 */
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

/**
 * Tool definition for LLM requests
 */
export interface LLMTool {
  name: string;
  description?: string;
  input_schema: Anthropic.Tool.InputSchema;
}

/**
 * LLM request parameters
 */
export interface LLMRequest {
  model: string;
  maxTokens: number;
  temperature?: number;
  system?: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
}

/**
 * LLM response
 */
export interface LLMResponse {
  content: Anthropic.ContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stopReason: string | null;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<LLMProviderConfig> = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,
  timeout: 60000,
  region: 'us-central1',
};

/**
 * LLM Provider class
 *
 * Provides a unified interface for making LLM requests, abstracting away
 * the differences between Anthropic direct API and Vertex AI.
 */
export class LLMProvider {
  private config: Required<LLMProviderConfig>;
  private anthropicClient: Anthropic | null = null;
  private vertexClient: AnthropicVertex | null = null;
  private googleAuth: GoogleAuthService | null = null;
  private initialized: boolean = false;

  constructor(config: LLMProviderConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      provider: config.provider,
      apiKey: config.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '',
      projectId: config.projectId ?? process.env['GOOGLE_CLOUD_PROJECT'] ?? '',
      region: config.region ?? process.env['GOOGLE_CLOUD_REGION'] ?? 'us-central1',
    } as Required<LLMProviderConfig>;
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.provider === 'anthropic') {
      this.initializeAnthropic();
    } else if (this.config.provider === 'vertex-ai') {
      await this.initializeVertexAI();
    } else {
      throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }

    this.initialized = true;
  }

  /**
   * Initialize Anthropic direct API client
   */
  private initializeAnthropic(): void {
    if (!this.config.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    this.anthropicClient = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
    });

    console.log('[LLMProvider] Initialized Anthropic direct API client');
  }

  /**
   * Initialize Vertex AI client using Application Default Credentials
   */
  private async initializeVertexAI(): Promise<void> {
    // Initialize Google Auth for ADC
    this.googleAuth = getGoogleAuthService({
      projectId: this.config.projectId,
      region: this.config.region,
    });

    await this.googleAuth.initialize();

    const projectId = this.googleAuth.getProjectId();
    const region = this.googleAuth.getRegion();

    // Create Vertex AI client
    this.vertexClient = new AnthropicVertex({
      projectId,
      region,
    });

    console.log(`[LLMProvider] Initialized Vertex AI client for project: ${projectId}, region: ${region}`);
  }


  /**
   * Create a message using the configured LLM provider
   */
  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      messages: request.messages as Anthropic.MessageParam[],
    };

    if (request.system !== undefined) {
      params.system = request.system;
    }

    if (request.tools !== undefined && request.tools.length > 0) {
      params.tools = request.tools as Anthropic.Tool[];
    }

    // Call the appropriate client based on provider type
    if (this.config.provider === 'anthropic' && this.anthropicClient) {
      const response = await this.anthropicClient.messages.create(params);
      return {
        content: response.content as Anthropic.ContentBlock[],
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason,
      };
    } else if (this.config.provider === 'vertex-ai' && this.vertexClient) {
      const response = await this.vertexClient.messages.create(params);
      return {
        content: response.content as unknown as Anthropic.ContentBlock[],
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason,
      };
    } else {
      throw new Error('No LLM client available');
    }
  }

  /**
   * Get the provider type
   */
  getProviderType(): LLMProviderType {
    return this.config.provider;
  }

  /**
   * Get the configured model
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Get the Google Auth service (for Vertex AI provider)
   */
  getGoogleAuth(): GoogleAuthService | null {
    return this.googleAuth;
  }

  /**
   * Check if the provider is ready
   */
  isReady(): boolean {
    return this.initialized;
  }
}

/**
 * Singleton instance for shared LLM provider
 */
let sharedProvider: LLMProvider | null = null;

/**
 * Get the LLM provider configuration from environment
 */
export function getLLMProviderConfig(): LLMProviderConfig {
  const providerEnv = process.env['LLM_PROVIDER'] ?? 'anthropic';
  const provider: LLMProviderType = providerEnv === 'vertex-ai' ? 'vertex-ai' : 'anthropic';

  const config: LLMProviderConfig = {
    provider,
    model: process.env['ANTHROPIC_MODEL'] ?? process.env['VERTEX_AI_MODEL'] ?? 'claude-sonnet-4-20250514',
    maxTokens: parseInt(process.env['ANTHROPIC_MAX_TOKENS'] ?? '4096', 10),
    temperature: parseFloat(process.env['LLM_TEMPERATURE'] ?? '0.7'),
    timeout: parseInt(process.env['LLM_TIMEOUT'] ?? '60000', 10),
  };

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey !== undefined) {
    config.apiKey = apiKey;
  }

  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  if (projectId !== undefined) {
    config.projectId = projectId;
  }

  const region = process.env['GOOGLE_CLOUD_REGION'];
  if (region !== undefined) {
    config.region = region;
  }

  return config;
}

/**
 * Get shared LLM provider instance
 */
export async function getLLMProvider(config?: LLMProviderConfig): Promise<LLMProvider> {
  if (!sharedProvider) {
    const providerConfig = config ?? getLLMProviderConfig();
    sharedProvider = new LLMProvider(providerConfig);
    await sharedProvider.initialize();
  }
  return sharedProvider;
}

/**
 * Reset the shared provider (useful for testing)
 */
export function resetLLMProvider(): void {
  sharedProvider = null;
}

/**
 * Create a new LLM provider instance (for non-singleton use cases)
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  return new LLMProvider(config);
}
