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
