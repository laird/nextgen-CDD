/**
 * Side panel showing hypothesis details and linked evidence
 */
import { X } from 'lucide-react';
import type { HypothesisNode } from '../../types/api';

interface HypothesisDetailPanelProps {
  hypothesis: HypothesisNode;
  onClose: () => void;
  onUpdateConfidence?: (confidence: number, status: string) => void;
}

const statusOptions = [
  { value: 'untested', label: 'Untested', color: 'bg-gray-100 text-gray-800' },
  { value: 'supported', label: 'Supported', color: 'bg-green-100 text-green-800' },
  { value: 'challenged', label: 'Challenged', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'refuted', label: 'Refuted', color: 'bg-red-100 text-red-800' },
];

export function HypothesisDetailPanel({
  hypothesis,
  onClose,
  onUpdateConfidence,
}: HypothesisDetailPanelProps) {
  const confidencePercent = Math.round(hypothesis.confidence * 100);

  return (
    <div className="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 w-96 h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white">
          Hypothesis Details
        </h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Type and Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase">
            {hypothesis.type.replace('_', ' ')}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            statusOptions.find(s => s.value === hypothesis.status)?.color
          }`}>
            {hypothesis.status}
          </span>
        </div>

        {/* Content */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Statement
          </h3>
          <p className="text-gray-900 dark:text-white">
            {hypothesis.content}
          </p>
        </div>

        {/* Confidence */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Confidence
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  confidencePercent >= 70 ? 'bg-green-500' :
                  confidencePercent >= 40 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className={`font-bold ${
              confidencePercent >= 70 ? 'text-green-600' :
              confidencePercent >= 40 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {confidencePercent}%
            </span>
          </div>
        </div>

        {/* Importance & Testability */}
        <div className="grid grid-cols-2 gap-4">
          {hypothesis.importance && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Importance
              </h3>
              <span className="text-gray-900 dark:text-white capitalize">
                {hypothesis.importance}
              </span>
            </div>
          )}
          {hypothesis.testability && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Testability
              </h3>
              <span className="text-gray-900 dark:text-white capitalize">
                {hypothesis.testability}
              </span>
            </div>
          )}
        </div>

        {/* Status Update Buttons */}
        {onUpdateConfidence && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Update Status
            </h3>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => onUpdateConfidence(hypothesis.confidence, option.value)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    hypothesis.status === option.value
                      ? option.color + ' border-transparent'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Metadata
          </h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900 dark:text-white">
                {new Date(hypothesis.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Updated</dt>
              <dd className="text-gray-900 dark:text-white">
                {new Date(hypothesis.updatedAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Placeholder for linked evidence */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Linked Evidence
          </h3>
          <p className="text-sm text-gray-400 italic">
            Evidence linking will be added in Slice 2
          </p>
        </div>
      </div>
    </div>
  );
}
