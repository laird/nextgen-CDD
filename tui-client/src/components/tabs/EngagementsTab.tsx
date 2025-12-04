import React from 'react';
import { Box, Text } from 'ink';
import type { Engagement } from '../../types/api.js';
import { useEngagements } from '../../hooks/useAPI.js';

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

export function EngagementsTab({ serverUrl, authToken }: EngagementsTabProps): React.ReactElement {
  const { engagements, loading, error } = useEngagements(serverUrl, authToken);

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
      {engagements.map((eng) => (
        <Box key={eng.id} marginBottom={1}>
          <Box width={30}>
            <Text>{eng.name}</Text>
          </Box>
          <Box width={25}>
            <Text color="cyan">{eng.target.name}</Text>
          </Box>
          <Box width={15}>
            <Text color={getStatusColor(eng.status)}>{formatStatus(eng.status)}</Text>
          </Box>
          <Box width={15}>
            <Text color="gray">{formatDate(eng.created_at)}</Text>
          </Box>
        </Box>
      ))}

      {/* Empty State */}
      {engagements.length === 0 && (
        <Box marginY={2}>
          <Text color="gray">No engagements found. Press [N] to create a new one.</Text>
        </Box>
      )}

      {/* Action Hints */}
      <Box marginTop={2} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray">
          [N] New  [E] Edit  [D] Delete  [Enter] Details  [↑↓] Navigate
        </Text>
      </Box>
    </Box>
  );
}
