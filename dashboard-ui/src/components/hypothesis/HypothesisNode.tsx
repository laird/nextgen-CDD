/**
 * Custom node component for hypothesis tree visualization
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { HypothesisNode as HypothesisNodeType } from '../../types/api';

interface HypothesisNodeData {
  hypothesis: HypothesisNodeType;
  onSelect: (id: string) => void;
}

const statusColors = {
  untested: 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600',
  supported: 'bg-green-100 border-green-400 dark:bg-green-900/30 dark:border-green-600',
  challenged: 'bg-yellow-100 border-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-600',
  refuted: 'bg-red-100 border-red-400 dark:bg-red-900/30 dark:border-red-600',
};

const typeLabels = {
  thesis: 'Thesis',
  sub_thesis: 'Sub-thesis',
  assumption: 'Assumption',
};

const importanceSizes = {
  critical: 'min-w-[280px]',
  high: 'min-w-[240px]',
  medium: 'min-w-[200px]',
  low: 'min-w-[180px]',
};

function HypothesisNodeComponent({ data }: NodeProps<HypothesisNodeData>) {
  const { hypothesis, onSelect } = data;
  const colorClass = statusColors[hypothesis.status];
  const sizeClass = importanceSizes[hypothesis.importance ?? 'medium'];

  const confidencePercent = Math.round(hypothesis.confidence * 100);
  const confidenceColor =
    confidencePercent >= 70 ? 'text-green-600 dark:text-green-400' :
    confidencePercent >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
    'text-red-600 dark:text-red-400';

  return (
    <div
      className={`rounded-lg border-2 p-3 shadow-md cursor-pointer transition-all hover:shadow-lg ${colorClass} ${sizeClass}`}
      onClick={() => onSelect(hypothesis.id)}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
          {typeLabels[hypothesis.type]}
        </span>
        <span className={`text-sm font-bold ${confidenceColor}`}>
          {confidencePercent}%
        </span>
      </div>

      <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">
        {hypothesis.content}
      </p>

      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          hypothesis.status === 'supported' ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' :
          hypothesis.status === 'challenged' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
          hypothesis.status === 'refuted' ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' :
          'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
        }`}>
          {hypothesis.status}
        </span>
        {hypothesis.importance && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {hypothesis.importance}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export const HypothesisNodeMemo = memo(HypothesisNodeComponent);
