/**
 * React hooks for hypothesis management
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CreateHypothesisRequest, UpdateHypothesisRequest, HypothesisTree, HypothesisNode } from '../types/api';

/**
 * Hook to fetch hypothesis tree for an engagement
 */
export function useHypothesisTree(engagementId: string | null) {
  return useQuery<HypothesisTree>({
    queryKey: ['hypothesisTree', engagementId],
    queryFn: () => apiClient.getHypothesisTree(engagementId!),
    enabled: !!engagementId,
  });
}

/**
 * Hook to fetch a single hypothesis
 */
export function useHypothesis(engagementId: string | null, hypothesisId: string | null) {
  return useQuery<{ hypothesis: HypothesisNode }>({
    queryKey: ['hypothesis', engagementId, hypothesisId],
    queryFn: () => apiClient.getHypothesis(engagementId!, hypothesisId!),
    enabled: !!engagementId && !!hypothesisId,
  });
}

/**
 * Hook to create a hypothesis
 */
export function useCreateHypothesis(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateHypothesisRequest) =>
      apiClient.createHypothesis(engagementId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hypothesisTree', engagementId] });
    },
  });
}

/**
 * Hook to update a hypothesis
 */
export function useUpdateHypothesis(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ hypothesisId, data }: { hypothesisId: string; data: UpdateHypothesisRequest }) =>
      apiClient.updateHypothesis(engagementId, hypothesisId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hypothesisTree', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['hypothesis', engagementId, variables.hypothesisId] });
    },
  });
}

/**
 * Hook to delete a hypothesis
 */
export function useDeleteHypothesis(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (hypothesisId: string) =>
      apiClient.deleteHypothesis(engagementId, hypothesisId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hypothesisTree', engagementId] });
    },
  });
}
