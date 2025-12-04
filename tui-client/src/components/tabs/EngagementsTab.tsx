import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Engagement, CreateEngagementRequest } from '../../types/api.js';
import { useEngagements } from '../../hooks/useAPI.js';
import { ThesisValidatorClient } from '../../api/client.js';
import { EngagementCreateForm } from '../forms/EngagementCreateForm.js';
import { EngagementDetail } from '../details/EngagementDetail.js';
import { EngagementResearch } from '../research/EngagementResearch.js';

interface EngagementsTabProps {
  serverUrl: string;
  authToken?: string | undefined;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusColor(
  status: Engagement['status']
): 'green' | 'yellow' | 'blue' | 'red' | 'gray' {
  switch (status) {
    case 'research_active':
      return 'yellow';
    case 'research_complete':
      return 'green';
    case 'completed':
      return 'blue';
    case 'research_failed':
      return 'red';
    case 'pending':
      return 'gray';
  }
}

function formatStatus(status: Engagement['status']): string {
  switch (status) {
    case 'research_active':
      return 'Active';
    case 'research_complete':
      return 'Complete';
    case 'completed':
      return 'Done';
    case 'research_failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
  }
}

type ViewMode = 'list' | 'detail' | 'create' | 'research';

export function EngagementsTab({ serverUrl, authToken }: EngagementsTabProps): React.ReactElement {
  const { engagements, loading, error, refresh } = useEngagements(serverUrl, authToken);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create API client instance
  const apiClient = useMemo(
    () => new ThesisValidatorClient(serverUrl, authToken),
    [serverUrl, authToken]
  );

  // Handle form submission
  const handleCreateEngagement = async (data: CreateEngagementRequest) => {
    try {
      setIsSubmitting(true);
      await apiClient.createEngagement(data);
      setMessage(`Successfully created engagement: ${data.target.name}`);
      setViewMode('list');
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create engagement';
      setMessage(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCreate = () => {
    setViewMode('list');
    setMessage('');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setMessage('');
  };

  const handleStartResearch = () => {
    if (engagements[selectedIndex] && !engagements[selectedIndex]?.thesis) {
      setViewMode('research');
      setMessage('');
    }
  };

  const handleResearchComplete = async () => {
    setViewMode('list');
    setMessage('Research completed! Refreshing engagements...');
    await refresh();
  };

  // Handle keyboard input
  useInput((input, key) => {
    if (loading || error || viewMode !== 'list') return;

    // Navigation
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      setMessage('');
    }
    if (key.downArrow && selectedIndex < engagements.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      setMessage('');
    }

    // Actions
    if (input === 'n' || input === 'N') {
      setViewMode('create');
      setMessage('');
    }
    if (input === 'e' || input === 'E') {
      if (engagements.length > 0) {
        setMessage(`Editing: ${engagements[selectedIndex]?.name} - Feature coming soon!`);
      }
    }
    if (input === 'd' || input === 'D') {
      if (engagements.length > 0) {
        setMessage(`Delete: ${engagements[selectedIndex]?.name} - Feature coming soon!`);
      }
    }
    if (key.return && engagements.length > 0) {
      setViewMode('detail');
      setMessage('');
    }
    // Start research directly from list
    if ((input === 'r' || input === 'R') && engagements.length > 0) {
      const selected = engagements[selectedIndex];
      if (selected && !selected.thesis) {
        setViewMode('research');
        setMessage('');
      } else if (selected?.thesis) {
        setMessage('Research already completed for this engagement');
      }
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="yellow">Loading engagements...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="red">Error: {error}</Text>
        <Box marginTop={1}>
          <Text color="gray">
            Make sure the backend server is running at {serverUrl}
          </Text>
        </Box>
      </Box>
    );
  }

  // Show create form
  if (viewMode === 'create') {
    return (
      <EngagementCreateForm
        onSubmit={handleCreateEngagement}
        onCancel={handleCancelCreate}
        isSubmitting={isSubmitting}
      />
    );
  }

  // Show detail view
  if (viewMode === 'detail' && engagements[selectedIndex]) {
    return (
      <EngagementDetail
        engagement={engagements[selectedIndex]}
        onBack={handleBackToList}
        onStartResearch={!engagements[selectedIndex]?.thesis ? handleStartResearch : undefined}
      />
    );
  }

  // Show research view
  if (viewMode === 'research' && engagements[selectedIndex]) {
    return (
      <EngagementResearch
        engagement={engagements[selectedIndex]}
        serverUrl={serverUrl}
        authToken={authToken}
        onBack={handleBackToList}
        onComplete={handleResearchComplete}
      />
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Table Header */}
      <Box marginBottom={1}>
        <Box width={30}>
          <Text bold>Name</Text>
        </Box>
        <Box width={25}>
          <Text bold>Target</Text>
        </Box>
        <Box width={15}>
          <Text bold>Status</Text>
        </Box>
        <Box width={15}>
          <Text bold>Created</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color="gray">
          {'─'.repeat(85)}
        </Text>
      </Box>

      {/* Table Rows */}
      {engagements.map((eng, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={eng.id} marginBottom={1}>
            {isSelected ? (
              <Text color="cyan" bold>▸ </Text>
            ) : (
              <Text>  </Text>
            )}
            <Box width={28}>
              {isSelected ? (
                <Text color="cyan" bold>{eng.name}</Text>
              ) : (
                <Text>{eng.name}</Text>
              )}
            </Box>
            <Box width={25}>
              <Text color={isSelected ? 'cyan' : 'blue'}>{eng.target.name}</Text>
            </Box>
            <Box width={15}>
              <Text color={getStatusColor(eng.status)}>{formatStatus(eng.status)}</Text>
            </Box>
            <Box width={15}>
              <Text color="gray">{formatDate(eng.created_at)}</Text>
            </Box>
          </Box>
        );
      })}

      {/* Empty State */}
      {engagements.length === 0 && (
        <Box marginY={2}>
          <Text color="gray">No engagements found. Press [N] to create a new one.</Text>
        </Box>
      )}

      {/* Message Display */}
      {message && (
        <Box marginTop={1} paddingX={1}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}

      {/* Action Hints */}
      <Box marginTop={2} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray">
          [N] New  [R] Research  [E] Edit  [D] Delete  [Enter] Details  [↑↓] Navigate
        </Text>
      </Box>
    </Box>
  );
}
