/**
 * Model Tests
 *
 * Unit tests for data models and schemas
 */

import { randomUUID } from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  HypothesisNodeSchema,
  createHypothesisNode,
  EvidenceNodeSchema,
  createEvidenceNode,
  EngagementSchema,
  createEngagement,
  SkillDefinitionSchema,
  createSkillDefinition,
  createEvent,
} from '../src/models/index.js';

describe('Hypothesis Models', () => {
  it('should create a valid hypothesis node', () => {
    const request = {
      content: 'Revenue will grow 20% annually',
      type: 'thesis' as const,
      created_by: 'test-user',
    };

    const node = createHypothesisNode(request);

    expect(node.id).toBeDefined();
    expect(node.content).toBe(request.content);
    expect(node.type).toBe(request.type);
    expect(node.status).toBe('untested');
    expect(node.confidence).toBe(0.5);
    expect(node.metadata.created_by).toBe('test-user');
    expect(node.metadata.created_at).toBeDefined();
  });

  it('should validate hypothesis node schema', () => {
    const validNode = {
      id: randomUUID(),
      content: 'Test hypothesis',
      type: 'thesis',
      status: 'untested',
      confidence: 0.7,
      metadata: {
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by: 'test-user',
        source_refs: [],
      },
    };

    const result = HypothesisNodeSchema.safeParse(validNode);
    expect(result.success).toBe(true);
  });

  it('should reject invalid hypothesis node', () => {
    const invalidNode = {
      id: 'not-a-uuid',
      content: '',
      type: 'invalid_type',
    };

    const result = HypothesisNodeSchema.safeParse(invalidNode);
    expect(result.success).toBe(false);
  });
});

describe('Evidence Models', () => {
  it('should create a valid evidence node', () => {
    const request = {
      content: 'According to the annual report, revenue increased by 25%',
      source: {
        type: 'document' as const,
        url: 'https://example.com/annual-report.pdf',
        title: 'Annual Report 2024',
        credibility_score: 0.9,
        retrieved_at: Date.now(),
      },
      hypothesis_ids: [randomUUID()],
    };

    const node = createEvidenceNode(request);

    expect(node.id).toBeDefined();
    expect(node.content).toBe(request.content);
    expect(node.source.type).toBe('document');
    expect(node.sentiment).toBe('neutral');
    expect(node.created_at).toBeDefined();
  });

  it('should validate evidence node schema', () => {
    const validEvidence = {
      id: randomUUID(),
      content: 'Test evidence content',
      source: {
        type: 'web',
        url: 'https://example.com',
        title: 'Example',
        credibility_score: 0.8,
        retrieved_at: Date.now(),
      },
      sentiment: 'supporting',
      relevance: {
        hypothesis_ids: [],
        relevance_scores: [],
      },
      confidence: 0.8,
      tags: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const result = EvidenceNodeSchema.safeParse(validEvidence);
    expect(result.success).toBe(true);
  });
});

describe('Engagement Models', () => {
  it('should create a valid engagement', () => {
    const request = {
      name: 'Project Alpha',
      client_name: 'Client Corp',
      deal_type: 'buyout' as const,
      sector: 'technology' as const,
      target_company: {
        name: 'TechCorp Inc',
        description: 'Enterprise software company',
        sector: 'technology',
        geography: 'North America',
      },
      investment_thesis: 'Strong market position with growth potential',
    };

    const engagement = createEngagement(request, 'creator-id');

    expect(engagement.id).toBeDefined();
    expect(engagement.name).toBe(request.name);
    expect(engagement.deal_type).toBe(request.deal_type);
    expect(engagement.target_company.name).toBe(request.target_company.name);
    expect(engagement.status).toBe('draft');
    expect(engagement.created_by).toBe('creator-id');
  });
});

describe('Skill Models', () => {
  it('should create a valid skill definition', () => {
    const request = {
      name: 'market_sizing',
      description: 'Calculate total addressable market',
      category: 'market_sizing' as const,
      parameters: [
        {
          name: 'segments',
          type: 'array' as const,
          description: 'Market segments',
          required: true,
        },
      ],
      implementation: 'Analyze market segments...',
      tags: ['market', 'sizing'],
    };

    const skill = createSkillDefinition(request, 'system');

    expect(skill.id).toBeDefined();
    expect(skill.name).toBe(request.name);
    expect(skill.category).toBe(request.category);
    expect(skill.version).toBe('1.0.0');
    expect(skill.success_rate).toBe(0);
    expect(skill.usage_count).toBe(0);
    expect(skill.created_by).toBe('system');
  });
});

describe('Event Models', () => {
  it('should create a valid event', () => {
    const event = createEvent(
      'hypothesis_updated',
      randomUUID(),
      { hypothesis_id: randomUUID(), change: 'confidence_updated' }
    );

    expect(event.id).toBeDefined();
    expect(event.type).toBe('hypothesis_updated');
    expect(event.timestamp).toBeDefined();
    expect(event.data).toBeDefined();
  });
});
