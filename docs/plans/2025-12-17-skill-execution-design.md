# Agent-Triggered Skill Execution Design

**Date**: 2025-12-17
**Status**: Approved

## Overview

Enable agents to discover and execute analytical skills during their work. Skills are LLM-based analytical frameworks (TAM sizing, competitive analysis, etc.) that agents invoke when relevant to their current task.

## Design Decisions

| Decision | Choice |
|----------|--------|
| When to invoke | Agent-triggered (agents decide) |
| Which agents | All agents can execute skills |
| Execution mechanism | LLM-based (skill prompt + parameters → LLM → structured output) |
| Discovery method | Semantic search (embed task, search skill library) |
| Skills per task | Top 2 most relevant |
| Timing | During main work (interleaved as needed) |

## Architecture

### 1. Skill Executor

New LLM-based executor that SkillLibrary uses:

```typescript
// src/memory/skill-executor.ts
export function createLLMSkillExecutor(llmProvider: LLMProvider): SkillExecutor {
  return async (implementation, parameters, context) => {
    const prompt = buildSkillPrompt(implementation, parameters, context);
    const response = await llmProvider.generate(prompt);
    return parseSkillOutput(response);
  };
}
```

### 2. BaseAgent Enhancement

Add skill capabilities to BaseAgent so all agents inherit them:

```typescript
// In base-agent.ts

protected async findRelevantSkills(taskDescription: string, topK = 2): Promise<SkillDefinition[]> {
  const embedding = await this.embed(taskDescription);
  const results = await this.skillLibrary.search(embedding, { top_k: topK });
  return Promise.all(results.map(r => this.skillLibrary.get(r.id)));
}

protected async executeSkill(
  skillId: string,
  parameters: Record<string, unknown>
): Promise<SkillExecutionResult> {
  return this.skillLibrary.execute({
    skill_id: skillId,
    parameters,
    context: { engagement_id: this.context?.engagementId }
  });
}

protected async extractParametersForSkill(
  skill: SkillDefinition,
  agentInput: unknown
): Promise<Record<string, unknown>> {
  // LLM-assisted parameter extraction from agent context
}
```

### 3. Agent Integration Pattern

Each agent invokes skills mid-task:

```typescript
async execute(input: EvidenceGathererInput): Promise<AgentResult<...>> {
  // 1. Understand the task
  const taskDescription = `Gather evidence for: ${input.query}`;

  // 2. Find relevant skills
  const skills = await this.findRelevantSkills(taskDescription, 2);

  // 3. Execute skills and collect insights
  const skillInsights: SkillExecutionResult[] = [];
  for (const skill of skills) {
    const params = await this.extractParametersForSkill(skill, input);
    const result = await this.executeSkill(skill.id, params);
    if (result.success) skillInsights.push(result);
  }

  // 4. Incorporate skill outputs into main LLM prompt
  const prompt = this.buildPromptWithSkillContext(input, skillInsights);
  const response = await this.callLLM(prompt);

  // 5. Return combined result
  return this.createResult(true, { ...response, skillsUsed: skills.map(s => s.name) });
}
```

### 4. Initialization

Wire executor during app startup:

```typescript
// In src/index.ts after initializeMemorySystems()
const skillLibrary = getSkillLibrary();
const llmProvider = getLLMProvider();
skillLibrary.setExecutor(createLLMSkillExecutor(llmProvider));
```

## Files to Modify

| File | Change |
|------|--------|
| `src/memory/skill-executor.ts` | NEW - LLM-based executor |
| `src/memory/skill-library.ts` | Export for agent context |
| `src/agents/base-agent.ts` | Add skill methods, update AgentContext |
| `src/agents/evidence-gatherer.ts` | Integrate skill invocation |
| `src/agents/hypothesis-builder.ts` | Integrate skill invocation |
| `src/agents/contradiction-hunter.ts` | Integrate skill invocation |
| `src/agents/comparables-finder.ts` | Add execution (already searches) |
| `src/agents/expert-synthesizer.ts` | Integrate skill invocation |
| `src/index.ts` | Wire executor at startup |

## Implementation Approach

Start with EvidenceGatherer only, validate it works, then extend to other agents.

## Available Skills

1. `tam_bottom_up` - Bottom-up TAM sizing
2. `competitive_landscape` - Competitive analysis
3. `supplier_concentration` - Supplier risk analysis
4. `management_assessment` - Management team evaluation
5. `customer_concentration_risk` - Customer dependency analysis
6. `regulatory_risk_assessment` - Regulatory environment evaluation
7. `technology_stack_assessment` - Tech infrastructure evaluation
8. `unit_economics_analysis` - Unit economics deep dive
9. `market_timing_assessment` - Market cycle position evaluation
