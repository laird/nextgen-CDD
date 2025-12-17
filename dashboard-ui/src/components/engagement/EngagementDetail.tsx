/**
 * Engagement detail view with research workflow
 */
import { useState } from 'react';
import { Building2, Calendar, User, Tag } from 'lucide-react';
import { useEngagement } from '../../hooks/useEngagements';
import { ThesisSubmitForm } from '../research/ThesisSubmitForm';
import { ResearchProgress } from '../research/ResearchProgress';
import { ResearchResults } from '../research/ResearchResults';
import { HypothesisTreeViz, HypothesisDetailPanel } from '../hypothesis';
import { EvidenceExplorer, EvidenceDetailPanel, ResearchQualityCharts } from '../evidence';
import { ContradictionList, ContradictionDetailPanel, ContradictionStats } from '../contradiction';
import { StressTestRunner, StressTestResults, StressTestHistory } from '../stress-test';
import { MetricsGauges, MetricsHistory } from '../metrics';
import { useHypothesisTree, useUpdateHypothesis } from '../../hooks/useHypotheses';
import { useEvidenceStats, useUpdateEvidence } from '../../hooks/useEvidence';
import {
  useContradictions,
  useContradictionStats,
  useResolveContradiction,
  useMarkContradictionCritical,
  useDeleteContradiction,
} from '../../hooks/useContradictions';
import {
  useStressTests,
  useStressTestStats,
  useRunStressTest,
  useDeleteStressTest,
} from '../../hooks/useStressTests';
import { useMetrics, useMetricHistory, useCalculateMetrics } from '../../hooks/useMetrics';
import type { HypothesisNode, Evidence, Contradiction, StressTest } from '../../types/api';

interface EngagementDetailProps {
  engagementId: string;
}

type WorkflowStep = 'submit' | 'progress' | 'results';
type TabType = 'research' | 'hypotheses' | 'evidence' | 'contradictions' | 'stress-tests' | 'metrics';

export function EngagementDetail({ engagementId }: EngagementDetailProps) {
  const { data: engagement, isLoading, error } = useEngagement(engagementId);
  const [activeTab, setActiveTab] = useState<TabType>('research');
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('submit');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisNode | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [selectedContradiction, setSelectedContradiction] = useState<Contradiction | null>(null);
  const [selectedStressTest, setSelectedStressTest] = useState<StressTest | null>(null);

  // Hypothesis tree hooks
  const { data: hypothesisTree, isLoading: isLoadingTree } = useHypothesisTree(engagementId);
  const updateHypothesis = useUpdateHypothesis(engagementId);

  // Evidence hooks
  const { data: evidenceStats, isLoading: isLoadingStats } = useEvidenceStats(engagementId);
  const updateEvidence = useUpdateEvidence(engagementId);

  // Contradiction hooks
  const { data: contradictionsData, isLoading: isLoadingContradictions } = useContradictions(engagementId);
  const { data: contradictionStatsData } = useContradictionStats(engagementId);
  const resolveContradiction = useResolveContradiction(engagementId);
  const markCritical = useMarkContradictionCritical(engagementId);
  const deleteContradiction = useDeleteContradiction(engagementId);

  // Stress test hooks
  const { data: stressTestsData, isLoading: isLoadingStressTests } = useStressTests(engagementId);
  const { data: stressTestStatsData } = useStressTestStats(engagementId);
  const runStressTest = useRunStressTest(engagementId);
  const deleteStressTest = useDeleteStressTest(engagementId);

  // Metrics hooks
  const { data: metricsData, isLoading: isLoadingMetrics } = useMetrics(engagementId);
  const { data: metricHistoryData } = useMetricHistory(engagementId);
  const calculateMetrics = useCalculateMetrics(engagementId);

  const handleResearchStart = (jobId: string) => {
    setCurrentJobId(jobId);
    setCurrentStep('progress');
  };

  const handleResearchComplete = () => {
    setCurrentStep('results');
  };

  const handleStartNew = () => {
    setCurrentJobId(null);
    setCurrentStep('submit');
  };

  const handleUpdateStatus = (_confidence: number, status: string) => {
    if (selectedHypothesis) {
      updateHypothesis.mutate({
        hypothesisId: selectedHypothesis.id,
        data: { status: status as any },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-surface-500 dark:text-surface-400">Loading engagement...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Failed to load engagement</div>
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-surface-500 dark:text-surface-400">Engagement not found</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Engagement Header */}
      <div className="border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">
              {engagement.target_company}
            </h1>
            <div className="flex flex-wrap gap-4 text-sm text-surface-600 dark:text-surface-400">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>{engagement.sector || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Created {new Date(engagement.created_at).toLocaleDateString()}</span>
              </div>
              {engagement.deal_size && (
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  <span>${engagement.deal_size}M</span>
                </div>
              )}
              {engagement.lead_partner && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{engagement.lead_partner}</span>
                </div>
              )}
            </div>
            {engagement.description && (
              <p className="mt-3 text-sm text-surface-700 dark:text-surface-300">
                {engagement.description}
              </p>
            )}
          </div>
          <div className="ml-4">
            <span
              className={`
                inline-flex items-center px-3 py-1 rounded-full text-xs font-medium
                ${
                  engagement.status === 'active'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    : engagement.status === 'completed'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : engagement.status === 'in_review'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-surface-100 text-surface-800 dark:bg-surface-800 dark:text-surface-400'
                }
              `}
            >
              {engagement.status}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
        <div className="flex gap-1 px-6">
          <button
            onClick={() => setActiveTab('research')}
            className={`
              px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'research'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
              }
            `}
          >
            Research Workflow
          </button>
          <button
            onClick={() => setActiveTab('hypotheses')}
            className={`
              px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'hypotheses'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
              }
            `}
          >
            Hypotheses
          </button>
          <button
            onClick={() => setActiveTab('evidence')}
            className={`
              px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'evidence'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
              }
            `}
          >
            Evidence
          </button>
          <button
            onClick={() => setActiveTab('contradictions')}
            className={`
              px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'contradictions'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
              }
            `}
          >
            Contradictions
          </button>
          <button
            onClick={() => setActiveTab('stress-tests')}
            className={`
              px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'stress-tests'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
              }
            `}
          >
            Stress Tests
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`
              px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'metrics'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
              }
            `}
          >
            Metrics
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'research' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
          {/* Step Indicator */}
          <div className="mb-6 flex items-center justify-center gap-4">
            <div
              className={`flex items-center gap-2 ${
                currentStep === 'submit' ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400'
              }`}
            >
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm
                  ${
                    currentStep === 'submit'
                      ? 'bg-primary-100 dark:bg-primary-900/30'
                      : 'bg-surface-100 dark:bg-surface-800'
                  }
                `}
              >
                1
              </div>
              <span className="text-sm font-medium">Submit Thesis</span>
            </div>

            <div className="h-px w-12 bg-surface-300 dark:bg-surface-600" />

            <div
              className={`flex items-center gap-2 ${
                currentStep === 'progress' ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400'
              }`}
            >
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm
                  ${
                    currentStep === 'progress'
                      ? 'bg-primary-100 dark:bg-primary-900/30'
                      : 'bg-surface-100 dark:bg-surface-800'
                  }
                `}
              >
                2
              </div>
              <span className="text-sm font-medium">Research</span>
            </div>

            <div className="h-px w-12 bg-surface-300 dark:bg-surface-600" />

            <div
              className={`flex items-center gap-2 ${
                currentStep === 'results' ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400'
              }`}
            >
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm
                  ${
                    currentStep === 'results'
                      ? 'bg-primary-100 dark:bg-primary-900/30'
                      : 'bg-surface-100 dark:bg-surface-800'
                  }
                `}
              >
                3
              </div>
              <span className="text-sm font-medium">Results</span>
            </div>
          </div>

          {/* Step Content */}
          {currentStep === 'submit' && (
            <div className="bg-white dark:bg-surface-900 rounded-lg border border-surface-200 dark:border-surface-700 p-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">
                Submit Investment Thesis
              </h2>
              <ThesisSubmitForm
                engagementId={engagementId}
                initialThesis={engagement.investment_thesis?.summary}
                onSubmitSuccess={handleResearchStart}
              />
            </div>
          )}

          {currentStep === 'progress' && currentJobId && (
            <div>
              <ResearchProgress
                engagementId={engagementId}
                jobId={currentJobId}
                onComplete={handleResearchComplete}
              />
            </div>
          )}

          {currentStep === 'results' && currentJobId && engagement.latest_research && (
            <div>
              <ResearchResults results={engagement.latest_research.results} />
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleStartNew}
                  className="px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors"
                >
                  Start New Research
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Hypotheses Tab */}
      {activeTab === 'hypotheses' && (
        <div className="flex-1 flex overflow-hidden">
          {isLoadingTree ? (
            <div className="flex items-center justify-center flex-1">
              <div className="text-surface-500 dark:text-surface-400">Loading hypothesis tree...</div>
            </div>
          ) : hypothesisTree ? (
            <>
              <div className="flex-1 overflow-hidden">
                <HypothesisTreeViz
                  tree={hypothesisTree}
                  onNodeSelect={setSelectedHypothesis}
                />
              </div>
              {selectedHypothesis && (
                <HypothesisDetailPanel
                  hypothesis={selectedHypothesis}
                  onClose={() => setSelectedHypothesis(null)}
                  onUpdateConfidence={handleUpdateStatus}
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center flex-1">
              <div className="text-center max-w-md">
                <p className="text-surface-600 dark:text-surface-400">
                  No hypotheses yet. Submit a thesis and run research to generate hypotheses.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence Tab */}
      {activeTab === 'evidence' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left side: Evidence Explorer */}
          <div className="w-1/2 border-r border-surface-200 dark:border-surface-700">
            <EvidenceExplorer
              engagementId={engagementId}
              onSelectEvidence={setSelectedEvidence}
              selectedEvidenceId={selectedEvidence?.id}
            />
          </div>

          {/* Right side: Detail Panel or Charts */}
          <div className="w-1/2 flex flex-col">
            {selectedEvidence ? (
              <EvidenceDetailPanel
                evidence={selectedEvidence}
                onClose={() => setSelectedEvidence(null)}
                onUpdateSentiment={(sentiment) => {
                  updateEvidence.mutate({
                    evidenceId: selectedEvidence.id,
                    data: { sentiment },
                  });
                }}
                onUpdateCredibility={(credibility) => {
                  updateEvidence.mutate({
                    evidenceId: selectedEvidence.id,
                    data: { credibility },
                  });
                }}
              />
            ) : isLoadingStats ? (
              <div className="flex items-center justify-center flex-1">
                <div className="text-surface-500 dark:text-surface-400">Loading statistics...</div>
              </div>
            ) : evidenceStats?.stats ? (
              <div className="p-6 overflow-y-auto">
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">
                  Research Quality Overview
                </h2>
                <ResearchQualityCharts stats={evidenceStats.stats} />
              </div>
            ) : (
              <div className="flex items-center justify-center flex-1">
                <div className="text-center max-w-md">
                  <p className="text-surface-600 dark:text-surface-400">
                    No evidence collected yet. Run research to gather evidence.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contradictions Tab */}
      {activeTab === 'contradictions' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Stats at top */}
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-surface-200 dark:border-surface-700">
              {contradictionStatsData?.stats && (
                <ContradictionStats stats={contradictionStatsData.stats} />
              )}
            </div>
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Contradiction List */}
              <div className="w-1/2 border-r border-surface-200 dark:border-surface-700">
                <ContradictionList
                  contradictions={contradictionsData?.contradictions ?? []}
                  selectedId={selectedContradiction?.id ?? null}
                  onSelect={(id) => {
                    const c = contradictionsData?.contradictions.find((x) => x.id === id);
                    if (c) setSelectedContradiction(c);
                  }}
                  isLoading={isLoadingContradictions}
                />
              </div>
              {/* Right: Detail Panel */}
              <div className="w-1/2">
                {selectedContradiction ? (
                  <ContradictionDetailPanel
                    contradiction={selectedContradiction}
                    onResolve={(status, notes) => {
                      resolveContradiction.mutate(
                        { contradictionId: selectedContradiction.id, data: { status, resolutionNotes: notes } },
                        { onSuccess: () => setSelectedContradiction(null) }
                      );
                    }}
                    onMarkCritical={() => {
                      markCritical.mutate(selectedContradiction.id);
                    }}
                    onDelete={() => {
                      deleteContradiction.mutate(selectedContradiction.id, {
                        onSuccess: () => setSelectedContradiction(null),
                      });
                    }}
                    isResolving={resolveContradiction.isPending}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-surface-500 dark:text-surface-400">
                    <p>Select a contradiction to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stress Tests Tab */}
      {activeTab === 'stress-tests' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Runner */}
              <div className="lg:col-span-1">
                <StressTestRunner
                  onRun={(intensity) => runStressTest.mutate(intensity)}
                  isRunning={runStressTest.isPending}
                  hasActiveTest={stressTestsData?.stressTests.some((t) => t.status === 'running')}
                />
              </div>
              {/* Results */}
              <div className="lg:col-span-2">
                {selectedStressTest ? (
                  <StressTestResults stressTest={selectedStressTest} />
                ) : stressTestsData?.stressTests[0] ? (
                  <StressTestResults stressTest={stressTestsData.stressTests[0]} />
                ) : (
                  <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-8">
                    <div className="text-center text-surface-500 dark:text-surface-400">
                      <p>No stress test results yet</p>
                      <p className="text-sm mt-1">Run a stress test to see results</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* History */}
            <StressTestHistory
              stressTests={stressTestsData?.stressTests ?? []}
              stats={stressTestStatsData?.stats}
              onSelect={setSelectedStressTest}
              onDelete={(id) => deleteStressTest.mutate(id)}
              selectedId={selectedStressTest?.id}
              isLoading={isLoadingStressTests}
            />
          </div>
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <MetricsGauges
              metrics={metricsData?.metrics ?? null}
              onRecalculate={() => calculateMetrics.mutate()}
              isRecalculating={calculateMetrics.isPending}
              isLoading={isLoadingMetrics}
            />
            <MetricsHistory
              history={metricHistoryData?.history ?? []}
              isLoading={isLoadingMetrics}
            />
          </div>
        </div>
      )}
    </div>
  );
}
