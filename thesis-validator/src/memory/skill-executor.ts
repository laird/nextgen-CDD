/**
 * Skill Executor - LLM-based skill execution
 *
 * Executes skill prompts with parameters via the LLM provider.
 */

import type { SkillExecutor, SkillExecutionContext } from './skill-library.js';
import type { SkillExecutionResult } from '../models/index.js';
import { LLMProvider, getLLMProviderConfig } from '../services/llm-provider.js';

/**
 * Build a prompt from skill implementation and parameters
 */
function buildSkillPrompt(
  implementation: string,
  parameters: Record<string, unknown>,
  context: SkillExecutionContext
): string {
  const parameterSection = Object.entries(parameters)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');

  let prompt = `Execute the following analytical skill with the provided parameters.

## Skill Instructions
${implementation}

## Parameters
${parameterSection || 'No parameters provided'}
`;

  if (context.additional_context) {
    prompt += `\n## Additional Context\n${context.additional_context}\n`;
  }

  prompt += `
## Output Requirements
Provide your analysis as structured JSON with the following format:
{
  "analysis": "Your detailed analysis",
  "findings": ["Key finding 1", "Key finding 2", ...],
  "confidence": 0.0-1.0,
  "data_sources": ["Source 1", "Source 2", ...],
  "recommendations": ["Recommendation 1", ...]
}`;

  return prompt;
}

/**
 * Parse skill execution output from LLM response
 */
function parseSkillOutput(content: string): unknown {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1]?.trim() : content;

  try {
    return JSON.parse(jsonStr ?? '');
  } catch {
    // Try to find JSON object in content
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // Return as plain text if JSON parsing fails
        return { analysis: content, findings: [], confidence: 0.5 };
      }
    }
    return { analysis: content, findings: [], confidence: 0.5 };
  }
}

/**
 * Create an LLM-based skill executor
 */
export function createLLMSkillExecutor(): SkillExecutor {
  let llmProvider: LLMProvider | null = null;
  let initialized = false;

  return async (
    implementation: string,
    parameters: Record<string, unknown>,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult> => {
    const startTime = Date.now();

    // Lazy initialize LLM provider
    if (!initialized) {
      const config = getLLMProviderConfig();
      llmProvider = new LLMProvider(config);
      await llmProvider.initialize();
      initialized = true;
    }

    if (!llmProvider) {
      return {
        skill_id: '',
        success: false,
        output: null,
        execution_time_ms: Date.now() - startTime,
        error: 'LLM provider not initialized',
      };
    }

    try {
      const prompt = buildSkillPrompt(implementation, parameters, context);

      const model = context.model ?? process.env['VERTEX_AI_MODEL'] ?? 'claude-sonnet-4-20250514';
      const response = await llmProvider.createMessage({
        model,
        maxTokens: 4096,
        temperature: 0.3,
        system: 'You are an expert analyst executing structured analytical frameworks. Provide thorough, evidence-based analysis.',
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      const output = parseSkillOutput(content);

      return {
        skill_id: '',
        success: true,
        output,
        execution_time_ms: Date.now() - startTime,
        metadata: {
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          model_used: model,
        },
      };
    } catch (error) {
      return {
        skill_id: '',
        success: false,
        output: null,
        execution_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };
}
