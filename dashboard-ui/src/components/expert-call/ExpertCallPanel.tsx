/**
 * Main container component for expert call functionality
 */
import { useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
import { useExpertCalls, useExpertCall, useProcessTranscript, useProcessTranscriptBatch, useDeleteExpertCall } from '../../hooks/useExpertCalls';
import { useEngagement } from '../../hooks/useEngagements';
import { TranscriptUpload } from './TranscriptUpload';
import { ExpertCallResults } from './ExpertCallResults';
import { ExpertCallHistory } from './ExpertCallHistory';

interface ExpertCallPanelProps {
  engagementId: string;
  onHypothesisClick?: (hypothesisId: string) => void;
}

export function ExpertCallPanel({ engagementId, onHypothesisClick }: ExpertCallPanelProps) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<{
    created: number;
    duplicates: number;
    total: number;
  } | null>(null);

  // Queries
  const { data: callsData, isLoading: isLoadingCalls } = useExpertCalls(engagementId);
  const { data: engagement } = useEngagement(engagementId);
  const { data: selectedCallData, isLoading: isLoadingCall } = useExpertCall(
    engagementId,
    selectedCallId
  );

  // Mutations
  const processTranscript = useProcessTranscript(engagementId);
  const processTranscriptBatch = useProcessTranscriptBatch(engagementId);
  const deleteCall = useDeleteExpertCall(engagementId);

  const handleSubmitTranscript = (data: {
    transcript: string;
    filename?: string;
    callDate?: string;
    speakerLabels?: Record<string, string>;
    focusAreas?: string[];
  }) => {
    setDuplicateNotice(null);
    setBatchResult(null);
    processTranscript.mutate(data, {
      onSuccess: (response) => {
        if (response.duplicate) {
          // Show notice and navigate to existing call
          setDuplicateNotice('This transcript has already been processed. Showing existing results.');
          setSelectedCallId(response.expertCall.id);
        }
      },
    });
    // Stay on the list view so user can see processing status in history
  };

  const handleBatchSubmit = (data: {
    transcripts: Array<{
      transcript: string;
      filename?: string;
    }>;
    focusAreas?: string[];
  }) => {
    setDuplicateNotice(null);
    setBatchResult(null);
    processTranscriptBatch.mutate(data, {
      onSuccess: (response) => {
        const totalDuplicates = response.summary.duplicatesInBatch + response.summary.duplicatesExisting;
        setBatchResult({
          created: response.summary.created,
          duplicates: totalDuplicates,
          total: response.summary.total,
        });
      },
    });
  };

  const handleDeleteCall = (callId: string) => {
    if (confirm('Are you sure you want to delete this expert call?')) {
      deleteCall.mutate(callId, {
        onSuccess: () => {
          if (selectedCallId === callId) {
            setSelectedCallId(null);
          }
        },
      });
    }
  };

  const handleBackToList = () => {
    setSelectedCallId(null);
    setDuplicateNotice(null);
  };

  // Show results view when a call is selected
  if (selectedCallId && selectedCallData?.expertCall) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleBackToList}
          className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to call history
        </button>

        {/* Duplicate notice */}
        {duplicateNotice && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{duplicateNotice}</p>
            <button
              onClick={() => setDuplicateNotice(null)}
              className="ml-auto text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        <ExpertCallResults
          expertCall={selectedCallData.expertCall}
          onHypothesisClick={onHypothesisClick}
        />
      </div>
    );
  }

  // Show loading state for selected call
  if (selectedCallId && isLoadingCall) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleBackToList}
          className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to call history
        </button>
        <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-8">
          <div className="flex flex-col items-center justify-center">
            <div className="h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-surface-600 dark:text-surface-400">Loading call details...</p>
          </div>
        </div>
      </div>
    );
  }

  // Default view: Upload form + History
  return (
    <div className="space-y-4">
      {/* Batch result notification */}
      {batchResult && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">
            Batch upload complete: {batchResult.created} of {batchResult.total} transcripts queued for processing
            {batchResult.duplicates > 0 && ` (${batchResult.duplicates} duplicate${batchResult.duplicates !== 1 ? 's' : ''} skipped)`}
          </p>
          <button
            onClick={() => setBatchResult(null)}
            className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Suggested Questions */}
      {engagement?.investment_thesis?.key_questions && engagement.investment_thesis.key_questions.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Suggested Questions</h3>
          </div>
          <ul className="list-disc list-inside space-y-1">
            {engagement.investment_thesis.key_questions.map((q, i) => (
              <li key={i} className="text-sm text-blue-800 dark:text-blue-200">{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Upload Form */}
        <div>
          <TranscriptUpload
            onSubmit={handleSubmitTranscript}
            onBatchSubmit={handleBatchSubmit}
            isProcessing={processTranscript.isPending || processTranscriptBatch.isPending}
          />
        </div>

        {/* Right Column: History */}
        <div>
          <ExpertCallHistory
            expertCalls={callsData?.expertCalls ?? []}
            isLoading={isLoadingCalls}
            onSelect={setSelectedCallId}
            onDelete={handleDeleteCall}
            selectedCallId={selectedCallId}
          />
        </div>
      </div>
    </div>
  );
}
