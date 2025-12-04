import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  serverUrl: string;
  isOnline: boolean;
}

export function Header({ serverUrl, isOnline }: HeaderProps): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1}>
      <Text bold>Thesis Validator TUI</Text>
      <Text> | </Text>
      <Text color="gray">Server: {serverUrl}</Text>
      <Text> | </Text>
      {isOnline ? (
        <Text color="green">✓ Online</Text>
      ) : (
        <Text color="red">✗ Offline</Text>
      )}
    </Box>
  );
}
