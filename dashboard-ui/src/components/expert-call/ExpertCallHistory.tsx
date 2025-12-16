/**
 * Component for displaying expert call history
 */
import { Clock, Loader2, CheckCircle, XCircle, AlertCircle, Trash2, Calendar, User, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import type { ExpertCall, ExpertCallStatus, ExpertCallResults, ExpertProfile, ThesisAlignment } from '../../types/api';

interface ExpertCallHistoryProps {
  expertCalls: ExpertCall[];
  isLoading?: boolean;
  onSelect: (callId: string) => void;
  onDelete?: (callId: string) => void;
  selectedCallId?: string | null;
}

const statusConfig: Record<ExpertCallStatus, {
  label: string;
  icon: React.ReactNode;
  color: string;
}> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="h-4 w-4" />,
    color: 'text-surface-500 bg-surface-100 dark:bg-surface-700 dark:text-surface-400',
  },
  processing: {
    label: 'Processing',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getInsightCount(expertCall: ExpertCall): number {
  if (!expertCall.results) return 0;
  const results = expertCall.results as ExpertCallResults;
  return results.keyInsights?.length ?? 0;
}

function getThesisAlignment(expertCall: ExpertCall): ThesisAlignment | undefined {
  if (!expertCall.results) return undefined;
  const results = expertCall.results as ExpertCallResults;
  return results.thesisAlignment;
}

const alignmentConfig: Record<ThesisAlignment['sentiment'], {
  icon: React.ReactNode;
  color: string;
  label: string;
}> = {
  supporting: {
    icon: <ThumbsUp className="h-3.5 w-3.5" />,
    color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
    label: 'Supporting',
  },
  contradicting: {
    icon: <ThumbsDown className="h-3.5 w-3.5" />,
    color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
    label: 'Contradicting',
  },
  neutral: {
    icon: <Minus className="h-3.5 w-3.5" />,
    color: 'text-surface-500 bg-surface-100 dark:bg-surface-700 dark:text-surface-400',
    label: 'Neutral',
  },
};

/**
 * Extract the primary expert (interviewee) from the call results
 * The interviewee is typically the non-interviewer with the most speaking contributions
 */
function getPrimaryExpert(expertCall: ExpertCall): { name: string; title: string } | null {
  if (!expertCall.results) return null;
  const results = expertCall.results as ExpertCallResults;

  if (!results.expertProfiles || results.expertProfiles.length === 0) return null;

  // Filter out the interviewer and find the expert with most contributions
  const experts = results.expertProfiles.filter(
    (p: ExpertProfile) => !p.name.toLowerCase().includes('interviewer')
  );

  if (experts.length === 0) return null;

  // Sort by segment count to get the primary speaker
  const primary = experts.sort((a: ExpertProfile, b: ExpertProfile) => b.segmentCount - a.segmentCount)[0];
  if (!primary) return null;

  const title = primary.role
    ? (primary.organization ? `${primary.role}, ${primary.organization}` : primary.role)
    : (primary.expertise?.length > 0 ? primary.expertise[0] : undefined) ?? '';

  return { name: primary.name, title };
}

export function ExpertCallHistory({
  expertCalls,
  isLoading,
  onSelect,
  onDelete,
  selectedCallId,
}: ExpertCallHistoryProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-surface-400" />
        </div>
      </div>
    );
  }

  if (expertCalls.length === 0) {
    return (
      <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
        <div className="flex flex-col items-center justify-center text-surface-500 dark:text-surface-400 py-8">
          <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
          <p>No expert calls yet</p>
          <p className="text-sm">Upload a transcript to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
      <div className="p-4 border-b border-surface-200 dark:border-surface-700">
        <h3 className="text-lg font-semibold text-surface-900 dark:text-white">
          Call History ({expertCalls.length})
        </h3>
      </div>
      <div className="divide-y divide-surface-200 dark:divide-surface-700">
        {expertCalls.map((call) => {
          const status = statusConfig[call.status];
          const isSelected = call.id === selectedCallId;
          const insightCount = getInsightCount(call);
          const expert = getPrimaryExpert(call);
          const thesisAlignment = getThesisAlignment(call);
          const isClickable = call.status === 'completed';

          // Determine box color based on status and sentiment
          const getBoxStyle = () => {
            if (call.status === 'processing') {
              return 'bg-surface-100 dark:bg-surface-700 border-l-4 border-l-surface-400';
            }
            if (call.status === 'failed') {
              return 'bg-red-50 dark:bg-red-900/20 border-l-4 border-l-red-500';
            }
            if (thesisAlignment) {
              switch (thesisAlignment.sentiment) {
                case 'supporting':
                  return 'bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-500';
                case 'contradicting':
                  return 'bg-red-50 dark:bg-red-900/20 border-l-4 border-l-red-500';
                default:
                  return 'bg-surface-50 dark:bg-surface-700/50 border-l-4 border-l-surface-400';
              }
            }
            return 'bg-surface-50 dark:bg-surface-700/50 border-l-4 border-l-surface-400';
          };

          return (
            <div
              key={call.id}
              onClick={() => isClickable && onSelect(call.id)}
              className={`p-4 transition-colors ${getBoxStyle()} ${
                isSelected ? 'ring-2 ring-primary-500' : ''
              } ${isClickable ? 'cursor-pointer hover:opacity-80' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Expert name and title */}
                  {expert ? (
                    <div className="mb-2">
                      <p className="font-medium text-surface-900 dark:text-white flex items-center gap-2">
                        <User className="h-4 w-4 text-surface-500" />
                        {expert.name}
                      </p>
                      {expert.title && (
                        <p className="text-sm text-surface-600 dark:text-surface-400 ml-6">
                          {expert.title}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-2">
                      <p className="font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
                        <User className="h-4 w-4 text-surface-400" />
                        {call.status === 'processing' ? 'Processing transcript...' : 'Expert Call'}
                      </p>
                    </div>
                  )}

                  {/* Date/time of call */}
                  <p className="flex items-center gap-1 text-sm text-surface-600 dark:text-surface-400 mb-2">
                    <Calendar className="h-3.5 w-3.5" />
                    {call.callDate ? formatDate(call.callDate) : formatDate(call.createdAt)}
                  </p>

                  {/* Status and metadata */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Only show processing/failed status badges */}
                    {call.status === 'processing' && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.icon}
                        Processing...
                      </span>
                    )}
                    {call.status === 'failed' && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.icon}
                        Failed
                      </span>
                    )}
                    {/* Show sentiment and insight count for completed calls */}
                    {call.status === 'completed' && thesisAlignment && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${alignmentConfig[thesisAlignment.sentiment].color} px-2 py-0.5 rounded-full`}>
                        {alignmentConfig[thesisAlignment.sentiment].icon}
                        {alignmentConfig[thesisAlignment.sentiment].label}
                      </span>
                    )}
                    {call.status === 'completed' && (
                      <span className="text-xs text-surface-500 dark:text-surface-400">
                        {insightCount} insights
                      </span>
                    )}
                    {call.focusAreas && call.focusAreas.length > 0 && (
                      <span className="text-xs text-surface-500 dark:text-surface-400">
                        • {call.focusAreas.slice(0, 2).join(', ')}
                        {call.focusAreas.length > 2 && ` +${call.focusAreas.length - 2}`}
                      </span>
                    )}
                  </div>

                  {call.status === 'failed' && call.errorMessage && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 truncate">
                      Error: {call.errorMessage}
                    </p>
                  )}
                </div>

                {/* Delete button */}
                {onDelete && call.status !== 'processing' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(call.id);
                    }}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-2"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
