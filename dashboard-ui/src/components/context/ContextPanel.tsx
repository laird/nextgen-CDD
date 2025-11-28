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
} from 'lucide-react';

type TabId = 'overview' | 'hypotheses' | 'evidence' | 'sources';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

interface Hypothesis {
  id: string;
  title: string;
  status: 'untested' | 'supported' | 'challenged' | 'refuted';
  confidence: number;
  children?: Hypothesis[];
}

interface Evidence {
  id: string;
  title: string;
  source: string;
  sentiment: 'supporting' | 'contradicting' | 'neutral';
  credibility: number;
  date: string;
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'hypotheses', label: 'Hypotheses', icon: GitBranch },
  { id: 'evidence', label: 'Evidence', icon: FileText },
  { id: 'sources', label: 'Sources', icon: Link },
];

const mockHypotheses: Hypothesis[] = [
  {
    id: '1',
    title: 'Market will grow at 15% CAGR',
    status: 'supported',
    confidence: 78,
    children: [
      { id: '1.1', title: 'TAM expansion driven by digital transformation', status: 'supported', confidence: 85 },
      { id: '1.2', title: 'New market entrants will not erode margins', status: 'challenged', confidence: 45 },
    ],
  },
  {
    id: '2',
    title: 'Customer retention will remain above 90%',
    status: 'untested',
    confidence: 0,
  },
  {
    id: '3',
    title: 'Technology moat is defensible',
    status: 'challenged',
    confidence: 52,
  },
];

const mockEvidence: Evidence[] = [
  {
    id: '1',
    title: 'Market size report indicates strong growth trajectory',
    source: 'Gartner Research',
    sentiment: 'supporting',
    credibility: 92,
    date: '2024-03-15',
  },
  {
    id: '2',
    title: 'New competitor raised $50M Series B',
    source: 'TechCrunch',
    sentiment: 'contradicting',
    credibility: 75,
    date: '2024-03-10',
  },
  {
    id: '3',
    title: 'Patent analysis shows strong IP portfolio',
    source: 'Internal Analysis',
    sentiment: 'supporting',
    credibility: 88,
    date: '2024-03-08',
  },
  {
    id: '4',
    title: 'Customer survey data pending analysis',
    source: 'Company Data',
    sentiment: 'neutral',
    credibility: 80,
    date: '2024-03-05',
  },
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

export function ContextPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [expandedHypotheses, setExpandedHypotheses] = useState<Set<string>>(new Set(['1']));

  const toggleHypothesis = (id: string) => {
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

  const renderHypothesis = (hypothesis: Hypothesis, depth = 0) => {
    const StatusIcon = statusConfig[hypothesis.status].icon;
    const hasChildren = hypothesis.children && hypothesis.children.length > 0;
    const isExpanded = expandedHypotheses.has(hypothesis.id);

    return (
      <div key={hypothesis.id} className={depth > 0 ? 'ml-4 border-l border-surface-200 dark:border-surface-700 pl-3' : ''}>
        <button
          onClick={() => hasChildren && toggleHypothesis(hypothesis.id)}
          className="flex w-full items-start gap-2 rounded-lg p-2 hover:bg-surface-100 dark:hover:bg-surface-700/50 transition-colors text-left"
        >
          {hasChildren && (
            <ChevronRight
              className={`h-4 w-4 mt-0.5 text-surface-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          )}
          {!hasChildren && <div className="w-4" />}

          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${statusConfig[hypothesis.status].bg}`}>
            <StatusIcon className={`h-3 w-3 ${statusConfig[hypothesis.status].color}`} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm text-surface-700 dark:text-surface-200 line-clamp-2">
              {hypothesis.title}
            </p>
            {hypothesis.confidence > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      hypothesis.confidence >= 70
                        ? 'bg-green-500'
                        : hypothesis.confidence >= 40
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${hypothesis.confidence}%` }}
                  />
                </div>
                <span className="text-xs text-surface-500">{hypothesis.confidence}%</span>
              </div>
            )}
          </div>
        </button>

        {hasChildren && isExpanded && (
          <div className="mt-1">
            {hypothesis.children!.map((child) => renderHypothesis(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-surface-200 dark:border-surface-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-surface-900 dark:text-white">TechCorp Acquisition</h2>
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
        <div className="flex gap-1 bg-surface-100 dark:bg-surface-700/50 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium
                transition-colors
                ${
                  activeTab === tab.id
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
                <p className="text-sm font-medium text-surface-900 dark:text-white">Platform</p>
              </div>
              <div className="rounded-lg bg-surface-100 dark:bg-surface-700/50 p-3">
                <div className="flex items-center gap-2 text-surface-500 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">Created</span>
                </div>
                <p className="text-sm font-medium text-surface-900 dark:text-white">Mar 1, 2024</p>
              </div>
            </div>

            {/* Key Value Drivers */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                Key Value Drivers
              </h3>
              <div className="space-y-2">
                {['Recurring revenue model', 'Strong customer retention', 'Scalable technology platform'].map((driver, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span>{driver}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Risks */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                Key Risks
              </h3>
              <div className="space-y-2">
                {['Market concentration', 'Key person dependency', 'Regulatory changes'].map((risk, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300">
                    <Shield className="h-4 w-4 text-yellow-500 shrink-0" />
                    <span>{risk}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Research Progress */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                Research Progress
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600 dark:text-surface-400">Hypotheses tested</span>
                  <span className="font-medium text-surface-900 dark:text-white">3/8</span>
                </div>
                <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                  <div className="h-full w-[37.5%] bg-primary-500 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'hypotheses' && (
          <div className="space-y-1">
            {mockHypotheses.map((h) => renderHypothesis(h))}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="space-y-3">
            {mockEvidence.map((evidence) => {
              const SentimentIcon = sentimentConfig[evidence.sentiment].icon;
              return (
                <div
                  key={evidence.id}
                  className="rounded-lg border border-surface-200 dark:border-surface-700 p-3 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-surface-700 dark:text-surface-200 line-clamp-2">
                      {evidence.title}
                    </p>
                    <SentimentIcon className={`h-4 w-4 shrink-0 ${sentimentConfig[evidence.sentiment].color}`} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-surface-500">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {evidence.source}
                    </span>
                    <span>{evidence.date}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-surface-500">Credibility:</span>
                    <div className="flex-1 h-1 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${evidence.credibility}%` }}
                      />
                    </div>
                    <span className="text-xs text-surface-600 dark:text-surface-400">{evidence.credibility}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="space-y-2">
            {[
              { name: 'Gartner Research', type: 'Research Report', count: 5 },
              { name: 'TechCrunch', type: 'News', count: 3 },
              { name: 'Company Filings', type: 'Official Docs', count: 8 },
              { name: 'Expert Interviews', type: 'Primary Research', count: 2 },
              { name: 'Patent Database', type: 'IP Analysis', count: 12 },
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
