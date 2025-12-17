/**
 * Base Agent - Shared interface and utilities for all agents
 *
 * Provides common functionality for:
 * - LLM interaction (via Vercel AI SDK - supports Anthropic, Vertex AI, Ollama)
 * - Memory access
 * - Event emission
 * - Tool execution
 * - State management
 */

import { generateText, stepCountIs, type CoreMessage, type LanguageModel, type ToolSet } from 'ai';
import { z } from 'zod';
import type { DealMemory } from '../memory/deal-memory.js';
import type { InstitutionalMemory } from '../memory/institutional-memory.js';
import type { MarketIntelligence } from '../memory/market-intelligence.js';
import type { SkillLibrary } from '../memory/skill-library.js';
import type { AgentStatus, EngagementEvent } from '../models/events.js';
import type { SkillDefinition, SkillExecutionResult } from '../models/index.js';
import { createAgentStatusEvent, createEvent } from '../models/events.js';
import { embed } from '../tools/embedding.js';
import {
  createModel,
  type ModelProviderType,
  type ModelProviderConfig,
} from '../services/model-provider.js';

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  tools?: AgentTool[];
  // Model Provider configuration
  modelProvider?: ModelProviderType;
  modelProviderConfig?: Partial<ModelProviderConfig>;
}

/**
 * Agent tool definition
 */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Agent context for execution
 */
export interface AgentContext {
  engagementId: string;
  dealMemory: DealMemory;
  institutionalMemory?: InstitutionalMemory;
  marketIntelligence?: MarketIntelligence;
  skillLibrary?: SkillLibrary;
  onEvent?: (event: EngagementEvent) => void;
  abortSignal?: AbortSignal;
}

/**
 * Agent execution result
 */
export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  reasoning?: string;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: unknown;
  }>;
  tokensUsed?: {
    input: number;
    output: number;
  };
  executionTimeMs: number;
}

/**
 * Message format for agent conversation
 */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Parsed LLM error with user-friendly message
 */
export interface LLMError {
  code: 'MODEL_NOT_FOUND' | 'CONNECTION_ERROR' | 'AUTH_ERROR' | 'RATE_LIMIT' | 'CONTEXT_LENGTH' | 'UNKNOWN';
  userMessage: string;
  technicalMessage: string;
  provider: string;
  model?: string;
  retryable: boolean;
}

/**
 * Default agent configuration
 */
const defaultConfig: Partial<AgentConfig> = {
  model:
    process.env['LLM_MODEL'] ??
    process.env['ANTHROPIC_MODEL'] ??
    process.env['VERTEX_AI_MODEL'] ??
    process.env['OLLAMA_MODEL'] ??
    'claude-opus-4-5@20251101',
  maxTokens: parseInt(process.env['ANTHROPIC_MAX_TOKENS'] ?? process.env['LLM_MAX_TOKENS'] ?? '8192', 10),
  temperature: 0.7,
  modelProvider: (process.env['LLM_PROVIDER'] as ModelProviderType) ?? 'anthropic',
};

// Re-export for backwards compatibility
export type LLMProviderType = ModelProviderType;

/**
 * Base Agent class
 *
 * Uses Vercel AI SDK for unified LLM access across providers:
 * - Anthropic (direct API)
 * - Google Vertex AI
 * - Ollama (local)
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected model: LanguageModel;
  protected context: AgentContext | null = null;
  protected status: AgentStatus = 'idle';
  protected conversationHistory: AgentMessage[] = [];

  constructor(config: Partial<AgentConfig> & { id: string; name: string; systemPrompt: string }) {
    this.config = {
      ...defaultConfig,
      ...config,
    } as AgentConfig;

    // Initialize model using AI SDK
    const provider = this.config.modelProvider ?? 'anthropic';
    this.model = createModel({
      provider,
      model: this.config.model,
      ...this.config.modelProviderConfig,
    });
  }

  /**
   * Get the model provider type being used
   */
  getProviderType(): ModelProviderType {
    return this.config.modelProvider ?? 'anthropic';
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Set agent context
   */
  setContext(context: AgentContext): void {
    this.context = context;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Update and emit status
   */
  protected updateStatus(status: AgentStatus, message?: string, currentTask?: string): void {
    this.status = status;

    if (this.context?.onEvent) {
      const event = createAgentStatusEvent(
        this.context.engagementId,
        this.config.id,
        this.config.name,
        status,
        message,
        currentTask
      );
      this.context.onEvent(event);
    }
  }

  /**
   * Emit an event
   */
  protected emitEvent(event: EngagementEvent): void {
    if (this.context?.onEvent) {
      this.context.onEvent(event);
    }
  }

  /**
   * Parse LLM error into user-friendly format
   */
  protected parseLLMError(error: unknown): LLMError {
    const provider = this.getProviderType();
    const model = this.config.model;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Model not found errors
    if (
      errorMessage.includes('model') &&
      (errorMessage.includes('not found') || errorMessage.includes('does not exist') || errorMessage.includes('unknown'))
    ) {
      return {
        code: 'MODEL_NOT_FOUND',
        userMessage: `Model "${model}" is not available on ${provider}. Please check your LLM_MODEL configuration.`,
        technicalMessage: errorMessage,
        provider,
        model,
        retryable: false,
      };
    }

    // Connection errors (Ollama not running, network issues)
    if (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('fetch failed') ||
      errorMessage.includes('network')
    ) {
      return {
        code: 'CONNECTION_ERROR',
        userMessage: `Cannot connect to ${provider}. ${provider === 'ollama' ? 'Is Ollama running?' : 'Please check your network connection.'}`,
        technicalMessage: errorMessage,
        provider,
        model,
        retryable: true,
      };
    }

    // Authentication errors
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid api key') ||
      errorMessage.includes('authentication')
    ) {
      return {
        code: 'AUTH_ERROR',
        userMessage: `Authentication failed for ${provider}. Please check your API key or credentials.`,
        technicalMessage: errorMessage,
        provider,
        model,
        retryable: false,
      };
    }

    // Rate limit errors
    if (
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('too many requests')
    ) {
      return {
        code: 'RATE_LIMIT',
        userMessage: `Rate limit exceeded for ${provider}. Please wait a moment and try again.`,
        technicalMessage: errorMessage,
        provider,
        model,
        retryable: true,
      };
    }

    // Context length errors
    if (
      errorMessage.includes('context length') ||
      errorMessage.includes('token limit') ||
      errorMessage.includes('maximum context') ||
      errorMessage.includes('too long')
    ) {
      return {
        code: 'CONTEXT_LENGTH',
        userMessage: 'The input is too long for the model. Please reduce the amount of text.',
        technicalMessage: errorMessage,
        provider,
        model,
        retryable: false,
      };
    }

    // Unknown errors
    return {
      code: 'UNKNOWN',
      userMessage: `LLM error (${provider}): ${errorMessage.slice(0, 100)}${errorMessage.length > 100 ? '...' : ''}`,
      technicalMessage: errorMessage,
      provider,
      model,
      retryable: false,
    };
  }

  /**
   * Emit an LLM error event for UI notification
   */
  protected emitLLMError(llmError: LLMError): void {
    if (this.context?.onEvent) {
      const event = createEvent(
        'agent.error',
        this.context.engagementId,
        {
          agent_id: this.config.id,
          agent_name: this.config.name,
          error_code: llmError.code,
          message: llmError.userMessage,
          provider: llmError.provider,
          model: llmError.model,
          retryable: llmError.retryable,
          technical_message: llmError.technicalMessage,
        },
        this.config.id
      );
      this.context.onEvent(event);
    }
  }

  /**
   * Generate embedding for text
   */
  protected async embed(text: string): Promise<Float32Array> {
    return embed(text);
  }

  /**
   * Find relevant skills for a task description
   */
  protected async findRelevantSkills(
    taskDescription: string,
    topK = 2
  ): Promise<SkillDefinition[]> {
    if (!this.context?.skillLibrary) {
      return [];
    }

    try {
      const embedding = await this.embed(taskDescription);
      const results = await this.context.skillLibrary.search(embedding, { top_k: topK });

      const skills: SkillDefinition[] = [];
      for (const result of results) {
        if (!result?.id) continue;
        const skill = await this.context.skillLibrary.get(result.id);
        if (skill) {
          skills.push(skill);
        }
      }

      return skills;
    } catch (error) {
      console.error(
        `[${this.config.name}] Error finding relevant skills:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return [];
    }
  }

  /**
   * Execute a skill with parameters
   */
  protected async executeSkill(
    skillId: string,
    parameters: Record<string, unknown>
  ): Promise<SkillExecutionResult> {
    if (!this.context?.skillLibrary) {
      return {
        skill_id: skillId,
        success: false,
        output: null,
        execution_time_ms: 0,
        error: 'Skill library not available',
      };
    }

    console.log(`[${this.config.name}] Executing skill: ${skillId}`);
    const result = await this.context.skillLibrary.execute({
      skill_id: skillId,
      parameters,
      context: {
        engagement_id: this.context.engagementId,
      },
    });

    if (result.success) {
      console.log(`[${this.config.name}] Skill ${skillId} succeeded in ${result.execution_time_ms}ms`);
    } else {
      console.warn(`[${this.config.name}] Skill ${skillId} failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Extract parameters for a skill from agent input using LLM
   */
  protected async extractParametersForSkill(
    skill: SkillDefinition,
    agentInput: unknown
  ): Promise<Record<string, unknown>> {
    const parameterDescriptions = skill.parameters
      .map((p) => `- ${p.name} (${p.type}): ${p.description}${p.required ? ' [REQUIRED]' : ' [OPTIONAL]'}`)
      .join('\n');

    const prompt = `Extract parameter values for this skill from the given context.

SKILL: ${skill.name}
DESCRIPTION: ${skill.description}

PARAMETERS NEEDED:
${parameterDescriptions}

CONTEXT:
${JSON.stringify(agentInput, null, 2)}

Extract values for each parameter as JSON. Use null for missing optional parameters.
Only include parameters that can be reasonably inferred from the context.

Output as JSON object with parameter names as keys:`;

    try {
      const response = await this.callLLM(prompt, { temperature: 0, maxTokens: 1024 });
      const params = this.parseJSON<Record<string, unknown>>(response.content);
      if (!params) {
        console.warn(`[${this.config.name}] Failed to parse parameters for skill: ${skill.name}`);
        return {};
      }
      return params;
    } catch (error) {
      console.error(
        `[${this.config.name}] Error extracting parameters for skill ${skill.name}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return {};
    }
  }

  /**
   * Build prompt context from skill execution results
   */
  protected buildSkillContextPrompt(skillResults: Array<{ skill: SkillDefinition; result: SkillExecutionResult }>): string {
    const successfulResults = skillResults.filter((r) => r.result.success);

    if (successfulResults.length === 0) {
      return '';
    }

    const sections = successfulResults.map((r) => {
      const output = typeof r.result.output === 'string'
        ? r.result.output
        : JSON.stringify(r.result.output, null, 2);
      return `### ${r.skill.name}\n${r.skill.description}\n\nAnalysis:\n${output}`;
    });

    return `## Analytical Framework Results\n\nThe following analytical frameworks were applied:\n\n${sections.join('\n\n')}`;
  }

  /**
   * Call the LLM using Vercel AI SDK
   */
  protected async callLLM(
    prompt: string,
    options?: {
      includeHistory?: boolean;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<{ content: string; tokensUsed: { input: number; output: number } }> {
    this.updateStatus('thinking');

    // Build messages array
    const messages: CoreMessage[] = [];

    // Include conversation history if requested
    if (options?.includeHistory) {
      for (const msg of this.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: prompt });

    try {
      const result = await generateText({
        model: this.model,
        system: this.config.systemPrompt,
        messages,
        maxOutputTokens: options?.maxTokens ?? this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
      });

      const content = result.text;

      // Update conversation history
      this.conversationHistory.push({ role: 'user', content: prompt });
      this.conversationHistory.push({ role: 'assistant', content });

      return {
        content,
        tokensUsed: {
          input: result.usage?.inputTokens ?? 0,
          output: result.usage?.outputTokens ?? 0,
        },
      };
    } catch (error) {
      const llmError = this.parseLLMError(error);
      this.updateStatus('error', llmError.userMessage);
      this.emitLLMError(llmError);
      throw new Error(llmError.userMessage);
    }
  }

  /**
   * Call LLM with tools using Vercel AI SDK
   */
  protected async callLLMWithTools(
    prompt: string,
    agentTools: AgentTool[],
    options?: {
      includeHistory?: boolean;
      maxIterations?: number;
    }
  ): Promise<{
    content: string;
    toolCalls: Array<{ tool: string; input: Record<string, unknown>; output: unknown }>;
    tokensUsed: { input: number; output: number };
  }> {
    this.updateStatus('thinking');

    // Build messages array
    const messages: CoreMessage[] = [];

    // Include conversation history if requested
    if (options?.includeHistory) {
      for (const msg of this.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: prompt });

    // Convert agent tools to AI SDK format
    const toolResults: Array<{ tool: string; input: Record<string, unknown>; output: unknown }> = [];

    // Build tools object directly without the tool() helper
    // The tool() helper has typing issues with exactOptionalPropertyTypes
    const toolsConfig = {} as ToolSet;
    for (const agentTool of agentTools) {
      const schema = this.convertToZodSchema(agentTool.inputSchema);
      const handler = agentTool.handler;
      const toolName = agentTool.name;
      const updateStatus = this.updateStatus.bind(this);

      // Define tool directly with the structure generateText expects
      (toolsConfig as Record<string, unknown>)[agentTool.name] = {
        description: agentTool.description,
        parameters: schema,
        execute: async (input: Record<string, unknown>) => {
          updateStatus('searching');
          const output = await handler(input);
          toolResults.push({
            tool: toolName,
            input,
            output,
          });
          return output;
        },
      };
    }

    try {
      const result = await generateText({
        model: this.model,
        system: this.config.systemPrompt,
        messages,
        tools: toolsConfig,
        stopWhen: stepCountIs(options?.maxIterations ?? 10),
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const content = result.text;

      // Update conversation history
      this.conversationHistory.push({ role: 'user', content: prompt });
      this.conversationHistory.push({ role: 'assistant', content });

      return {
        content,
        toolCalls: toolResults,
        tokensUsed: {
          input: result.usage?.inputTokens ?? 0,
          output: result.usage?.outputTokens ?? 0,
        },
      };
    } catch (error) {
      const llmError = this.parseLLMError(error);
      this.updateStatus('error', llmError.userMessage);
      this.emitLLMError(llmError);
      throw new Error(llmError.userMessage);
    }
  }

  /**
   * Convert JSON Schema to Zod schema
   * This is a simplified converter - handles common cases
   */
  private convertToZodSchema(jsonSchema: Record<string, unknown>): z.ZodType {
    const properties = jsonSchema['properties'] as Record<string, unknown> | undefined;
    const required = (jsonSchema['required'] as string[]) ?? [];

    if (!properties) {
      return z.object({});
    }

    const shape: Record<string, z.ZodType> = {};

    for (const [key, propSchema] of Object.entries(properties)) {
      const prop = propSchema as Record<string, unknown>;
      const isRequired = required.includes(key);

      let zodType: z.ZodType;

      switch (prop['type']) {
        case 'string':
          zodType = z.string();
          if (prop['description']) {
            zodType = zodType.describe(prop['description'] as string);
          }
          break;
        case 'number':
        case 'integer':
          zodType = z.number();
          if (prop['description']) {
            zodType = zodType.describe(prop['description'] as string);
          }
          break;
        case 'boolean':
          zodType = z.boolean();
          if (prop['description']) {
            zodType = zodType.describe(prop['description'] as string);
          }
          break;
        case 'array':
          const items = prop['items'] as Record<string, unknown> | undefined;
          if (items?.['type'] === 'string') {
            zodType = z.array(z.string());
          } else if (items?.['type'] === 'number') {
            zodType = z.array(z.number());
          } else {
            zodType = z.array(z.unknown());
          }
          if (prop['description']) {
            zodType = zodType.describe(prop['description'] as string);
          }
          break;
        case 'object':
          zodType = z.record(z.unknown());
          if (prop['description']) {
            zodType = zodType.describe(prop['description'] as string);
          }
          break;
        default:
          zodType = z.unknown();
      }

      shape[key] = isRequired ? zodType : zodType.optional();
    }

    return z.object(shape);
  }

  /**
   * Parse JSON from LLM response
   */
  protected parseJSON<T>(content: string): T | null {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1]?.trim() : content;

    try {
      return JSON.parse(jsonStr ?? '') as T;
    } catch {
      // Try to find JSON object/array in the content
      const objectMatch = content.match(/\{[\s\S]*\}/);
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      const matched = objectMatch?.[0] ?? arrayMatch?.[0];

      if (matched) {
        try {
          return JSON.parse(matched) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Abstract method for agent execution
   */
  abstract execute(input: unknown): Promise<AgentResult>;

  /**
   * Create a standard result (with data)
   */
  protected createResult<T>(
    success: true,
    data: T,
    options?: {
      error?: string;
      reasoning?: string;
      toolCalls?: Array<{ tool: string; input: Record<string, unknown>; output: unknown }>;
      tokensUsed?: { input: number; output: number };
      startTime: number;
    }
  ): AgentResult<T>;

  /**
   * Create a standard result (without data, for errors)
   */
  protected createResult<T>(
    success: false,
    data: undefined,
    options?: {
      error?: string;
      reasoning?: string;
      toolCalls?: Array<{ tool: string; input: Record<string, unknown>; output: unknown }>;
      tokensUsed?: { input: number; output: number };
      startTime: number;
    }
  ): AgentResult<T>;

  /**
   * Create a standard result (implementation)
   */
  protected createResult<T>(
    success: boolean,
    data?: T,
    options?: {
      error?: string;
      reasoning?: string;
      toolCalls?: Array<{ tool: string; input: Record<string, unknown>; output: unknown }>;
      tokensUsed?: { input: number; output: number };
      startTime: number;
    }
  ): AgentResult<T> {
    this.updateStatus(success ? 'idle' : 'error');

    const result: AgentResult<T> = {
      success,
      executionTimeMs: options?.startTime ? Date.now() - options.startTime : 0,
    };

    // Only add optional properties if they have values (for exactOptionalPropertyTypes)
    if (data !== undefined) {
      result.data = data;
    }
    if (options?.error !== undefined) {
      result.error = options.error;
    }
    if (options?.reasoning !== undefined) {
      result.reasoning = options.reasoning;
    }
    if (options?.toolCalls !== undefined) {
      result.toolCalls = options.toolCalls;
    }
    if (options?.tokensUsed !== undefined) {
      result.tokensUsed = options.tokensUsed;
    }

    return result;
  }
}

/**
 * Helper to create tool definitions
 */
export function createTool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  handler: (input: Record<string, unknown>) => Promise<unknown>
): AgentTool {
  return { name, description, inputSchema, handler };
}

/**
 * Standard tool input schemas
 */
export const standardSchemas = {
  searchQuery: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      top_k: { type: 'number', description: 'Number of results' },
    },
    required: ['query'],
  },

  hypothesisId: {
    type: 'object',
    properties: {
      hypothesis_id: { type: 'string', description: 'Hypothesis ID' },
    },
    required: ['hypothesis_id'],
  },

  evidenceCreate: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Evidence content' },
      source_type: { type: 'string', description: 'Source type' },
      source_url: { type: 'string', description: 'Source URL' },
      hypothesis_ids: { type: 'array', items: { type: 'string' }, description: 'Related hypothesis IDs' },
    },
    required: ['content', 'source_type'],
  },
};
