import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { EngagementsTab } from './components/tabs/EngagementsTab.js';
import { ResearchTab } from './components/tabs/ResearchTab.js';
import { useHealthCheck } from './hooks/useAPI.js';

interface AppProps {
  serverUrl: string;
  authToken?: string | undefined;
}

export function App({ serverUrl, authToken }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const { isOnline } = useHealthCheck(serverUrl);
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

  // Tab-specific help text
  const getHelpText = (): string => {
    switch (activeTab) {
      case 0:
        return '↑↓: Navigate  Enter: Details  N: New  E: Edit  D: Delete';
      case 1:
        return '↑↓: Navigate  Enter: Select  S: Edit Thesis  R: Run  B: Back  ESC: Cancel';
      case 2:
        return 'F: Filter  /: Search  Enter: Details  C: Clear';
      case 3:
        return 'Enter: Expand/Collapse  V: View Details  E: Evidence';
      case 4:
        return 'Auto-refresh: 5s';
      default:
        return '1-5: Switch Tabs  Q: Quit  ?: Help';
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Header serverUrl={serverUrl} isOnline={isOnline} />

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
        {activeTab === 0 && <EngagementsTab serverUrl={serverUrl} authToken={authToken} />}
        {activeTab === 1 && <ResearchTab serverUrl={serverUrl} authToken={authToken} />}
        {activeTab === 2 && <Text>Evidence Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 3 && <Text>Hypothesis Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 4 && <Text>Monitor Tab - Press 1-5 to switch tabs</Text>}
      </Box>

      <Footer helpText={getHelpText()} />
    </Box>
  );
}
