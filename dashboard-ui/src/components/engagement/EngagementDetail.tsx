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
import { useHypothesisTree, useUpdateHypothesis } from '../../hooks/useHypotheses';
import type { HypothesisNode } from '../../types/api';

interface EngagementDetailProps {
  engagementId: string;
}

type WorkflowStep = 'submit' | 'progress' | 'results';
type TabType = 'research' | 'hypotheses';

export function EngagementDetail({ engagementId }: EngagementDetailProps) {
  const { data: engagement, isLoading, error } = useEngagement(engagementId);
  const [activeTab, setActiveTab] = useState<TabType>('research');
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('submit');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisNode | null>(null);

  // Hypothesis tree hooks
  const { data: hypothesisTree, isLoading: isLoadingTree } = useHypothesisTree(engagementId);
  const updateHypothesis = useUpdateHypothesis(engagementId);

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
    </div>
  );
}
