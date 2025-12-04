import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import WebSocket from 'ws';
import { ThesisValidatorClient } from '../../api/client.js';
import type { Engagement, ResearchJob, ProgressEvent, ResearchConfig } from '../../types/api.js';

interface ResearchTabProps {
  serverUrl: string;
  authToken?: string;
}

type View = 'select_engagement' | 'input_thesis' | 'running' | 'results';

export function ResearchTab({ serverUrl, authToken }: ResearchTabProps): React.ReactElement {
  const [view, setView] = useState<View>('select_engagement');
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [selectedEngagementIndex, setSelectedEngagementIndex] = useState(0);
  const [selectedEngagement, setSelectedEngagement] = useState<Engagement | null>(null);

  const [thesis, setThesis] = useState('');
  const [isEditingThesis, setIsEditingThesis] = useState(false);

  const [job, setJob] = useState<ResearchJob | null>(null);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const client = new ThesisValidatorClient(serverUrl, authToken);

  // Load engagements
  useEffect(() => {
    if (view === 'select_engagement') {
      setLoading(true);
      client.getEngagements()
        .then(engs => {
          setEngagements(engs);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [view]);

  // Handle WebSocket connection
  useEffect(() => {
    if (view === 'running' && job && !ws) {
      const wsUrl = client.getResearchProgressWsUrl(job.id, authToken);
      const websocket = new WebSocket(wsUrl);

      websocket.on('open', () => {
        console.log('[ResearchTab] WebSocket connected');
      });

      websocket.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'progress') {
            const event = message.payload as ProgressEvent;
            setProgressEvents(prev => [...prev, event]);

            // Check if completed or failed
            if (event.type === 'completed') {
              // Fetch final results
              client.getResearchJob(selectedEngagement!.id, job.id)
                .then(updatedJob => {
                  setJob(updatedJob);
                  setView('results');
                  websocket.close();
                })
                .catch(err => setError(err.message));
            } else if (event.type === 'error') {
              setError(event.data.message as string || 'Research job failed');
              setView('results');
              websocket.close();
            }
          }
        } catch (err) {
          console.error('[ResearchTab] Failed to parse WebSocket message:', err);
        }
      });

      websocket.on('error', (err: Error) => {
        console.error('[ResearchTab] WebSocket error:', err);
        setError('WebSocket connection error');
      });

      websocket.on('close', () => {
        console.log('[ResearchTab] WebSocket closed');
        setWs(null);
      });

      setWs(websocket);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [view, job, ws]);

  // Handle keyboard input
  useInput((input, key) => {
    if (isEditingThesis) return; // Let TextInput handle input

    if (view === 'select_engagement') {
      if (key.upArrow) {
        setSelectedEngagementIndex(i => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedEngagementIndex(i => Math.min(engagements.length - 1, i + 1));
      } else if (key.return) {
        if (engagements[selectedEngagementIndex]) {
          setSelectedEngagement(engagements[selectedEngagementIndex]!);
          setView('input_thesis');
        }
      }
    } else if (view === 'input_thesis') {
      if (input === 's' || input === 'S') {
        if (!isEditingThesis) {
          setIsEditingThesis(true);
        }
      } else if (key.escape && isEditingThesis) {
        setIsEditingThesis(false);
      } else if (input === 'r' || input === 'R') {
        if (thesis.trim().length >= 10 && !isEditingThesis) {
          handleStartResearch();
        }
      } else if (key.escape) {
        setView('select_engagement');
        setThesis('');
      }
    } else if (view === 'results') {
      if (input === 'b' || input === 'B') {
        // Back to select engagement
        setView('select_engagement');
        setSelectedEngagement(null);
        setThesis('');
        setJob(null);
        setProgressEvents([]);
        setError(null);
      }
    }
  });

  const handleStartResearch = async () => {
    if (!selectedEngagement || !thesis.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const config: ResearchConfig = {
        maxHypotheses: 3,
        enableDeepDive: false,
        searchDepth: 'quick',
        confidenceThreshold: 70,
      };

      const result = await client.startResearch(selectedEngagement.id, thesis, config);

      // Fetch initial job status
      const jobStatus = await client.getResearchJob(selectedEngagement.id, result.job_id);
      setJob(jobStatus);
      setView('running');
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  // Render different views
  if (error && view !== 'results') {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Text color="gray">Press ESC to go back</Text>
      </Box>
    );
  }

  if (loading) {
    return <Text color="yellow">Loading...</Text>;
  }

  if (view === 'select_engagement') {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Select an Engagement for Research</Text>
        <Text color="gray">↑↓: Navigate  Enter: Select  ESC: Cancel</Text>
        <Text>{''}</Text>

        {engagements.length === 0 ? (
          <Text color="yellow">No engagements found. Create one first!</Text>
        ) : (
          engagements.map((eng, index) => (
            <Box key={eng.id}>
              <Text color={index === selectedEngagementIndex ? 'cyan' : 'white'}>
                {index === selectedEngagementIndex ? '> ' : '  '}
                {eng.name} ({eng.target.name}) - {eng.status}
              </Text>
            </Box>
          ))
        )}
      </Box>
    );
  }

  if (view === 'input_thesis') {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Start Research for: {selectedEngagement?.name}</Text>
        <Text color="gray">S: Edit Thesis  R: Run Research  ESC: Back</Text>
        <Text>{''}</Text>

        <Box flexDirection="column">
          <Text>Investment Thesis (min 10 characters):</Text>
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

        <Text>{''}</Text>
        {thesis.length >= 10 && !isEditingThesis && (
          <Text color="cyan">Press R to start research</Text>
        )}
        {thesis.length > 0 && thesis.length < 10 && (
          <Text color="red">Thesis must be at least 10 characters</Text>
        )}
      </Box>
    );
  }

  if (view === 'running') {
    const latestEvent = progressEvents[progressEvents.length - 1];

    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Research in Progress: {selectedEngagement?.name}</Text>
        <Text color="gray">Job ID: {job?.id}</Text>
        <Text>{''}</Text>

        <Text bold>Status: <Text color="yellow">{job?.status}</Text></Text>
        <Text>{''}</Text>

        {latestEvent && (
          <Box flexDirection="column">
            <Text bold color="green">Latest Update:</Text>
            <Text>Type: {latestEvent.type}</Text>
            <Text>Message: {latestEvent.data.message as string || 'Processing...'}</Text>
            {latestEvent.data.progress && (
              <Text>Progress: {latestEvent.data.progress}%</Text>
            )}
          </Box>
        )}

        <Text>{''}</Text>
        <Text bold color="cyan">Progress Events:</Text>
        <Box flexDirection="column" maxHeight={10}>
          {progressEvents.slice(-10).reverse().map((event, idx) => (
            <Text key={idx} color="gray">
              [{new Date(event.timestamp).toLocaleTimeString()}] {event.type}: {event.data.message as string || ''}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (view === 'results') {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Research Results: {selectedEngagement?.name}</Text>
        <Text color="gray">Job ID: {job?.id}  |  Press B to go back</Text>
        <Text>{''}</Text>

        {error ? (
          <Box flexDirection="column">
            <Text bold color="red">Error:</Text>
            <Text color="red">{error}</Text>
          </Box>
        ) : job?.results ? (
          <Box flexDirection="column">
            <Text bold>Verdict: <Text color={
              job.results.verdict === 'proceed' ? 'green' :
              job.results.verdict === 'review' ? 'yellow' : 'red'
            }>{job.results.verdict.toUpperCase()}</Text></Text>

            <Text bold>Confidence: <Text color="cyan">{job.confidence_score?.toFixed(1)}%</Text></Text>

            <Text>{''}</Text>
            <Text bold color="green">Summary:</Text>
            <Text>{job.results.summary}</Text>

            <Text>{''}</Text>
            <Text bold color="cyan">Key Findings:</Text>
            {job.results.key_findings.map((finding, idx) => (
              <Text key={idx}>• {finding}</Text>
            ))}

            {job.results.risks.length > 0 && (
              <>
                <Text>{''}</Text>
                <Text bold color="red">Risks:</Text>
                {job.results.risks.map((risk, idx) => (
                  <Text key={idx} color="red">• {risk}</Text>
                ))}
              </>
            )}

            {job.results.recommendations.length > 0 && (
              <>
                <Text>{''}</Text>
                <Text bold color="yellow">Recommendations:</Text>
                {job.results.recommendations.map((rec, idx) => (
                  <Text key={idx}>• {rec}</Text>
                ))}
              </>
            )}
          </Box>
        ) : (
          <Text color="yellow">No results available</Text>
        )}
      </Box>
    );
  }

  return <Text>Unknown view</Text>;
}
