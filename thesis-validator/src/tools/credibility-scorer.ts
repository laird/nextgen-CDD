/**
 * Credibility Scorer - Source credibility assessment
 *
 * Evaluates the credibility of evidence sources based on:
 * - Domain reputation and authority
 * - Publication type and editorial standards
 * - Author expertise and credentials
 * - Content freshness and recency
 * - Cross-reference validation
 */

import { getDomainCredibility, credibleDomains } from './web-search.js';

/**
 * Credibility score result
 */
export interface CredibilityScore {
  overall: number; // 0-1 overall credibility
  components: {
    domainReputation: number;
    publicationType: number;
    authorCredibility: number;
    freshness: number;
    citationDensity: number;
  };
  factors: CredibilityFactor[];
  recommendation: 'high_confidence' | 'moderate_confidence' | 'low_confidence' | 'verify_required';
}

/**
 * Individual credibility factor
 */
export interface CredibilityFactor {
  name: string;
  score: number;
  weight: number;
  reason: string;
}

/**
 * Source metadata for scoring
 */
export interface SourceMetadata {
  url?: string;
  domain?: string;
  author?: string;
  authorTitle?: string;
  authorOrganization?: string;
  publicationType?: PublicationType;
  publishedDate?: Date;
  citationCount?: number;
  hasCitations?: boolean;
  isOriginalResearch?: boolean;
  isPeerReviewed?: boolean;
  hasEditorialProcess?: boolean;
}

/**
 * Publication types
 */
export type PublicationType =
  | 'academic_journal'
  | 'government_report'
  | 'industry_report'
  | 'news_major'
  | 'news_trade'
  | 'company_filing'
  | 'press_release'
  | 'blog_expert'
  | 'blog_general'
  | 'social_media'
  | 'forum'
  | 'unknown';

/**
 * Publication type credibility scores
 */
const publicationTypeScores: Record<PublicationType, number> = {
  academic_journal: 0.95,
  government_report: 0.90,
  industry_report: 0.85,
  news_major: 0.80,
  company_filing: 0.80,
  news_trade: 0.70,
  press_release: 0.60,
  blog_expert: 0.55,
  blog_general: 0.35,
  social_media: 0.25,
  forum: 0.20,
  unknown: 0.40,
};

/**
 * Domain patterns for publication type inference
 */
const domainPublicationPatterns: Array<{
  patterns: string[];
  type: PublicationType;
}> = [
  {
    patterns: ['.gov', '.gov.uk', '.gc.ca', 'europa.eu'],
    type: 'government_report',
  },
  {
    patterns: ['.edu', 'arxiv.org', 'pubmed', 'scholar.google', 'jstor.org', 'ssrn.com'],
    type: 'academic_journal',
  },
  {
    patterns: ['sec.gov/Archives', 'sec.gov/cgi-bin/browse-edgar'],
    type: 'company_filing',
  },
  {
    patterns: ['mckinsey.com', 'bcg.com', 'bain.com', 'deloitte.com', 'pwc.com', 'ey.com', 'kpmg.com', 'gartner.com', 'forrester.com', 'ibisworld.com'],
    type: 'industry_report',
  },
  {
    patterns: ['wsj.com', 'nytimes.com', 'ft.com', 'bloomberg.com', 'reuters.com', 'economist.com', 'washingtonpost.com', 'bbc.com', 'cnbc.com'],
    type: 'news_major',
  },
  {
    patterns: ['techcrunch.com', 'businessinsider.com', 'forbes.com', 'venturebeat.com', 'theinformation.com', 'seekingalpha.com'],
    type: 'news_trade',
  },
  {
    patterns: ['prnewswire.com', 'businesswire.com', 'globenewswire.com', 'prweb.com'],
    type: 'press_release',
  },
  {
    patterns: ['medium.com', 'substack.com', 'wordpress.com', 'blogger.com'],
    type: 'blog_general',
  },
  {
    patterns: ['twitter.com', 'x.com', 'linkedin.com', 'facebook.com'],
    type: 'social_media',
  },
  {
    patterns: ['reddit.com', 'quora.com', 'stackoverflow.com'],
    type: 'forum',
  },
];

/**
 * Credibility Scorer Service
 */
export class CredibilityScorer {
  private weights = {
    domainReputation: 0.30,
    publicationType: 0.25,
    authorCredibility: 0.15,
    freshness: 0.15,
    citationDensity: 0.15,
  };

  /**
   * Calculate overall credibility score
   */
  score(metadata: SourceMetadata, content?: string): CredibilityScore {
    const factors: CredibilityFactor[] = [];

    // Domain reputation
    const domainScore = this.scoreDomainReputation(metadata);
    factors.push({
      name: 'Domain Reputation',
      score: domainScore,
      weight: this.weights.domainReputation,
      reason: this.getDomainReason(metadata, domainScore),
    });

    // Publication type
    const pubTypeScore = this.scorePublicationType(metadata);
    factors.push({
      name: 'Publication Type',
      score: pubTypeScore,
      weight: this.weights.publicationType,
      reason: this.getPublicationTypeReason(metadata, pubTypeScore),
    });

    // Author credibility
    const authorScore = this.scoreAuthorCredibility(metadata);
    factors.push({
      name: 'Author Credibility',
      score: authorScore,
      weight: this.weights.authorCredibility,
      reason: this.getAuthorReason(metadata, authorScore),
    });

    // Freshness
    const freshnessScore = this.scoreFreshness(metadata);
    factors.push({
      name: 'Content Freshness',
      score: freshnessScore,
      weight: this.weights.freshness,
      reason: this.getFreshnessReason(metadata, freshnessScore),
    });

    // Citation density
    const citationScore = this.scoreCitationDensity(metadata, content);
    factors.push({
      name: 'Citation Quality',
      score: citationScore,
      weight: this.weights.citationDensity,
      reason: this.getCitationReason(metadata, citationScore),
    });

    // Calculate overall score
    const overall = factors.reduce(
      (sum, f) => sum + f.score * f.weight,
      0
    );

    // Determine recommendation
    let recommendation: CredibilityScore['recommendation'];
    if (overall >= 0.75) {
      recommendation = 'high_confidence';
    } else if (overall >= 0.5) {
      recommendation = 'moderate_confidence';
    } else if (overall >= 0.3) {
      recommendation = 'low_confidence';
    } else {
      recommendation = 'verify_required';
    }

    return {
      overall,
      components: {
        domainReputation: domainScore,
        publicationType: pubTypeScore,
        authorCredibility: authorScore,
        freshness: freshnessScore,
        citationDensity: citationScore,
      },
      factors,
      recommendation,
    };
  }

  /**
   * Score domain reputation
   */
  private scoreDomainReputation(metadata: SourceMetadata): number {
    const domain = metadata.domain ?? (metadata.url ? this.extractDomain(metadata.url) : null);
    if (!domain) return 0.4;

    const credibility = getDomainCredibility(metadata.url ?? `https://${domain}`);

    switch (credibility) {
      case 'high':
        return 0.90;
      case 'medium':
        return 0.65;
      case 'low':
        return 0.35;
      default:
        // Check against additional patterns
        for (const { patterns, type } of domainPublicationPatterns) {
          if (patterns.some((p) => domain.includes(p))) {
            return publicationTypeScores[type] ?? 0.4;
          }
        }
        return 0.4;
    }
  }

  /**
   * Score publication type
   */
  private scorePublicationType(metadata: SourceMetadata): number {
    if (metadata.publicationType) {
      return publicationTypeScores[metadata.publicationType];
    }

    // Infer from domain
    const domain = metadata.domain ?? (metadata.url ? this.extractDomain(metadata.url) : null);
    if (!domain) return publicationTypeScores.unknown;

    for (const { patterns, type } of domainPublicationPatterns) {
      if (patterns.some((p) => domain.includes(p) || (metadata.url && metadata.url.includes(p)))) {
        return publicationTypeScores[type];
      }
    }

    // Apply modifiers
    let score = publicationTypeScores.unknown;

    if (metadata.isPeerReviewed) {
      score = Math.max(score, 0.85);
    }

    if (metadata.hasEditorialProcess) {
      score = Math.max(score, 0.65);
    }

    return score;
  }

  /**
   * Score author credibility
   */
  private scoreAuthorCredibility(metadata: SourceMetadata): number {
    let score = 0.5; // Base score for unknown author

    if (!metadata.author) {
      return 0.4;
    }

    // Has author name
    score = 0.55;

    // Has title
    if (metadata.authorTitle) {
      score += 0.15;

      // Check for expert indicators
      const expertTitles = ['phd', 'dr.', 'professor', 'ceo', 'cfo', 'analyst', 'partner', 'director', 'vp', 'managing'];
      if (expertTitles.some((t) => metadata.authorTitle!.toLowerCase().includes(t))) {
        score += 0.15;
      }
    }

    // Has organization affiliation
    if (metadata.authorOrganization) {
      score += 0.10;

      // Check for reputable organizations
      const reputableOrgs = ['university', 'institute', 'research', 'bank', 'federal', 'consulting'];
      if (reputableOrgs.some((o) => metadata.authorOrganization!.toLowerCase().includes(o))) {
        score += 0.10;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Score content freshness
   */
  private scoreFreshness(metadata: SourceMetadata): number {
    if (!metadata.publishedDate) {
      return 0.5; // Unknown freshness
    }

    const ageMs = Date.now() - metadata.publishedDate.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    if (ageDays < 7) return 1.0;      // Less than a week
    if (ageDays < 30) return 0.90;    // Less than a month
    if (ageDays < 90) return 0.80;    // Less than 3 months
    if (ageDays < 180) return 0.70;   // Less than 6 months
    if (ageDays < 365) return 0.60;   // Less than a year
    if (ageDays < 730) return 0.45;   // Less than 2 years
    if (ageDays < 1095) return 0.35;  // Less than 3 years

    return 0.25; // Older than 3 years
  }

  /**
   * Score citation density
   */
  private scoreCitationDensity(metadata: SourceMetadata, content?: string): number {
    let score = 0.4; // Base score

    // Has citations indicator
    if (metadata.hasCitations) {
      score = 0.65;
    }

    // Is original research
    if (metadata.isOriginalResearch) {
      score = Math.max(score, 0.75);
    }

    // Has citation count
    if (metadata.citationCount !== undefined) {
      if (metadata.citationCount > 100) {
        score = Math.max(score, 0.95);
      } else if (metadata.citationCount > 50) {
        score = Math.max(score, 0.85);
      } else if (metadata.citationCount > 10) {
        score = Math.max(score, 0.70);
      } else if (metadata.citationCount > 0) {
        score = Math.max(score, 0.55);
      }
    }

    // Analyze content for citation patterns
    if (content) {
      const citationPatterns = [
        /\[\d+\]/g,           // [1], [2], etc.
        /\(\w+,?\s*\d{4}\)/g, // (Author, 2024)
        /https?:\/\/[^\s]+/g, // URLs
        /according to/gi,
        /cited in/gi,
        /source:/gi,
      ];

      let citationIndicators = 0;
      for (const pattern of citationPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          citationIndicators += matches.length;
        }
      }

      if (citationIndicators > 10) {
        score = Math.max(score, 0.8);
      } else if (citationIndicators > 5) {
        score = Math.max(score, 0.65);
      } else if (citationIndicators > 0) {
        score = Math.max(score, 0.55);
      }
    }

    return score;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return null;
    }
  }

  /**
   * Get domain reputation reason
   */
  private getDomainReason(metadata: SourceMetadata, score: number): string {
    const domain = metadata.domain ?? (metadata.url ? this.extractDomain(metadata.url) : 'unknown');

    if (score >= 0.85) {
      return `${domain} is a highly reputable source`;
    } else if (score >= 0.6) {
      return `${domain} is a moderately credible source`;
    } else if (score >= 0.4) {
      return `${domain} has limited credibility indicators`;
    }
    return `${domain} credibility could not be verified`;
  }

  /**
   * Get publication type reason
   */
  private getPublicationTypeReason(metadata: SourceMetadata, score: number): string {
    const pubType = metadata.publicationType ?? 'unknown';

    if (score >= 0.85) {
      return `Published in ${pubType.replace('_', ' ')} with high editorial standards`;
    } else if (score >= 0.6) {
      return `Published in ${pubType.replace('_', ' ')} with moderate editorial oversight`;
    } else if (score >= 0.4) {
      return `Published in ${pubType.replace('_', ' ')} with limited verification`;
    }
    return `Publication type (${pubType.replace('_', ' ')}) suggests limited editorial process`;
  }

  /**
   * Get author credibility reason
   */
  private getAuthorReason(metadata: SourceMetadata, score: number): string {
    if (!metadata.author) {
      return 'Author information not available';
    }

    let reason = `Authored by ${metadata.author}`;
    if (metadata.authorTitle) {
      reason += ` (${metadata.authorTitle})`;
    }
    if (metadata.authorOrganization) {
      reason += ` at ${metadata.authorOrganization}`;
    }

    if (score >= 0.75) {
      return `${reason} - expert credentials`;
    } else if (score >= 0.55) {
      return `${reason} - professional credentials`;
    }
    return reason;
  }

  /**
   * Get freshness reason
   */
  private getFreshnessReason(metadata: SourceMetadata, score: number): string {
    if (!metadata.publishedDate) {
      return 'Publication date unknown';
    }

    const ageMs = Date.now() - metadata.publishedDate.getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    if (ageDays < 30) {
      return `Published ${ageDays} days ago - very recent`;
    } else if (ageDays < 365) {
      const months = Math.floor(ageDays / 30);
      return `Published ${months} months ago`;
    }
    const years = Math.floor(ageDays / 365);
    return `Published ${years} year(s) ago - may be outdated`;
  }

  /**
   * Get citation reason
   */
  private getCitationReason(metadata: SourceMetadata, score: number): string {
    if (metadata.citationCount !== undefined && metadata.citationCount > 0) {
      return `Cited ${metadata.citationCount} times`;
    }

    if (metadata.isOriginalResearch) {
      return 'Original research with primary data';
    }

    if (metadata.hasCitations) {
      return 'Contains citations to sources';
    }

    if (score >= 0.6) {
      return 'Evidence of source attribution';
    }
    return 'Limited citation information';
  }

  /**
   * Infer publication type from URL
   */
  inferPublicationType(url: string): PublicationType {
    const domain = this.extractDomain(url);
    if (!domain) return 'unknown';

    for (const { patterns, type } of domainPublicationPatterns) {
      if (patterns.some((p) => domain.includes(p) || url.includes(p))) {
        return type;
      }
    }

    return 'unknown';
  }
}

// Singleton instance
let _credibilityScorer: CredibilityScorer | null = null;

/**
 * Get the singleton Credibility Scorer
 */
export function getCredibilityScorer(): CredibilityScorer {
  if (!_credibilityScorer) {
    _credibilityScorer = new CredibilityScorer();
  }
  return _credibilityScorer;
}

/**
 * Set a custom Credibility Scorer (for testing)
 */
export function setCredibilityScorer(scorer: CredibilityScorer): void {
  _credibilityScorer = scorer;
}

/**
 * Helper function to score credibility
 */
export function scoreCredibility(
  metadata: SourceMetadata,
  content?: string
): CredibilityScore {
  return getCredibilityScorer().score(metadata, content);
}
