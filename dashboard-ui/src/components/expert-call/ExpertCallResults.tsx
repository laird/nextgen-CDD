/**
 * Display component for expert call analysis results
 * Presents analysis as a nicely formatted document
 */
import { useState } from 'react';
import {
  User,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Quote,
  HelpCircle,
  CheckCircle,
  XCircle,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Scale,
  Minus,
} from 'lucide-react';
import type { ExpertCall, ExpertCallResults as ExpertCallResultsType, ThesisAlignment } from '../../types/api';
import { InsightsList } from './InsightsList';

interface ExpertCallResultsProps {
  expertCall: ExpertCall;
  onHypothesisClick?: (hypothesisId: string) => void;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatTimestamp(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function ExpertCallResults({ expertCall, onHypothesisClick }: ExpertCallResultsProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const results = expertCall.results as ExpertCallResultsType | null;

  if (!results) {
    return (
      <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-6">
        <div className="flex flex-col items-center justify-center text-surface-500 dark:text-surface-400 py-8">
          <FileText className="h-12 w-12 mb-3 opacity-50" />
          <p>No results available</p>
          <p className="text-sm">Process a transcript to see analysis</p>
        </div>
      </div>
    );
  }

  const { analysis, expertProfiles, keyInsights, consensusPoints, divergencePoints, followUpQuestions, synthesizedSummary, thesisAlignment } = results;

  // Get thesis alignment styling
  const getAlignmentStyle = (alignment: ThesisAlignment | undefined) => {
    if (!alignment) return { bg: 'bg-surface-100 dark:bg-surface-700', text: 'text-surface-600 dark:text-surface-400', icon: Minus, label: 'Not Assessed' };
    switch (alignment.overall) {
      case 'supports':
        return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: ThumbsUp, label: 'Supports Thesis' };
      case 'contradicts':
        return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: ThumbsDown, label: 'Contradicts Thesis' };
      case 'mixed':
        return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', icon: Scale, label: 'Mixed Signals' };
      default:
        return { bg: 'bg-surface-100 dark:bg-surface-700', text: 'text-surface-600 dark:text-surface-400', icon: Minus, label: 'Neutral' };
    }
  };

  const alignmentStyle = getAlignmentStyle(thesisAlignment);
  const AlignmentIcon = alignmentStyle.icon;

  return (
    <div className="space-y-4">
      {/* Thesis Alignment Banner */}
      {thesisAlignment && (
        <div className={`rounded-lg border p-4 ${alignmentStyle.bg} ${
          thesisAlignment.overall === 'supports' ? 'border-green-300 dark:border-green-700' :
          thesisAlignment.overall === 'contradicts' ? 'border-red-300 dark:border-red-700' :
          thesisAlignment.overall === 'mixed' ? 'border-yellow-300 dark:border-yellow-700' :
          'border-surface-300 dark:border-surface-600'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full ${alignmentStyle.bg}`}>
              <AlignmentIcon className={`h-6 w-6 ${alignmentStyle.text}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className={`text-lg font-semibold ${alignmentStyle.text}`}>
                  {alignmentStyle.label}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-sm font-medium ${alignmentStyle.bg} ${alignmentStyle.text}`}>
                  Score: {thesisAlignment.score > 0 ? '+' : ''}{thesisAlignment.score.toFixed(1)}
                </span>
              </div>
              <p className="text-sm text-surface-700 dark:text-surface-300 mb-3">
                {thesisAlignment.reasoning}
              </p>

              {/* Supporting & Challenging Points */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                {thesisAlignment.supportingPoints.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-green-700 dark:text-green-400 mb-1 flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      Supporting Points
                    </h4>
                    <ul className="space-y-1">
                      {thesisAlignment.supportingPoints.map((point, idx) => (
                        <li key={idx} className="text-xs text-surface-600 dark:text-surface-400 flex items-start gap-1">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-green-500 flex-shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {thesisAlignment.challengingPoints.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                      <ThumbsDown className="h-3.5 w-3.5" />
                      Challenging Points
                    </h4>
                    <ul className="space-y-1">
                      {thesisAlignment.challengingPoints.map((point, idx) => (
                        <li key={idx} className="text-xs text-surface-600 dark:text-surface-400 flex items-start gap-1">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-red-500 flex-shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
        <h3 className="text-lg font-semibold text-surface-900 dark:text-white mb-3">
          Call Summary
        </h3>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-lg bg-surface-50 dark:bg-surface-700/50">
            <Clock className="h-5 w-5 mx-auto mb-1 text-surface-500" />
            <p className="text-lg font-semibold text-surface-900 dark:text-white">
              {formatDuration(analysis.duration)}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">Duration</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-surface-50 dark:bg-surface-700/50">
            <User className="h-5 w-5 mx-auto mb-1 text-surface-500" />
            <p className="text-lg font-semibold text-surface-900 dark:text-white">
              {analysis.speakers.length}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">Speakers</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-surface-50 dark:bg-surface-700/50">
            <MessageSquare className="h-5 w-5 mx-auto mb-1 text-surface-500" />
            <p className="text-lg font-semibold text-surface-900 dark:text-white">
              {keyInsights.length}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">Insights</p>
          </div>
        </div>

        {/* Synthesized Summary */}
        <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <h4 className="text-sm font-semibold text-primary-800 dark:text-primary-200 mb-2">
            Executive Summary
          </h4>
          <div className="text-sm text-surface-700 dark:text-surface-300 space-y-2 leading-relaxed">
            {synthesizedSummary.split('\n').filter(p => p.trim()).map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Expert Profiles */}
      {expertProfiles.length > 0 && (
        <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
          <h3 className="text-md font-semibold text-surface-900 dark:text-white mb-3">
            Expert Profiles
          </h3>
          <div className="space-y-3">
            {expertProfiles.map((profile, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-surface-200 dark:border-surface-700"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-surface-900 dark:text-white">
                      {profile.name}
                    </p>
                    {profile.role && (
                      <p className="text-sm text-surface-500 dark:text-surface-400">
                        {profile.role}
                        {profile.organization && ` at ${profile.organization}`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-surface-500 dark:text-surface-400">
                    {profile.segmentCount} speaking {profile.segmentCount === 1 ? 'contribution' : 'contributions'}
                  </span>
                </div>
                {profile.expertise.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {profile.expertise.map((exp, expIdx) => (
                      <span
                        key={expIdx}
                        className="px-2 py-0.5 rounded text-xs bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300"
                      >
                        {exp}
                      </span>
                    ))}
                  </div>
                )}
                {profile.perspectiveSummary && (
                  <p className="mt-2 text-sm text-surface-600 dark:text-surface-400 italic">
                    "{profile.perspectiveSummary}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Insights */}
      <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
        <h3 className="text-md font-semibold text-surface-900 dark:text-white mb-3">
          Key Insights
        </h3>
        <InsightsList insights={keyInsights} onHypothesisClick={onHypothesisClick} />
      </div>

      {/* Consensus & Divergence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Consensus Points */}
        {consensusPoints.length > 0 && (
          <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
            <h3 className="flex items-center gap-2 text-md font-semibold text-surface-900 dark:text-white mb-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Consensus Points
            </h3>
            <ul className="space-y-2">
              {consensusPoints.map((point, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Divergence Points */}
        {divergencePoints.length > 0 && (
          <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
            <h3 className="flex items-center gap-2 text-md font-semibold text-surface-900 dark:text-white mb-3">
              <XCircle className="h-5 w-5 text-red-500" />
              Divergence Points
            </h3>
            <ul className="space-y-2">
              {divergencePoints.map((point, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-surface-700 dark:text-surface-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Follow-up Questions */}
      {followUpQuestions.length > 0 && (
        <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
          <h3 className="flex items-center gap-2 text-md font-semibold text-surface-900 dark:text-white mb-3">
            <HelpCircle className="h-5 w-5 text-yellow-500" />
            Suggested Follow-up Questions
          </h3>
          <ul className="space-y-2">
            {followUpQuestions.map((question, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 text-sm text-surface-700 dark:text-surface-300"
              >
                <span className="font-medium text-yellow-700 dark:text-yellow-400">Q{idx + 1}:</span>
                {question}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Quotes */}
      {analysis.keyQuotes && analysis.keyQuotes.length > 0 && (
        <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
          <h3 className="flex items-center gap-2 text-md font-semibold text-surface-900 dark:text-white mb-3">
            <Quote className="h-5 w-5 text-primary-500" />
            Key Quotes
          </h3>
          <div className="space-y-3">
            {analysis.keyQuotes.map((quote, idx) => (
              <blockquote
                key={idx}
                className="border-l-4 border-primary-400 pl-4 py-2"
              >
                <p className="text-sm text-surface-700 dark:text-surface-300 italic">
                  "{quote.text}"
                </p>
                <footer className="mt-1 text-xs text-surface-500 dark:text-surface-400">
                  - {quote.speaker} at {formatTimestamp(quote.timestamp)}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      )}

      {/* Original Transcript (Collapsible) */}
      {expertCall.transcript && (
        <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="font-medium text-surface-900 dark:text-white">
              Original Transcript
            </span>
            {showTranscript ? (
              <ChevronDown className="h-5 w-5 text-surface-500" />
            ) : (
              <ChevronRight className="h-5 w-5 text-surface-500" />
            )}
          </button>
          {showTranscript && (
            <div className="px-4 pb-4">
              <pre className="whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-700/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                {expertCall.transcript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
