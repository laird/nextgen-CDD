import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import WebSocket from 'ws';
import { ThesisValidatorClient } from '../../api/client.js';
import type { Engagement, ResearchJob, ProgressEvent, ResearchConfig } from '../../types/api.js';
import { useInputContext } from '../../context/InputContext.js';



interface EngagementResearchProps {
  engagement: Engagement;
  serverUrl: string;
  authToken?: string | undefined;
  onBack: () => void;
  onComplete: () => void;
}

type ResearchView = 'input_thesis' | 'running' | 'results';

export function EngagementResearch({
  engagement,
  serverUrl,
  authToken,
  onBack,
  onComplete,
}: EngagementResearchProps): React.ReactElement {
  const [view, setView] = useState<ResearchView>('input_thesis');
  const [thesis, setThesis] = useState('');
  const [isEditingThesis, setIsEditingThesis] = useState(true);
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { setInputActive } = useInputContext();

  const client = useMemo(
    () => new ThesisValidatorClient(serverUrl, authToken),
    [serverUrl, authToken]
  );

  // Sync isEditingThesis with global input state to disable hotkeys
  useEffect(() => {
    setInputActive(isEditingThesis);
    return () => setInputActive(false);
  }, [isEditingThesis, setInputActive]);

  // Handle WebSocket connection for progress tracking
  useEffect(() => {
    if (view === 'running' && job && !ws) {
      const wsUrl = client.getResearchProgressWsUrl(job.id, authToken);
      const websocket = new WebSocket(wsUrl);

      websocket.on('open', () => {
        // WebSocket connected
      });

      websocket.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'progress') {
            const event = message.payload as ProgressEvent;
            setProgressEvents((prev) => [...prev, event]);

            // Check if completed or failed
            if (event.type === 'completed') {
              client
                .getResearchJob(engagement.id, job.id)
                .then((updatedJob) => {
                  setJob(updatedJob);
                  setView('results');
                  websocket.close();
                })
                .catch((err) => setError(err.message));
            } else if (event.type === 'error') {
              setError(String(event.data.message ?? 'Research job failed'));
              setView('results');
              websocket.close();
            }
          }
        } catch (_err) {
          // Failed to parse WebSocket message - ignore
        }
      });

      websocket.on('error', (_err: Error) => {
        setError('WebSocket connection error');
      });

      websocket.on('close', () => {
        setWs(null);
      });

      setWs(websocket);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [view, job, ws, client, engagement.id, authToken]);

  // Handle keyboard input
  useInput((input, key) => {
    if (isEditingThesis) return; // Let TextInput handle input

    if (view === 'input_thesis') {
      if (input === 's' || input === 'S') {
        setIsEditingThesis(true);
      } else if (input === 'r' || input === 'R') {
        if (thesis.trim().length >= 10) {
          handleStartResearch();
        }
      } else if (key.escape || input === 'b' || input === 'B') {
        onBack();
      }
    } else if (view === 'results') {
      if (input === 'b' || input === 'B' || key.escape) {
        onComplete();
      }
    }
  });

  const handleStartResearch = async () => {
    if (!thesis.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const config: ResearchConfig = {
        maxHypotheses: 3,
        enableDeepDive: false,
        searchDepth: 'quick',
        confidenceThreshold: 70,
      };

      const result = await client.startResearch(engagement.id, thesis, config);
      const jobStatus = await client.getResearchJob(engagement.id, result.job_id);
      setJob(jobStatus);
      setView('running');
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  // Error state (except in results view)
  if (error && view !== 'results') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="red">Error: {error}</Text>
        <Box marginTop={1}>
          <Text color="gray">Press ESC or B to go back</Text>
        </Box>
      </Box>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Box paddingY={1}>
        <Text color="yellow">Starting research...</Text>
      </Box>
    );
  }

  // Thesis input view
  if (view === 'input_thesis') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Start Research: {engagement.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color="gray">{'─'.repeat(60)}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color="gray">Target: </Text>
            <Text color="blue">{engagement.target.name}</Text>
            <Text color="gray"> ({engagement.target.sector})</Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color={isEditingThesis ? 'cyan' : 'gray'}>
              Investment Thesis (min 10 characters):
            </Text>
          </Box>
          {isEditingThesis ? (
            <Box>
              <Text color="green">&gt; </Text>
              <TextInput
                value={thesis}
                onChange={setThesis}
                onSubmit={() => setIsEditingThesis(false)}
                placeholder="Enter your investment thesis..."
              />
            </Box>
          ) : (
            <Text color={thesis.length >= 10 ? 'green' : 'yellow'}>
              {thesis || '(Press S to enter thesis)'}
            </Text>
          )}
        </Box>

        {thesis.length > 0 && thesis.length < 10 && !isEditingThesis && (
          <Box marginTop={1}>
            <Text color="red">Thesis must be at least 10 characters</Text>
          </Box>
        )}

        {thesis.length >= 10 && !isEditingThesis && (
          <Box marginTop={1}>
            <Text color="cyan">Press R to start research</Text>
          </Box>
        )}

        <Box marginTop={2} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text color="gray">
            [S] Edit Thesis [R] Run Research [B/Esc] Back
          </Text>
        </Box>
      </Box>
    );
  }

  // Running view
  if (view === 'running') {
    const latestEvent = progressEvents[progressEvents.length - 1];

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Research in Progress: {engagement.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color="gray">Job ID: {job?.id}</Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold>
            Status: <Text color="yellow">{job?.status}</Text>
          </Text>
        </Box>

        {latestEvent && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="green">
              Latest Update:
            </Text>
            <Text>Type: {latestEvent.type}</Text>
            <Text>Message: {String(latestEvent.data.message ?? 'Processing...')}</Text>
            {typeof latestEvent.data.progress === 'number' && (
              <Text>Progress: {latestEvent.data.progress}%</Text>
            )}
          </Box>
        )}

        <Box marginTop={1}>
          <Text bold color="cyan">
            Progress Events:
          </Text>
        </Box>
        <Box flexDirection="column">
          {progressEvents.slice(-8).reverse().map((event, idx) => (
            <Text key={idx} color="gray">
              [{new Date(event.timestamp).toLocaleTimeString()}] {event.type}:{' '}
              {String(event.data.message ?? '')}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  // Results view
  if (view === 'results') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Research Results: {engagement.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color="gray">Job ID: {job?.id}</Text>
        </Box>

        {error ? (
          <Box flexDirection="column">
            <Text bold color="red">
              Error:
            </Text>
            <Text color="red">{error}</Text>
          </Box>
        ) : job?.results ? (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold>
                Verdict:{' '}
                <Text
                  color={
                    job.results.verdict === 'proceed'
                      ? 'green'
                      : job.results.verdict === 'review'
                      ? 'yellow'
                      : 'red'
                  }
                >
                  {job.results.verdict.toUpperCase()}
                </Text>
              </Text>
            </Box>

            <Box marginBottom={1}>
              <Text bold>
                Confidence: <Text color="cyan">{job.confidence_score?.toFixed(1)}%</Text>
              </Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="green">
                Summary:
              </Text>
              <Text>{job.results.summary}</Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="cyan">
                Key Findings:
              </Text>
              {job.results.key_findings.map((finding, idx) => (
                <Text key={idx}>• {finding}</Text>
              ))}
            </Box>

            {job.results.risks.length > 0 && (
              <Box flexDirection="column" marginBottom={1}>
                <Text bold color="red">
                  Risks:
                </Text>
                {job.results.risks.map((risk, idx) => (
                  <Text key={idx} color="red">
                    • {risk}
                  </Text>
                ))}
              </Box>
            )}

            {job.results.recommendations.length > 0 && (
              <Box flexDirection="column" marginBottom={1}>
                <Text bold color="yellow">
                  Recommendations:
                </Text>
                {job.results.recommendations.map((rec, idx) => (
                  <Text key={idx}>• {rec}</Text>
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Text color="yellow">No results available</Text>
        )}

        <Box marginTop={2} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text color="gray">[B/Esc] Back to Engagements</Text>
        </Box>
      </Box>
    );
  }

  return <Text>Unknown view</Text>;
}
