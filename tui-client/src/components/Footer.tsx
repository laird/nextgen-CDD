import React from 'react';
import { Box, Text } from 'ink';

interface FooterProps {
  helpText?: string;
}

export function Footer({ helpText }: FooterProps): React.ReactElement {
  const defaultHelp = '1-5: Switch Tabs  Q: Quit  ?: Help';

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="gray">{helpText ?? defaultHelp}</Text>
    </Box>
  );
}
