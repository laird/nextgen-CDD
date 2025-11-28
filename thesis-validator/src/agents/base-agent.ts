/**
 * Base Agent - Shared interface and utilities for all agents
 *
 * Provides common functionality for:
 * - LLM interaction
 * - Memory access
 * - Event emission
 * - Tool execution
 * - State management
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DealMemory } from '../memory/deal-memory.js';
import type { InstitutionalMemory } from '../memory/institutional-memory.js';
import type { MarketIntelligence } from '../memory/market-intelligence.js';
import type { AgentStatus, EngagementEvent } from '../models/events.js';
import { createAgentStatusEvent } from '../models/events.js';
import { embed } from '../tools/embedding.js';

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
  model: process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514',
  maxTokens: parseInt(process.env['ANTHROPIC_MAX_TOKENS'] ?? '8192', 10),
  temperature: 0.7,
};

/**
 * Base Agent class
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected client: Anthropic;
  protected context: AgentContext | null = null;
  protected status: AgentStatus = 'idle';
  protected conversationHistory: AgentMessage[] = [];

  constructor(config: Partial<AgentConfig> & { id: string; name: string; systemPrompt: string }) {
    this.config = {
      ...defaultConfig,
      ...config,
    } as AgentConfig;

    this.client = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
    });
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

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Include conversation history if requested
    if (options?.includeHistory) {
      messages.push(...this.conversationHistory);
    }

    messages.push({ role: 'user', content: prompt });

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
        system: this.config.systemPrompt,
        messages,
      });

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

    const messages: Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlock[] }> = [];
    const toolCalls: Array<{ tool: string; input: Record<string, unknown>; output: unknown }> = [];
    let totalTokens = { input: 0, output: 0 };
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
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: this.config.systemPrompt,
          messages: messages as Anthropic.MessageParam[],
          tools: anthropicTools,
        });

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
        messages.push({ role: 'user', content: toolResults });
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
   * Create a standard result
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

    return {
      success,
      data,
      error: options?.error,
      reasoning: options?.reasoning,
      toolCalls: options?.toolCalls,
      tokensUsed: options?.tokensUsed,
      executionTimeMs: options?.startTime ? Date.now() - options.startTime : 0,
    };
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
