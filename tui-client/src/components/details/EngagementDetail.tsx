import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { Engagement } from '../../types/api.js';

interface EngagementDetailProps {
  engagement: Engagement;
  onBack: () => void;
  onStartResearch?: (() => void) | undefined;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
      return 'Research Active';
    case 'research_complete':
      return 'Research Complete';
    case 'completed':
      return 'Completed';
    case 'research_failed':
      return 'Research Failed';
    case 'pending':
      return 'Pending';
  }
}

function formatDealType(dealType: Engagement['deal_type']): string {
  switch (dealType) {
    case 'buyout':
      return 'Buyout';
    case 'growth':
      return 'Growth Equity';
    case 'venture':
      return 'Venture Capital';
    case 'bolt-on':
      return 'Bolt-on Acquisition';
  }
}

export function EngagementDetail({
  engagement,
  onBack,
  onStartResearch,
}: EngagementDetailProps): React.ReactElement {
  useInput((input, key) => {
    // Go back with Escape or B
    if (key.escape || input === 'b' || input === 'B') {
      onBack();
    }

    // Start research with R (if available)
    if ((input === 'r' || input === 'R') && onStartResearch) {
      onStartResearch();
    }
  });

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan" dimColor={false}>
          {engagement.name}
        </Text>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color="gray">{'─'.repeat(80)}</Text>
      </Box>

      {/* Target Company Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Box width={20}>
            <Text color="gray">Target Company:</Text>
          </Box>
          <Text bold color="white">
            {engagement.target.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Box width={20}>
            <Text color="gray">Sector:</Text>
          </Box>
          <Text color="blue">{engagement.target.sector}</Text>
        </Box>

        {engagement.target.location && (
          <Box marginBottom={1}>
            <Box width={20}>
              <Text color="gray">Location:</Text>
            </Box>
            <Text color="white">{engagement.target.location}</Text>
          </Box>
        )}
      </Box>

      {/* Deal Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Box width={20}>
            <Text color="gray">Deal Type:</Text>
          </Box>
          <Text color="magenta">{formatDealType(engagement.deal_type)}</Text>
        </Box>

        <Box marginBottom={1}>
          <Box width={20}>
            <Text color="gray">Status:</Text>
          </Box>
          <Text bold color={getStatusColor(engagement.status)}>
            {formatStatus(engagement.status)}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Box width={20}>
            <Text color="gray">Created:</Text>
          </Box>
          <Text color="white">{formatDate(engagement.created_at)}</Text>
        </Box>

        <Box marginBottom={1}>
          <Box width={20}>
            <Text color="gray">Created By:</Text>
          </Box>
          <Text color="white">{engagement.created_by}</Text>
        </Box>
      </Box>

      {/* Thesis Info */}
      {engagement.thesis && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color="gray" bold>
              Investment Thesis:
            </Text>
          </Box>
          <Box paddingLeft={2} marginBottom={1}>
            <Text color="white">{engagement.thesis.statement}</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color="gray">
              Submitted: {formatDate(engagement.thesis.submitted_at)}
            </Text>
          </Box>
        </Box>
      )}

      {/* Divider */}
      <Box marginTop={1} marginBottom={1}>
        <Text color="gray">{'─'.repeat(80)}</Text>
      </Box>

      {/* Action Hints */}
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray">
          [B/Esc] Back to List
          {onStartResearch && !engagement.thesis && '  [R] Start Research'}
        </Text>
      </Box>
    </Box>
  );
}
