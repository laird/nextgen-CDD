/**
 * Transcript Processor - Expert call transcript processing
 *
 * Processes interview transcripts for insight extraction:
 * - Speaker diarization and attribution
 * - Key insight identification
 * - Quote extraction and highlighting
 * - Consensus/divergence analysis
 * - Follow-up question generation
 */

/**
 * Transcript segment with speaker attribution
 */
export interface TranscriptSegment {
  id: string;
  speaker: string;
  speakerRole?: string;
  text: string;
  startTime: number;  // milliseconds
  endTime: number;    // milliseconds
  confidence?: number;
}

/**
 * Extracted insight from transcript
 */
export interface TranscriptInsight {
  id: string;
  type: InsightType;
  content: string;
  quote?: string;
  speaker: string;
  timestamp: number;
  confidence: number;
  relatedHypothesisIds?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  importance: 'high' | 'medium' | 'low';
}

/**
 * Types of insights
 */
export type InsightType =
  | 'key_point'
  | 'data_point'
  | 'market_insight'
  | 'competitive_intel'
  | 'risk_factor'
  | 'opportunity'
  | 'contradiction'
  | 'validation'
  | 'caveat'
  | 'recommendation';

/**
 * Expert profile from transcript
 */
export interface ExpertProfile {
  name: string;
  role?: string;
  organization?: string;
  expertise: string[];
  perspectiveSummary?: string;
  credibilityIndicators: string[];
  speakingTime: number;  // milliseconds
  segmentCount: number;
}

/**
 * Transcript analysis result
 */
export interface TranscriptAnalysis {
  id: string;
  callId: string;
  duration: number;
  speakers: ExpertProfile[];
  insights: TranscriptInsight[];
  keyQuotes: ExtractedQuote[];
  topics: DiscussedTopic[];
  followUpQuestions: string[];
  summary: string;
  contradictions?: Array<{
    statement1: string;
    statement2: string;
    speaker1: string;
    speaker2: string;
    severity: number;
  }>;
}

/**
 * Extracted quote
 */
export interface ExtractedQuote {
  id: string;
  text: string;
  speaker: string;
  timestamp: number;
  context: string;
  significance: string;
}

/**
 * Discussed topic
 */
export interface DiscussedTopic {
  name: string;
  timeSpent: number;  // milliseconds
  sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
  keyPoints: string[];
}

/**
 * Real-time transcript chunk
 */
export interface RealtimeChunk {
  text: string;
  speaker: string;
  timestamp: number;
  isFinal: boolean;
}

/**
 * Real-time insight for interviewer support
 */
export interface RealtimeInsight {
  type: 'key_point' | 'contradiction' | 'follow_up' | 'data_point';
  content: string;
  confidence: number;
  relatedHypothesisId?: string;
}

/**
 * Transcript Processor Service
 */
export class TranscriptProcessor {
  private insightPatterns: Array<{
    type: InsightType;
    patterns: RegExp[];
    importance: 'high' | 'medium' | 'low';
  }> = [
    {
      type: 'data_point',
      patterns: [
        /\b\d+%\s+(?:growth|decline|increase|decrease)/gi,
        /\$\d+(?:\.\d+)?(?:M|B|K|million|billion)/gi,
        /\b(?:revenue|sales|profit|margin|growth)\s+(?:of|at|around|approximately)\s+\d+/gi,
        /\b\d+(?:x|X)\s+(?:growth|revenue|multiple)/gi,
      ],
      importance: 'high',
    },
    {
      type: 'market_insight',
      patterns: [
        /the market is\s+\w+/gi,
        /market\s+(?:trend|size|share|opportunity)/gi,
        /industry\s+(?:consolidation|fragmentation|growth)/gi,
        /competitive\s+(?:landscape|dynamics|pressure)/gi,
      ],
      importance: 'medium',
    },
    {
      type: 'risk_factor',
      patterns: [
        /(?:risk|concern|worry|challenge)\s+(?:is|are|include)/gi,
        /(?:I'm|we're)\s+(?:worried|concerned)\s+about/gi,
        /(?:downside|threat|vulnerability)/gi,
        /(?:could|might|may)\s+(?:fail|struggle|face)/gi,
      ],
      importance: 'high',
    },
    {
      type: 'competitive_intel',
      patterns: [
        /competitor[s]?\s+(?:is|are|have)/gi,
        /\[competitor name\]\s+(?:is|has|does)/gi,
        /compared to\s+\w+/gi,
        /market leader[s]?\s+(?:is|are)/gi,
      ],
      importance: 'medium',
    },
    {
      type: 'validation',
      patterns: [
        /(?:I|we)\s+(?:agree|confirm|validate)/gi,
        /that's\s+(?:correct|accurate|right)/gi,
        /(?:definitely|absolutely|certainly)\s+(?:true|correct)/gi,
      ],
      importance: 'medium',
    },
    {
      type: 'contradiction',
      patterns: [
        /(?:I|we)\s+(?:disagree|don't agree)/gi,
        /that's\s+(?:not|incorrect|wrong)/gi,
        /(?:however|but|although|contrary)/gi,
        /(?:I'm not sure|I don't think)\s+that/gi,
      ],
      importance: 'high',
    },
    {
      type: 'recommendation',
      patterns: [
        /(?:I|we)\s+(?:recommend|suggest|advise)/gi,
        /(?:should|would)\s+(?:consider|look at|focus on)/gi,
        /(?:key|important)\s+(?:thing|factor|consideration)/gi,
      ],
      importance: 'medium',
    },
  ];

  /**
   * Process a complete transcript
   */
  async processTranscript(
    callId: string,
    segments: TranscriptSegment[]
  ): Promise<TranscriptAnalysis> {
    const id = crypto.randomUUID();

    // Extract speaker profiles
    const speakers = this.extractSpeakerProfiles(segments);

    // Extract insights
    const insights = this.extractInsights(segments);

    // Extract key quotes
    const keyQuotes = this.extractKeyQuotes(segments, insights);

    // Identify topics
    const topics = this.identifyTopics(segments);

    // Generate follow-up questions
    const followUpQuestions = this.generateFollowUpQuestions(insights, topics);

    // Find contradictions between speakers
    const contradictions = this.findContradictions(segments);

    // Generate summary
    const summary = this.generateSummary(speakers, insights, topics);

    // Calculate duration
    const duration = segments.length > 0
      ? segments[segments.length - 1]!.endTime - segments[0]!.startTime
      : 0;

    const result: TranscriptAnalysis = {
      id,
      callId,
      duration,
      speakers,
      insights,
      keyQuotes,
      topics,
      followUpQuestions,
      summary,
    };

    if (contradictions.length > 0) {
      result.contradictions = contradictions;
    }

    return result;
  }

  /**
   * Process a real-time transcript chunk
   */
  processRealtimeChunk(
    chunk: RealtimeChunk,
    context: {
      previousChunks: RealtimeChunk[];
      hypotheses: Array<{ id: string; content: string }>;
    }
  ): {
    insights: RealtimeInsight[];
    suggestedFollowups: string[];
  } {
    const insights: RealtimeInsight[] = [];
    const suggestedFollowups: string[] = [];

    // Check for insight patterns
    for (const { type, patterns, importance } of this.insightPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(chunk.text)) {
          insights.push({
            type: type as RealtimeInsight['type'],
            content: chunk.text,
            confidence: importance === 'high' ? 0.9 : importance === 'medium' ? 0.7 : 0.5,
          });

          // Generate follow-up based on insight type
          if (type === 'data_point') {
            suggestedFollowups.push(`Can you elaborate on that number? What's the source?`);
          } else if (type === 'risk_factor') {
            suggestedFollowups.push(`How significant is that risk? What mitigation strategies exist?`);
          } else if (type === 'market_insight') {
            suggestedFollowups.push(`What's driving that market dynamic?`);
          }
        }
      }
    }

    // Check for hypothesis relevance
    for (const hypothesis of context.hypotheses) {
      const relevance = this.calculateRelevance(chunk.text, hypothesis.content);
      if (relevance > 0.6) {
        insights.push({
          type: 'key_point',
          content: `Relates to hypothesis: ${hypothesis.content.slice(0, 100)}`,
          confidence: relevance,
          relatedHypothesisId: hypothesis.id,
        });
      }
    }

    // Check for contradictions with previous statements
    for (const prevChunk of context.previousChunks.slice(-10)) {
      if (this.detectContradiction(prevChunk.text, chunk.text)) {
        insights.push({
          type: 'contradiction',
          content: `Potential contradiction with earlier statement: "${prevChunk.text.slice(0, 100)}"`,
          confidence: 0.7,
        });
        suggestedFollowups.push(`You mentioned earlier ${prevChunk.text.slice(0, 50)}... - can you reconcile that?`);
      }
    }

    return { insights, suggestedFollowups };
  }

  /**
   * Extract speaker profiles from segments
   */
  private extractSpeakerProfiles(segments: TranscriptSegment[]): ExpertProfile[] {
    const speakerMap = new Map<string, {
      segments: TranscriptSegment[];
      totalTime: number;
    }>();

    for (const segment of segments) {
      const existing = speakerMap.get(segment.speaker) ?? {
        segments: [],
        totalTime: 0,
      };
      existing.segments.push(segment);
      existing.totalTime += segment.endTime - segment.startTime;
      speakerMap.set(segment.speaker, existing);
    }

    const profiles: ExpertProfile[] = [];
    for (const [speaker, data] of speakerMap) {
      const combinedText = data.segments.map((s) => s.text).join(' ');
      const expertise = this.inferExpertise(combinedText);

      const profile: ExpertProfile = {
        name: speaker,
        expertise,
        credibilityIndicators: this.extractCredibilityIndicators(combinedText),
        speakingTime: data.totalTime,
        segmentCount: data.segments.length,
      };

      const firstSegmentRole = data.segments[0]?.speakerRole;
      if (firstSegmentRole !== undefined) {
        profile.role = firstSegmentRole;
      }

      profiles.push(profile);
    }

    return profiles;
  }

  /**
   * Extract insights from transcript segments
   */
  private extractInsights(segments: TranscriptSegment[]): TranscriptInsight[] {
    const insights: TranscriptInsight[] = [];

    for (const segment of segments) {
      for (const { type, patterns, importance } of this.insightPatterns) {
        for (const pattern of patterns) {
          const matches = segment.text.match(pattern);
          if (matches) {
            // Find the sentence containing the match
            const sentences = segment.text.split(/[.!?]+/);
            for (const sentence of sentences) {
              if (pattern.test(sentence)) {
                insights.push({
                  id: crypto.randomUUID(),
                  type,
                  content: sentence.trim(),
                  quote: sentence.trim(),
                  speaker: segment.speaker,
                  timestamp: segment.startTime,
                  confidence: 0.8,
                  importance,
                  sentiment: this.detectSentiment(sentence),
                });
              }
            }
          }
        }
      }
    }

    // Deduplicate similar insights
    return this.deduplicateInsights(insights);
  }

  /**
   * Extract key quotes
   */
  private extractKeyQuotes(
    segments: TranscriptSegment[],
    insights: TranscriptInsight[]
  ): ExtractedQuote[] {
    const quotes: ExtractedQuote[] = [];

    // Add quotes from high-importance insights
    for (const insight of insights.filter((i) => i.importance === 'high' && i.quote)) {
      quotes.push({
        id: crypto.randomUUID(),
        text: insight.quote!,
        speaker: insight.speaker,
        timestamp: insight.timestamp,
        context: insight.content,
        significance: `${insight.type}: ${insight.content.slice(0, 100)}`,
      });
    }

    // Look for quotable patterns
    const quotablePatterns = [
      /the biggest\s+\w+\s+is/gi,
      /the key\s+(?:thing|factor|driver)/gi,
      /what I've seen is/gi,
      /in my experience/gi,
      /the truth is/gi,
    ];

    for (const segment of segments) {
      for (const pattern of quotablePatterns) {
        if (pattern.test(segment.text)) {
          const sentences = segment.text.split(/[.!?]+/);
          for (const sentence of sentences) {
            if (pattern.test(sentence) && sentence.length > 20 && sentence.length < 300) {
              quotes.push({
                id: crypto.randomUUID(),
                text: sentence.trim(),
                speaker: segment.speaker,
                timestamp: segment.startTime,
                context: segment.text.slice(0, 200),
                significance: 'Expert opinion',
              });
            }
          }
        }
      }
    }

    // Deduplicate and limit
    return quotes
      .filter((q, i, arr) => arr.findIndex((x) => x.text === q.text) === i)
      .slice(0, 10);
  }

  /**
   * Identify topics discussed
   */
  private identifyTopics(segments: TranscriptSegment[]): DiscussedTopic[] {
    const topicKeywords: Record<string, string[]> = {
      'Market Size': ['tam', 'sam', 'som', 'market size', 'addressable market', 'total market'],
      'Competition': ['competitor', 'competitive', 'market share', 'rivalry', 'alternative'],
      'Growth': ['growth', 'expansion', 'scale', 'trajectory', 'acceleration'],
      'Technology': ['technology', 'platform', 'software', 'tech stack', 'infrastructure'],
      'Customers': ['customer', 'client', 'user', 'buyer', 'retention', 'churn'],
      'Pricing': ['pricing', 'price', 'cost', 'asp', 'margin', 'revenue model'],
      'Risks': ['risk', 'concern', 'challenge', 'threat', 'vulnerability'],
      'Team': ['team', 'management', 'leadership', 'talent', 'culture'],
    };

    const topics: DiscussedTopic[] = [];

    for (const [topicName, keywords] of Object.entries(topicKeywords)) {
      let timeSpent = 0;
      const keyPoints: string[] = [];
      let sentimentSum = 0;
      let sentimentCount = 0;

      for (const segment of segments) {
        const text = segment.text.toLowerCase();
        const hasKeyword = keywords.some((k) => text.includes(k.toLowerCase()));

        if (hasKeyword) {
          timeSpent += segment.endTime - segment.startTime;

          // Extract key point
          const sentences = segment.text.split(/[.!?]+/);
          for (const sentence of sentences) {
            if (keywords.some((k) => sentence.toLowerCase().includes(k.toLowerCase()))) {
              if (sentence.length > 20 && keyPoints.length < 5) {
                keyPoints.push(sentence.trim());
              }
            }
          }

          // Track sentiment
          const sentiment = this.detectSentiment(segment.text);
          sentimentSum += sentiment === 'positive' ? 1 : sentiment === 'negative' ? -1 : 0;
          sentimentCount++;
        }
      }

      if (timeSpent > 0) {
        const avgSentiment = sentimentCount > 0 ? sentimentSum / sentimentCount : 0;
        topics.push({
          name: topicName,
          timeSpent,
          sentiment: avgSentiment > 0.3 ? 'positive' : avgSentiment < -0.3 ? 'negative' : 'neutral',
          keyPoints,
        });
      }
    }

    return topics.sort((a, b) => b.timeSpent - a.timeSpent);
  }

  /**
   * Generate follow-up questions
   */
  private generateFollowUpQuestions(
    insights: TranscriptInsight[],
    topics: DiscussedTopic[]
  ): string[] {
    const questions: string[] = [];

    // Questions from data points that need clarification
    const dataInsights = insights.filter((i) => i.type === 'data_point');
    for (const insight of dataInsights.slice(0, 3)) {
      questions.push(`Can you provide more context on ${insight.content.slice(0, 50)}?`);
    }

    // Questions from risk factors
    const riskInsights = insights.filter((i) => i.type === 'risk_factor');
    for (const insight of riskInsights.slice(0, 2)) {
      questions.push(`How would you mitigate the risk of ${insight.content.slice(0, 50)}?`);
    }

    // Questions about underexplored topics
    const underexploredTopics = topics
      .filter((t) => t.keyPoints.length < 2)
      .slice(0, 2);
    for (const topic of underexploredTopics) {
      questions.push(`Can you elaborate more on ${topic.name}?`);
    }

    // Validation questions
    const validations = insights.filter((i) => i.type === 'validation').slice(0, 1);
    for (const v of validations) {
      questions.push(`What evidence supports that ${v.content.slice(0, 50)}?`);
    }

    return questions.slice(0, 10);
  }

  /**
   * Find contradictions between speakers
   */
  private findContradictions(segments: TranscriptSegment[]): Array<{
    statement1: string;
    statement2: string;
    speaker1: string;
    speaker2: string;
    severity: number;
  }> {
    const contradictions: Array<{
      statement1: string;
      statement2: string;
      speaker1: string;
      speaker2: string;
      severity: number;
    }> = [];

    // Simple contradiction detection based on opposing sentiments on same topic
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const seg1 = segments[i]!;
        const seg2 = segments[j]!;

        // Skip same speaker
        if (seg1.speaker === seg2.speaker) continue;

        if (this.detectContradiction(seg1.text, seg2.text)) {
          contradictions.push({
            statement1: seg1.text.slice(0, 200),
            statement2: seg2.text.slice(0, 200),
            speaker1: seg1.speaker,
            speaker2: seg2.speaker,
            severity: 0.7,
          });
        }
      }
    }

    return contradictions.slice(0, 5);
  }

  /**
   * Generate transcript summary
   */
  private generateSummary(
    speakers: ExpertProfile[],
    insights: TranscriptInsight[],
    topics: DiscussedTopic[]
  ): string {
    const speakerList = speakers.map((s) => s.name).join(', ');
    const topTopics = topics.slice(0, 3).map((t) => t.name).join(', ');
    const keyInsightCount = insights.filter((i) => i.importance === 'high').length;

    return `Call with ${speakerList}. Main topics discussed: ${topTopics}. ` +
           `${keyInsightCount} high-priority insights identified. ` +
           `Total ${insights.length} insights extracted across ${topics.length} topic areas.`;
  }

  /**
   * Infer expertise areas from text
   */
  private inferExpertise(text: string): string[] {
    const expertiseKeywords: Record<string, string[]> = {
      'Financial Analysis': ['revenue', 'margin', 'profit', 'valuation', 'multiple', 'ebitda'],
      'Market Strategy': ['market', 'strategy', 'competition', 'positioning', 'share'],
      'Operations': ['operations', 'process', 'efficiency', 'supply chain', 'logistics'],
      'Technology': ['technology', 'platform', 'software', 'engineering', 'product'],
      'Sales': ['sales', 'customer', 'pipeline', 'deal', 'quota', 'account'],
    };

    const expertise: string[] = [];
    const lowerText = text.toLowerCase();

    for (const [area, keywords] of Object.entries(expertiseKeywords)) {
      const matchCount = keywords.filter((k) => lowerText.includes(k)).length;
      if (matchCount >= 2) {
        expertise.push(area);
      }
    }

    return expertise.slice(0, 3);
  }

  /**
   * Extract credibility indicators
   */
  private extractCredibilityIndicators(text: string): string[] {
    const indicators: string[] = [];

    const patterns = [
      { pattern: /\d+\s*years?\s+(?:of\s+)?experience/gi, indicator: 'Years of experience mentioned' },
      { pattern: /I've\s+(?:worked|been)\s+(?:at|with)/gi, indicator: 'Professional background referenced' },
      { pattern: /in my\s+(?:role|position)\s+as/gi, indicator: 'Role-based perspective' },
      { pattern: /based on\s+(?:data|research|analysis)/gi, indicator: 'Data-driven statements' },
    ];

    for (const { pattern, indicator } of patterns) {
      if (pattern.test(text)) {
        indicators.push(indicator);
      }
    }

    return indicators;
  }

  /**
   * Detect sentiment in text
   */
  private detectSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['good', 'great', 'excellent', 'strong', 'growth', 'opportunity', 'success', 'winning'];
    const negativeWords = ['bad', 'poor', 'weak', 'decline', 'risk', 'threat', 'failure', 'losing', 'concern'];

    const lowerText = text.toLowerCase();
    let score = 0;

    for (const word of positiveWords) {
      if (lowerText.includes(word)) score++;
    }
    for (const word of negativeWords) {
      if (lowerText.includes(word)) score--;
    }

    if (score > 1) return 'positive';
    if (score < -1) return 'negative';
    return 'neutral';
  }

  /**
   * Detect potential contradiction between statements
   */
  private detectContradiction(text1: string, text2: string): boolean {
    // Simple heuristic: opposing sentiment on similar topic
    const sentiment1 = this.detectSentiment(text1);
    const sentiment2 = this.detectSentiment(text2);

    if (sentiment1 === sentiment2 || sentiment1 === 'neutral' || sentiment2 === 'neutral') {
      return false;
    }

    // Check for topic overlap
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter((w) => w.length > 4));

    let overlap = 0;
    for (const word of words1) {
      if (words2.has(word)) overlap++;
    }

    return overlap >= 3 && sentiment1 !== sentiment2;
  }

  /**
   * Calculate relevance between text and hypothesis
   */
  private calculateRelevance(text: string, hypothesis: string): number {
    const textWords = new Set(text.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const hypothesisWords = hypothesis.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

    let matches = 0;
    for (const word of hypothesisWords) {
      if (textWords.has(word)) matches++;
    }

    return hypothesisWords.length > 0 ? matches / hypothesisWords.length : 0;
  }

  /**
   * Deduplicate similar insights
   */
  private deduplicateInsights(insights: TranscriptInsight[]): TranscriptInsight[] {
    const unique: TranscriptInsight[] = [];

    for (const insight of insights) {
      const isDuplicate = unique.some((u) =>
        this.calculateRelevance(u.content, insight.content) > 0.8
      );
      if (!isDuplicate) {
        unique.push(insight);
      }
    }

    return unique;
  }
}

// Singleton instance
let _transcriptProcessor: TranscriptProcessor | null = null;

/**
 * Get the singleton Transcript Processor
 */
export function getTranscriptProcessor(): TranscriptProcessor {
  if (!_transcriptProcessor) {
    _transcriptProcessor = new TranscriptProcessor();
  }
  return _transcriptProcessor;
}

/**
 * Set a custom Transcript Processor (for testing)
 */
export function setTranscriptProcessor(processor: TranscriptProcessor): void {
  _transcriptProcessor = processor;
}
