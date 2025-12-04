import { useState, useEffect, useMemo } from 'react';
import { ThesisValidatorClient } from '../api/client.js';
import type { Engagement, EngagementFilters } from '../types/api.js';

interface UseEngagementsResult {
  engagements: Engagement[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useEngagements(
  serverUrl: string,
  authToken?: string,
  filters?: EngagementFilters
): UseEngagementsResult {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create API client instance (memoized to avoid recreation)
  const client = useMemo(
    () => new ThesisValidatorClient(serverUrl, authToken),
    [serverUrl, authToken]
  );

  const fetchEngagements = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await client.getEngagements(filters);
      setEngagements(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch engagements';
      setError(errorMessage);
      setEngagements([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount and when filters change
  useEffect(() => {
    void fetchEngagements();
  }, [serverUrl, JSON.stringify(filters)]);

  return {
    engagements,
    loading,
    error,
    refresh: fetchEngagements,
  };
}

interface UseHealthCheckResult {
  isOnline: boolean;
  checking: boolean;
}

export function useHealthCheck(serverUrl: string): UseHealthCheckResult {
  const [isOnline, setIsOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  const client = useMemo(() => new ThesisValidatorClient(serverUrl), [serverUrl]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        setChecking(true);
        await client.getHealth();
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      } finally {
        setChecking(false);
      }
    };

    // Initial check
    void checkHealth();

    // Check every 30 seconds
    const interval = setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, [serverUrl]);

  return { isOnline, checking };
}
