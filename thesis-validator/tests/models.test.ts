/**
 * Model Tests
 *
 * Unit tests for data models and schemas
 */

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
      statement: 'Revenue will grow 20% annually',
      type: 'value_driver' as const,
      parent_id: undefined,
      metadata: {
        sector: 'technology',
        source: 'management',
      },
    };

    const node = createHypothesisNode(request);

    expect(node.id).toBeDefined();
    expect(node.statement).toBe(request.statement);
    expect(node.type).toBe(request.type);
    expect(node.status).toBe('untested');
    expect(node.confidence.current).toBe(0.5);
    expect(node.confidence.initial).toBe(0.5);
    expect(node.evidence_ids).toEqual([]);
    expect(node.created_at).toBeDefined();
  });

  it('should validate hypothesis node schema', () => {
    const validNode = {
      id: crypto.randomUUID(),
      statement: 'Test hypothesis',
      type: 'core_thesis',
      status: 'untested',
      confidence: {
        current: 0.7,
        initial: 0.5,
        history: [],
      },
      evidence_ids: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const result = HypothesisNodeSchema.safeParse(validNode);
    expect(result.success).toBe(true);
  });

  it('should reject invalid hypothesis node', () => {
    const invalidNode = {
      id: 'not-a-uuid',
      statement: '',
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
        author: 'Company XYZ',
        published_date: '2024-03-15',
      },
      hypothesis_ids: [crypto.randomUUID()],
      relevance: {
        score: 0.9,
        explanation: 'Directly supports revenue growth hypothesis',
      },
    };

    const node = createEvidenceNode(request, 'test-user');

    expect(node.id).toBeDefined();
    expect(node.content).toBe(request.content);
    expect(node.source.type).toBe('document');
    expect(node.hypothesis_ids).toHaveLength(1);
    expect(node.sentiment).toBeDefined();
    expect(node.provenance).toBeDefined();
    expect(node.provenance.collected_by).toBe('test-user');
  });

  it('should validate evidence node schema', () => {
    const validEvidence = {
      id: crypto.randomUUID(),
      content: 'Test evidence content',
      source: {
        type: 'web',
        url: 'https://example.com',
        title: 'Example',
      },
      hypothesis_ids: [],
      relevance: {
        score: 0.8,
        explanation: 'Relevant',
      },
      sentiment: 'supporting',
      credibility_score: 0.9,
      provenance: {
        collected_at: Date.now(),
        collected_by: 'system',
        method: 'web_search',
        raw_source: 'raw',
        transformations: [],
        verification_status: 'verified',
      },
      created_at: Date.now(),
    };

    const result = EvidenceNodeSchema.safeParse(validEvidence);
    expect(result.success).toBe(true);
  });
});

describe('Engagement Models', () => {
  it('should create a valid engagement', () => {
    const request = {
      name: 'Project Alpha',
      deal_type: 'buyout' as const,
      target: {
        name: 'TechCorp Inc',
        description: 'Enterprise software company',
        sector: 'technology' as const,
        subsector: 'SaaS',
        geography: 'North America',
        revenue_range: '$50-100M',
        employee_count: 200,
      },
      team: [
        {
          user_id: crypto.randomUUID(),
          name: 'John Doe',
          role: 'deal_lead' as const,
          email: 'john@example.com',
        },
      ],
    };

    const engagement = createEngagement(request, 'creator-id');

    expect(engagement.id).toBeDefined();
    expect(engagement.name).toBe(request.name);
    expect(engagement.deal_type).toBe(request.deal_type);
    expect(engagement.target.name).toBe(request.target.name);
    expect(engagement.status).toBe('active');
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
      crypto.randomUUID(),
      { hypothesis_id: crypto.randomUUID(), change: 'confidence_updated' }
    );

    expect(event.id).toBeDefined();
    expect(event.type).toBe('hypothesis_updated');
    expect(event.timestamp).toBeDefined();
    expect(event.data).toBeDefined();
  });
});
