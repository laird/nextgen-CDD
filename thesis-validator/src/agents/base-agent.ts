/**
 * Base Agent - Shared interface and utilities for all agents
 *
 * Provides common functionality for:
 * - LLM interaction (via Anthropic direct API or Vertex AI)
 * - Memory access
 * - Event emission
 * - Tool execution
 * - State management
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DealMemory } from '../memory/deal-memory.js';
import type { InstitutionalMemory } from '../memory/institutional-memory.js';
import type { MarketIntelligence } from '../memory/market-intelligence.js';
import type { SkillLibrary } from '../memory/skill-library.js';
import type { AgentStatus, EngagementEvent } from '../models/events.js';
import { createAgentStatusEvent } from '../models/events.js';
import type { SkillDefinition, SkillExecutionResult } from '../models/index.js';
import { embed } from '../tools/embedding.js';
import {
  LLMProvider,
  getLLMProviderConfig,
  type LLMProviderConfig,
  type LLMProviderType,
} from '../services/llm-provider.js';

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
  // LLM Provider configuration
  llmProvider?: LLMProviderType;
  llmProviderConfig?: Partial<LLMProviderConfig>;
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
 * Default agent configuration
 */
const defaultConfig: Partial<AgentConfig> = {
  model: process.env['ANTHROPIC_MODEL'] ?? process.env['VERTEX_AI_MODEL'] ?? 'claude-opus-4-5@20251101',
  maxTokens: parseInt(process.env['ANTHROPIC_MAX_TOKENS'] ?? '8192', 10),
  temperature: 0.7,
  llmProvider: (process.env['LLM_PROVIDER'] as LLMProviderType) ?? 'anthropic',
};

/**
 * Base Agent class
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected client: Anthropic | null = null;
  protected llmProvider: LLMProvider | null = null;
  protected context: AgentContext | null = null;
  protected status: AgentStatus = 'idle';
  protected conversationHistory: AgentMessage[] = [];
  protected providerInitialized: boolean = false;

  constructor(config: Partial<AgentConfig> & { id: string; name: string; systemPrompt: string }) {
    this.config = {
      ...defaultConfig,
      ...config,
    } as AgentConfig;

    // Initialize based on provider type
    this.initializeProvider();
  }

  /**
   * Initialize the LLM provider based on configuration
   */
  private initializeProvider(): void {
    const providerType = this.config.llmProvider ?? 'anthropic';

    if (providerType === 'anthropic' && process.env['ANTHROPIC_API_KEY']) {
      // Use direct Anthropic client for backwards compatibility
      this.client = new Anthropic({
        apiKey: process.env['ANTHROPIC_API_KEY'],
      });
      this.providerInitialized = true;
    } else if (providerType === 'vertex-ai') {
      // LLM Provider will be initialized lazily
      const providerConfig = getLLMProviderConfig();
      this.llmProvider = new LLMProvider({
        ...providerConfig,
        ...this.config.llmProviderConfig,
        provider: 'vertex-ai',
      });
    } else {
      // Default to LLM Provider abstraction
      const providerConfig = getLLMProviderConfig();
      this.llmProvider = new LLMProvider({
        ...providerConfig,
        ...this.config.llmProviderConfig,
      });
    }
  }

  /**
   * Ensure the LLM provider is initialized (async initialization for Vertex AI)
   */
  protected async ensureProviderInitialized(): Promise<void> {
    if (this.providerInitialized) {
      return;
    }

    if (this.llmProvider) {
      await this.llmProvider.initialize();
      this.providerInitialized = true;
    }
  }

  /**
   * Get the LLM provider type being used
   */
  getProviderType(): LLMProviderType {
    if (this.client) {
      return 'anthropic';
    }
    return this.llmProvider?.getProviderType() ?? 'anthropic';
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
   * Call the LLM
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

    // Ensure provider is initialized (for Vertex AI async initialization)
    await this.ensureProviderInitialized();

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Include conversation history if requested
    if (options?.includeHistory) {
      messages.push(...this.conversationHistory);
    }

    messages.push({ role: 'user', content: prompt });

    try {
      let response: { content: Anthropic.ContentBlock[]; usage: { input_tokens: number; output_tokens: number } };

      if (this.client) {
        // Use direct Anthropic client
        response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: options?.maxTokens ?? this.config.maxTokens,
          temperature: options?.temperature ?? this.config.temperature,
          system: this.config.systemPrompt,
          messages,
        });
      } else if (this.llmProvider) {
        // Use LLM Provider abstraction (supports Anthropic and Vertex AI)
        const llmResponse = await this.llmProvider.createMessage({
          model: this.config.model,
          maxTokens: options?.maxTokens ?? this.config.maxTokens,
          temperature: options?.temperature ?? this.config.temperature,
          system: this.config.systemPrompt,
          messages,
        });
        response = {
          content: llmResponse.content,
          usage: {
            input_tokens: llmResponse.usage.input_tokens,
            output_tokens: llmResponse.usage.output_tokens,
          },
        };
      } else {
        throw new Error('No LLM provider available');
      }

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      // Update conversation history
      this.conversationHistory.push({ role: 'user', content: prompt });
      this.conversationHistory.push({ role: 'assistant', content });

      return {
        content,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
      };
    } catch (error) {
      this.updateStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Call LLM with tools
   */
  protected async callLLMWithTools(
    prompt: string,
    tools: AgentTool[],
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

    // Ensure provider is initialized (for Vertex AI async initialization)
    await this.ensureProviderInitialized();

    const messages: Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlock[] }> = [];
    const toolCalls: Array<{ tool: string; input: Record<string, unknown>; output: unknown }> = [];
    const totalTokens = { input: 0, output: 0 };
    const maxIterations = options?.maxIterations ?? 10;

    // Include conversation history if requested
    if (options?.includeHistory) {
      for (const msg of this.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: prompt });

    // Convert tools to Anthropic format
    const anthropicTools: Anthropic.Tool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));

    let iteration = 0;
    let finalContent = '';

    while (iteration < maxIterations) {
      iteration++;

      try {
        let response: { content: Anthropic.ContentBlock[]; usage: { input_tokens: number; output_tokens: number } };

        if (this.client) {
          // Use direct Anthropic client
          response = await this.client.messages.create({
            model: this.config.model,
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            system: this.config.systemPrompt,
            messages: messages as Anthropic.MessageParam[],
            tools: anthropicTools,
          });
        } else if (this.llmProvider) {
          // Use LLM Provider abstraction
          const llmResponse = await this.llmProvider.createMessage({
            model: this.config.model,
            maxTokens: this.config.maxTokens,
            temperature: this.config.temperature,
            system: this.config.systemPrompt,
            messages: messages as Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlock[] }>,
            tools: anthropicTools,
          });
          response = {
            content: llmResponse.content,
            usage: {
              input_tokens: llmResponse.usage.input_tokens,
              output_tokens: llmResponse.usage.output_tokens,
            },
          };
        } else {
          throw new Error('No LLM provider available');
        }

        totalTokens.input += response.usage.input_tokens;
        totalTokens.output += response.usage.output_tokens;

        // Check if we need to handle tool calls
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUseBlocks.length === 0) {
          // No tool calls, get final response
          finalContent = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('\n');
          break;
        }

        // Process tool calls
        this.updateStatus('searching');
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const tool = tools.find((t) => t.name === toolUse.name);
          if (!tool) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Tool not found: ${toolUse.name}`,
              is_error: true,
            });
            continue;
          }

          try {
            const output = await tool.handler(toolUse.input as Record<string, unknown>);
            toolCalls.push({
              tool: toolUse.name,
              input: toolUse.input as Record<string, unknown>,
              output,
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: typeof output === 'string' ? output : JSON.stringify(output),
            });
          } catch (error) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Tool error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              is_error: true,
            });
          }
        }

        // Add assistant response and tool results to messages
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults as unknown as Anthropic.ContentBlock[] });
      } catch (error) {
        this.updateStatus('error', error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    }

    // Update conversation history with final result
    this.conversationHistory.push({ role: 'user', content: prompt });
    this.conversationHistory.push({ role: 'assistant', content: finalContent });

    return {
      content: finalContent,
      toolCalls,
      tokensUsed: totalTokens,
    };
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
