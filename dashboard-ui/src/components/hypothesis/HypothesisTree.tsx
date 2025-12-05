/**
 * Interactive hypothesis tree visualization using reactflow
 */
import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { HypothesisNodeMemo } from './HypothesisNode';
import type { HypothesisNode as HypothesisNodeType, HypothesisEdge, HypothesisTree as HypothesisTreeType } from '../../types/api';

interface HypothesisTreeProps {
  tree: HypothesisTreeType;
  onNodeSelect: (hypothesis: HypothesisNodeType) => void;
}

const nodeTypes: NodeTypes = {
  hypothesis: HypothesisNodeMemo,
};

const edgeColors = {
  requires: '#ef4444',
  supports: '#22c55e',
  contradicts: '#f59e0b',
  implies: '#3b82f6',
};

export function HypothesisTreeViz({ tree, onNodeSelect }: HypothesisTreeProps) {
  const handleNodeSelect = useCallback((id: string) => {
    const hypothesis = tree.hypotheses.find(h => h.id === id);
    if (hypothesis) {
      onNodeSelect(hypothesis);
    }
  }, [tree.hypotheses, onNodeSelect]);

  // Convert hypotheses to reactflow nodes
  const initialNodes: Node[] = useMemo(() => {
    // Simple layout: thesis at top, sub-theses in middle, assumptions at bottom
    const theses = tree.hypotheses.filter(h => h.type === 'thesis');
    const subTheses = tree.hypotheses.filter(h => h.type === 'sub_thesis');
    const assumptions = tree.hypotheses.filter(h => h.type === 'assumption');

    const nodes: Node[] = [];

    // Position thesis nodes
    theses.forEach((h, i) => {
      nodes.push({
        id: h.id,
        type: 'hypothesis',
        position: { x: 400 + i * 350, y: 50 },
        data: { hypothesis: h, onSelect: handleNodeSelect },
      });
    });

    // Position sub-thesis nodes
    subTheses.forEach((h, i) => {
      nodes.push({
        id: h.id,
        type: 'hypothesis',
        position: { x: 100 + i * 300, y: 250 },
        data: { hypothesis: h, onSelect: handleNodeSelect },
      });
    });

    // Position assumption nodes
    assumptions.forEach((h, i) => {
      nodes.push({
        id: h.id,
        type: 'hypothesis',
        position: { x: 50 + i * 250, y: 450 },
        data: { hypothesis: h, onSelect: handleNodeSelect },
      });
    });

    return nodes;
  }, [tree.hypotheses, handleNodeSelect]);

  // Convert edges to reactflow edges
  const initialEdges: Edge[] = useMemo(() => {
    return tree.edges.map((edge: HypothesisEdge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      label: edge.relationship,
      type: 'smoothstep',
      animated: edge.relationship === 'contradicts',
      style: {
        stroke: edgeColors[edge.relationship],
        strokeWidth: Math.max(1, edge.strength * 3),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColors[edge.relationship],
      },
      labelStyle: {
        fill: edgeColors[edge.relationship],
        fontSize: 10,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: 'white',
        fillOpacity: 0.8,
      },
    }));
  }, [tree.edges]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  if (tree.hypotheses.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">No hypotheses yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Start research to generate hypotheses
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[600px] bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        attributionPosition="bottom-left"
      >
        <Controls className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700" />
        <Background color="#94a3b8" gap={16} />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Edge Types</p>
        <div className="space-y-1">
          {Object.entries(edgeColors).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-4 h-0.5" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
