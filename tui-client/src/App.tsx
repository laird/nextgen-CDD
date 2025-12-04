import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

interface AppProps {
  serverUrl: string;
}

export function App({ serverUrl }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const { exit } = useApp();

  // Handle keyboard input
  useInput((input, key) => {
    // Tab switching
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === '5') setActiveTab(4);

    // Quit
    if (input === 'q' || input === 'Q') {
      exit();
    }

    // Ctrl+C also quits
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="blue" paddingX={1}>
        <Text bold>Thesis Validator TUI</Text>
        <Text> | </Text>
        <Text color="gray">Server: {serverUrl}</Text>
        <Text> | </Text>
        <Text color="green">✓ Online</Text>
      </Box>

      {/* Tab Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={activeTab === 0 ? 'cyan' : 'gray'}>[1] Engagements</Text>
        <Text>  </Text>
        <Text color={activeTab === 1 ? 'cyan' : 'gray'}>[2] Research</Text>
        <Text>  </Text>
        <Text color={activeTab === 2 ? 'cyan' : 'gray'}>[3] Evidence</Text>
        <Text>  </Text>
        <Text color={activeTab === 3 ? 'cyan' : 'gray'}>[4] Hypothesis</Text>
        <Text>  </Text>
        <Text color={activeTab === 4 ? 'cyan' : 'gray'}>[5] Monitor</Text>
        <Text>  </Text>
        <Text color="red">[Q] Quit</Text>
      </Box>

      {/* Content Area */}
      <Box flexGrow={1} paddingX={1} paddingY={1}>
        {activeTab === 0 && <Text>Engagements Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 1 && <Text>Research Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 2 && <Text>Evidence Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 3 && <Text>Hypothesis Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 4 && <Text>Monitor Tab - Press 1-5 to switch tabs</Text>}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          1-5: Switch Tabs  Q: Quit  ?: Help
        </Text>
      </Box>
    </Box>
  );
}
