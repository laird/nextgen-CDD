import { useState, useEffect } from 'react';
import { useEngagement } from './useEngagements';
import { useHypothesisTree } from './useHypotheses';
import { useEvidence, useEvidenceStats } from './useEvidence';
import { useContradictions, useContradictionStats } from './useContradictions';
import { useEngagementWebSocket } from './useEngagementWebSocket';
import { useExpertCalls } from './useExpertCalls';
import type {
    Engagement,
    HypothesisNode,
    HypothesisTree,
    Evidence,
    EvidenceStats,
    Contradiction,
    ContradictionStats
} from '../types/api';

// UI-compatible Hypothesis type with recursion
export interface UIHypothesis {
    id: string;
    title: string;
    status: 'untested' | 'supported' | 'challenged' | 'refuted';
    confidence: number;
    children?: UIHypothesis[];
}

export interface EngagementData {
    engagement: Engagement | undefined;
    hypotheses: UIHypothesis[];     // Transformed tree
    rawHypotheses: HypothesisNode[]; // Original flat list
    hypothesisTree: HypothesisTree | undefined;
    evidence: Evidence[];
    evidenceStats: EvidenceStats | undefined;
    contradictions: Contradiction[];
    contradictionStats: ContradictionStats | undefined;
    researchProgress: number | null;
    isLoading: boolean;
    error: unknown;
    isConnected: boolean; // WS status
}

/**
 * Transforms backend DAG (Nodes + Edges) into a UI Tree
 * Note: This assumes a roughly hierarchical structure. 
 * Complex graphs (multi-parent) might need duplication or a different UI visualization.
 */
function buildTreeFromDag(nodes: HypothesisNode[]): UIHypothesis[] {
    if (!nodes || nodes.length === 0) return [];

    const nodeMap = new Map<string, UIHypothesis>();

    // 1. Create UI nodes
    nodes.forEach(node => {
        nodeMap.set(node.id, {
            id: node.id,
            title: node.content,
            status: node.status,
            confidence: node.confidence,
            children: []
        });
    });

    const rootNodes: UIHypothesis[] = [];

    // 2. Build hierarchy based on parentId
    // Note: We currently rely on 'parentId' property, but we could use 'edges' if strict DAG is needed.
    // For the Sidebar Tree view, parentId is the most stable source of truth for hierarchy.
    nodes.forEach(node => {
        const uiNode = nodeMap.get(node.id)!;
        if (node.parentId && nodeMap.has(node.parentId)) {
            const parent = nodeMap.get(node.parentId)!;
            parent.children?.push(uiNode);
        } else {
            // Is a root
            rootNodes.push(uiNode);
        }
    });

    return rootNodes;
}

/**
 * Aggregated hook to fetch all context data for the engagement sidebar
 */
export function useEngagementData(engagementId: string | null, token?: string): EngagementData {
    const [researchProgress, setResearchProgress] = useState<number | null>(null);

    // 1. WebSocket Integration (Side Effect: Invalidates Queries)
    const { isConnected, lastMessage } = useEngagementWebSocket({
        engagementId: engagementId ?? undefined,
        token,
        enabled: !!engagementId
    });

    // Track research progress from WS events
    useEffect(() => {
        if (lastMessage?.type === 'event' && lastMessage.payload?.type === 'research.progress') {
            setResearchProgress(lastMessage.payload.data.progress);
        }
    }, [lastMessage]);

    // 2. Fetch Data
    const {
        data: engagementData,
        isLoading: loadingEngagement,
        error: engagementError
    } = useEngagement(engagementId);

    const {
        data: tree,
        isLoading: loadingTree,
        error: treeError
    } = useHypothesisTree(engagementId);

    const {
        data: evidenceStats,
        isLoading: loadingStats,
        error: statsError
    } = useEvidenceStats(engagementId);

    const {
        data: evidenceData,
        isLoading: loadingEvidence,
        error: evidenceError
    } = useEvidence(engagementId, { limit: 50 });

    const {
        data: contradictionsData,
        isLoading: loadingContradictions,
        error: contradictionsError
    } = useContradictions(engagementId, { status: 'unresolved' });

    const {
        data: contradictionStats,
        isLoading: loadingContradictionStats,
        error: contradictionStatsError
    } = useContradictionStats(engagementId);

    // NEW: Fetch Expert Calls
    const {
        data: expertCallsData,
        isLoading: loadingExpertCalls,
    } = useExpertCalls(engagementId, { limit: 100 });

    // 3. Transform Data
    const uiHypotheses = buildTreeFromDag(tree?.hypotheses ?? []);

    // NEW: Merge evidence and expert calls
    // Transform ExpertCall to Evidence shape for UI compatibility
    const expertEvidence: Evidence[] = (expertCallsData?.expertCalls ?? []).map(call => ({
        id: call.id,
        engagementId: call.engagementId,
        content: `Expert Interview with ${call.intervieweeName || 'Expert'} (${call.intervieweeTitle || 'N/A'})\n\n${call.status === 'completed' ? 'Transcript available.' : 'Processing...'}`,
        sourceType: 'expert',
        url: call.transcriptUrl || '',
        metadata: {
            filename: call.filename,
            callDate: call.callDate,
            duration: call.durationMinutes,
            status: call.status
        },
        confidence: 1.0,
        created_at: call.createdAt,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt,
        sentiment: 'neutral',
        relevance: 1.0
    }));

    const combinedEvidence = [...(evidenceData?.evidence ?? []), ...expertEvidence];

    return {
        engagement: engagementData,
        hypotheses: uiHypotheses,
        rawHypotheses: tree?.hypotheses ?? [],
        hypothesisTree: tree,
        evidence: combinedEvidence,
        evidenceStats: evidenceStats?.stats,
        contradictions: contradictionsData?.contradictions ?? [],
        contradictionStats: contradictionStats?.stats,
        researchProgress,
        isLoading: loadingEngagement || loadingTree || loadingStats || loadingEvidence || loadingContradictions || loadingContradictionStats || loadingExpertCalls,
        error: engagementError || treeError || statsError || evidenceError || contradictionsError || contradictionStatsError,
        isConnected
    };
}
