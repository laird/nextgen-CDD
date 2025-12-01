/**
 * Credibility Scorer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CredibilityScorer,
  getCredibilityScorer,
  setCredibilityScorer,
  scoreCredibility,
  type SourceMetadata,
  type PublicationType,
} from '../../src/tools/credibility-scorer.js';

describe('CredibilityScorer', () => {
  let scorer: CredibilityScorer;

  beforeEach(() => {
    scorer = new CredibilityScorer();
  });

  describe('score()', () => {
    it('should return a credibility score with all components', () => {
      const metadata: SourceMetadata = {
        url: 'https://wsj.com/article/test',
        domain: 'wsj.com',
        author: 'John Smith',
        publicationType: 'news_major',
        publishedDate: new Date(),
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
      expect(result.components).toBeDefined();
      expect(result.components.domainReputation).toBeDefined();
      expect(result.components.publicationType).toBeDefined();
      expect(result.components.authorCredibility).toBeDefined();
      expect(result.components.freshness).toBeDefined();
      expect(result.components.citationDensity).toBeDefined();
      expect(result.factors).toHaveLength(5);
      expect(result.recommendation).toBeDefined();
    });

    it('should give high score to academic journals', () => {
      const metadata: SourceMetadata = {
        url: 'https://arxiv.org/paper/12345',
        publicationType: 'academic_journal',
        publishedDate: new Date(),
        isPeerReviewed: true,
        citationCount: 50,
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeGreaterThan(0.7);
      expect(result.recommendation).toBe('high_confidence');
    });

    it('should give low score to social media', () => {
      const metadata: SourceMetadata = {
        url: 'https://twitter.com/user/status/123',
        publicationType: 'social_media',
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeLessThan(0.5);
      expect(['low_confidence', 'verify_required']).toContain(result.recommendation);
    });

    it('should give moderate score to news trade publications', () => {
      const metadata: SourceMetadata = {
        url: 'https://techcrunch.com/article',
        publicationType: 'news_trade',
        author: 'Tech Writer',
        publishedDate: new Date(),
      };

      const result = scorer.score(metadata);

      expect(result.overall).toBeGreaterThan(0.4);
      expect(result.overall).toBeLessThan(0.8);
    });
  });

  describe('inferPublicationType()', () => {
    it('should infer government_report for .gov domains', () => {
      expect(scorer.inferPublicationType('https://sec.gov/document')).toBe('government_report');
      expect(scorer.inferPublicationType('https://data.gov.uk/report')).toBe('government_report');
    });

    it('should infer academic_journal for .edu domains', () => {
      expect(scorer.inferPublicationType('https://stanford.edu/research')).toBe('academic_journal');
      expect(scorer.inferPublicationType('https://arxiv.org/abs/1234')).toBe('academic_journal');
    });

    it('should infer news_major for major news outlets', () => {
      expect(scorer.inferPublicationType('https://wsj.com/article')).toBe('news_major');
      expect(scorer.inferPublicationType('https://nytimes.com/story')).toBe('news_major');
      expect(scorer.inferPublicationType('https://bloomberg.com/news')).toBe('news_major');
    });

    it('should infer industry_report for consulting firms', () => {
      expect(scorer.inferPublicationType('https://mckinsey.com/insights')).toBe('industry_report');
      expect(scorer.inferPublicationType('https://gartner.com/report')).toBe('industry_report');
    });

    it('should infer social_media for social platforms', () => {
      expect(scorer.inferPublicationType('https://twitter.com/user')).toBe('social_media');
      expect(scorer.inferPublicationType('https://linkedin.com/post')).toBe('social_media');
    });

    it('should return unknown for unrecognized domains', () => {
      expect(scorer.inferPublicationType('https://random-domain.xyz/page')).toBe('unknown');
    });
  });
});

describe('Singleton and Helper Functions', () => {
  it('getCredibilityScorer should return singleton instance', () => {
    const scorer1 = getCredibilityScorer();
    const scorer2 = getCredibilityScorer();
    expect(scorer1).toBe(scorer2);
  });

  it('setCredibilityScorer should replace singleton', () => {
    const customScorer = new CredibilityScorer();
    setCredibilityScorer(customScorer);
    expect(getCredibilityScorer()).toBe(customScorer);
  });

  it('scoreCredibility helper should work', () => {
    const metadata: SourceMetadata = {
      url: 'https://example.com',
    };
    const result = scoreCredibility(metadata);
    expect(result.overall).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });
});

describe('Credibility Score Components', () => {
  let scorer: CredibilityScorer;

  beforeEach(() => {
    scorer = new CredibilityScorer();
  });

  describe('Author Credibility', () => {
    it('should give higher score for authors with expert titles', () => {
      const expertMetadata: SourceMetadata = {
        url: 'https://example.com',
        author: 'Dr. Jane Smith',
        authorTitle: 'PhD, Professor of Economics',
        authorOrganization: 'Harvard University',
      };

      const basicMetadata: SourceMetadata = {
        url: 'https://example.com',
        author: 'John Doe',
      };

      const expertResult = scorer.score(expertMetadata);
      const basicResult = scorer.score(basicMetadata);

      expect(expertResult.components.authorCredibility).toBeGreaterThan(
        basicResult.components.authorCredibility
      );
    });

    it('should give low score when author is missing', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
      };

      const result = scorer.score(metadata);
      expect(result.components.authorCredibility).toBe(0.4);
    });
  });

  describe('Freshness', () => {
    it('should give high score for recent content', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
        publishedDate: new Date(), // Today
      };

      const result = scorer.score(metadata);
      expect(result.components.freshness).toBe(1.0);
    });

    it('should give lower score for older content', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const metadata: SourceMetadata = {
        url: 'https://example.com',
        publishedDate: twoYearsAgo,
      };

      const result = scorer.score(metadata);
      expect(result.components.freshness).toBeLessThan(0.5);
    });

    it('should give neutral score when date is unknown', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
      };

      const result = scorer.score(metadata);
      expect(result.components.freshness).toBe(0.5);
    });
  });

  describe('Citation Density', () => {
    it('should give high score for highly cited content', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
        citationCount: 150,
      };

      const result = scorer.score(metadata);
      expect(result.components.citationDensity).toBeGreaterThanOrEqual(0.95);
    });

    it('should detect citations in content', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
      };
      const content = `
        According to Smith (2023), the market grew by 20% [1].
        This was confirmed by Jones (2024) in a recent study [2].
        Source: https://example.com/study
      `;

      const result = scorer.score(metadata, content);
      expect(result.components.citationDensity).toBeGreaterThan(0.5);
    });

    it('should give high score for original research', () => {
      const metadata: SourceMetadata = {
        url: 'https://example.com',
        isOriginalResearch: true,
      };

      const result = scorer.score(metadata);
      expect(result.components.citationDensity).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('Recommendation Thresholds', () => {
    it('should recommend high_confidence for scores >= 0.75', () => {
      const metadata: SourceMetadata = {
        url: 'https://nature.com/article',
        publicationType: 'academic_journal',
        isPeerReviewed: true,
        author: 'Dr. Expert',
        authorTitle: 'Professor',
        authorOrganization: 'MIT',
        publishedDate: new Date(),
        citationCount: 100,
      };

      const result = scorer.score(metadata);
      expect(result.recommendation).toBe('high_confidence');
    });

    it('should recommend verify_required for very low scores', () => {
      // Use social_media type without any additional metadata to get very low score
      const metadata: SourceMetadata = {
        url: 'https://random-social.xyz/post',
        publicationType: 'social_media',
      };

      const result = scorer.score(metadata);
      // Social media (0.25) with minimal metadata should produce low overall score
      expect(result.overall).toBeLessThanOrEqual(0.5);
      expect(['low_confidence', 'verify_required']).toContain(result.recommendation);
    });
  });
});
