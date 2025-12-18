import { useState } from 'react';
import {
  X,
  ChevronRight,
  FileText,
  Link,
  Calendar,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Share2,
  BookOpen,
  GitBranch,
  Target,
  Shield,
  Briefcase,
  AlertOctagon,
} from 'lucide-react';
import { useEngagementData, type UIHypothesis } from '../../hooks/useEngagementData';
import type { Evidence, Contradiction } from '../../types/api';

type TabId = 'overview' | 'hypotheses' | 'evidence' | 'contradictions' | 'sources';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'hypotheses', label: 'Hypotheses', icon: GitBranch },
  { id: 'evidence', label: 'Evidence', icon: FileText },
  { id: 'contradictions', label: 'Contradictions', icon: AlertOctagon },
  { id: 'sources', label: 'Sources', icon: Link },
];

const statusConfig = {
  untested: { icon: HelpCircle, color: 'text-surface-400', bg: 'bg-surface-100 dark:bg-surface-700' },
  supported: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  challenged: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  refuted: { icon: X, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
};

const sentimentConfig = {
  supporting: { icon: TrendingUp, color: 'text-green-500', label: 'Supporting' },
  contradicting: { icon: TrendingDown, color: 'text-red-500', label: 'Contradicting' },
  neutral: { icon: Minus, color: 'text-surface-400', label: 'Neutral' },
};

interface ContextPanelProps {
  engagementId?: string;
}

export function ContextPanel({ engagementId }: ContextPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [expandedHypotheses, setExpandedHypotheses] = useState<Set<string>>(new Set());
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string | null>(null);

  // Data fetching via aggregated hook
  const {
    engagement,
    hypotheses,
    hypothesisTree,
    evidence,
    contradictions,
    researchProgress,
    isLoading
  } = useEngagementData(engagementId || null);

  if (!engagementId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="bg-surface-100 dark:bg-surface-800 p-4 rounded-full mb-4">
          <Briefcase className="h-8 w-8 text-surface-400" />
        </div>
        <h3 className="text-lg font-medium text-surface-900 dark:text-white mb-2">
          No Engagement Selected
        </h3>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          Select an engagement to view detailed context and insights.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-surface-500">Loading context...</div>
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-surface-500">Engagement not found</div>
      </div>
    );
  }

  const toggleHypothesis = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedHypotheses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleHypothesisClick = (id: string) => {
    setSelectedHypothesisId(selectedHypothesisId === id ? null : id);
  };

  const renderHypothesisNode = (node: UIHypothesis, depth = 0) => {
    const StatusIcon = statusConfig[node.status || 'untested'].icon;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedHypotheses.has(node.id);
    const isSelected = selectedHypothesisId === node.id;

    return (
      <div key={node.id} className={depth > 0 ? 'ml-4 border-l border-surface-200 dark:border-surface-700 pl-3' : ''}>
        <div
          onClick={() => handleHypothesisClick(node.id)}
          className={`
            flex w-full items-start gap-2 rounded-lg p-2 transition-colors text-left cursor-pointer
            ${isSelected
              ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-200 dark:ring-primary-700'
              : 'hover:bg-surface-100 dark:hover:bg-surface-700/50'}
          `}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleHypothesis(node.id, e)}
              className="p-0.5 hover:bg-surface-200 dark:hover:bg-surface-600 rounded"
            >
              <ChevronRight
                className={`h-4 w-4 text-surface-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <div className="w-5" />
          )}

          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${statusConfig[node.status || 'untested'].bg}`}>
            <StatusIcon className={`h-3 w-3 ${statusConfig[node.status || 'untested'].color}`} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm text-surface-700 dark:text-surface-200 line-clamp-2">
              {node.title}
            </p>
            {node.confidence > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${node.confidence >= 0.7
                      ? 'bg-green-500'
                      : node.confidence >= 0.4
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                      }`}
                    style={{ width: `${node.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs text-surface-500">{Math.round(node.confidence * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children!.map((child) => renderHypothesisNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Filter evidence based on selected hypothesis
  const filteredEvidence = selectedHypothesisId
    ? evidence.filter(e => e.linkedHypotheses?.some(link => link.hypothesisId === selectedHypothesisId))
    : evidence;

  // Calculate progress
  // Prefer real progress from hook, fallback to hypothesis count ratio, default to 0
  const progressValue = researchProgress !== null
    ? researchProgress
    : (hypothesisTree && hypothesisTree.count > 0
      ? ((hypothesisTree.hypotheses.filter(h => h.status !== 'untested').length / hypothesisTree.count) * 100)
      : 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-surface-200 dark:border-surface-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-surface-900 dark:text-white truncate" title={engagement.name}>
            {engagement.name}
          </h2>
          <div className="flex gap-1">
            <button className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors">
              <Share2 className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors">
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-surface-100 dark:bg-surface-700/50 rounded-lg p-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium
                transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'bg-white dark:bg-surface-800 text-surface-900 dark:text-white shadow-sm'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                }
              `}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-100 dark:bg-surface-700/50 p-3">
                <div className="flex items-center gap-2 text-surface-500 mb-1">
                  <Target className="h-4 w-4" />
                  <span className="text-xs">Deal Type</span>
                </div>
                <p className="text-sm font-medium text-surface-900 dark:text-white capitalize">
                  {engagement.deal_type ? engagement.deal_type.replace('_', ' ') : 'N/A'}
                </p>
              </div>
              <div className="rounded-lg bg-surface-100 dark:bg-surface-700/50 p-3">
                <div className="flex items-center gap-2 text-surface-500 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">Created</span>
                </div>
                <p className="text-sm font-medium text-surface-900 dark:text-white">
                  {new Date(engagement.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Key Value Drivers */}
            {engagement.investment_thesis && engagement.investment_thesis.key_value_drivers.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                  Key Value Drivers
                </h3>
                <div className="space-y-2">
                  {engagement.investment_thesis.key_value_drivers.map((driver: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span>{driver}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Research Progress */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                Research Progress
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600 dark:text-surface-400">
                    {progressValue >= 100 ? 'Completed' : 'Processing'}
                  </span>
                  <span className="font-medium text-surface-900 dark:text-white">
                    {Math.round(progressValue)}%
                  </span>
                </div>
                <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressValue >= 100 ? 'bg-green-500' : 'bg-primary-500'
                      }`}
                    style={{
                      width: `${progressValue}%`
                    }}
                  />
                </div>
              </div>
            </div>
            {/* Key Risks */}
            {engagement.investment_thesis && engagement.investment_thesis.key_risks.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                  Key Risks
                </h3>
                <div className="space-y-2">
                  {engagement.investment_thesis.key_risks.map((risk: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
                      <Shield className="h-4 w-4 text-yellow-500 shrink-0" />
                      <span>{risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hypotheses' && (
          <div className="space-y-1">
            <div className="mb-2 text-xs text-surface-500">
              {selectedHypothesisId ? 'Select a hypothesis to filter evidence' : 'Click a hypothesis to filter evidence'}
              {selectedHypothesisId && (
                <button
                  onClick={() => setSelectedHypothesisId(null)}
                  className="ml-2 text-primary-600 hover:text-primary-700"
                >
                  Clear selection
                </button>
              )}
            </div>
            {hypotheses.length > 0 ? (
              hypotheses.map((h) => renderHypothesisNode(h))
            ) : (
              <div className="text-center text-sm text-surface-500 py-4">No hypotheses generated yet</div>
            )}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="space-y-3">
            {selectedHypothesisId && (
              <div className="flex items-center justify-between p-2 bg-primary-50 dark:bg-primary-900/20 rounded mb-2 border border-primary-100 dark:border-primary-800">
                <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                  Filtered by selection
                </span>
                <button
                  onClick={() => setSelectedHypothesisId(null)}
                  className="text-xs text-surface-500 hover:text-surface-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {filteredEvidence.length > 0 ? (
              filteredEvidence.map((item) => {
                const SentimentIcon = sentimentConfig[item.sentiment || 'neutral'].icon;
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-surface-200 dark:border-surface-700 p-3 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-surface-700 dark:text-surface-200 line-clamp-2">
                        {item.content.substring(0, 80)}...
                      </p>
                      <SentimentIcon className={`h-4 w-4 shrink-0 ${sentimentConfig[item.sentiment || 'neutral'].color}`} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-surface-500">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {item.sourceType}
                      </span>
                      <span>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-surface-500">Credibility:</span>
                      <div className="flex-1 h-1 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full"
                          style={{ width: `${(item.credibility || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-surface-600 dark:text-surface-400">{Math.round((item.credibility || 0) * 100)}%</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-sm text-surface-500 py-4">No evidence found {selectedHypothesisId ? 'for this hypothesis' : ''}</div>
            )}
          </div>
        )}

        {activeTab === 'contradictions' && (
          <div className="space-y-3">
            {contradictions.length > 0 ? (
              contradictions.map(contradiction => (
                <div key={contradiction.id} className="rounded-lg border border-surface-200 dark:border-surface-700 p-3 bg-surface-50 dark:bg-surface-800/50">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 ${contradiction.severity === 'high' ? 'text-red-500' :
                        contradiction.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                      }`} />
                    <div>
                      <p className="text-sm font-medium text-surface-900 dark:text-white">
                        {contradiction.description}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block ${contradiction.status === 'unresolved' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                        {contradiction.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-sm text-surface-500 py-4">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-50" />
                No active contradictions found
              </div>
            )}
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="space-y-2">
            {[
              { name: 'Research Reports', type: 'External', count: evidence.filter(e => e.sourceType === 'document').length || 0 },
              { name: 'Web News', type: 'News', count: evidence.filter(e => e.sourceType === 'web').length || 0 },
              { name: 'Expert Interviews', type: 'Primary Research', count: evidence.filter(e => e.sourceType === 'expert').length || 0 },
            ].map((source, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-100 dark:bg-surface-700/50 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <Link className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-700 dark:text-surface-200">
                      {source.name}
                    </p>
                    <p className="text-xs text-surface-500">{source.type}</p>
                  </div>
                </div>
                <span className="flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary-100 dark:bg-primary-900/30 px-1.5 text-xs font-medium text-primary-600 dark:text-primary-400">
                  {source.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
