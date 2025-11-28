import { useState, useEffect } from 'react';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';
import { Sidebar } from './components/sidebar/Sidebar';
import { MainPanel } from './components/main/MainPanel';
import { ContextPanel } from './components/context/ContextPanel';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isDark, setIsDark] = useState(false);

  // Check for system dark mode preference
  useEffect(() => {
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(isDarkMode);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleNavigate = (view: string) => {
    setCurrentView(view);
  };

  const handleSelectEvidence = (evidence: unknown) => {
    console.log('Selected evidence:', evidence);
    // Could switch to evidence tab in context panel or open a modal
  };

  return (
    <ThreePanelLayout
      leftPanel={
        <Sidebar
          onNavigate={handleNavigate}
          currentView={currentView}
        />
      }
      mainPanel={
        <MainPanel
          onSelectEvidence={handleSelectEvidence}
        />
      }
      rightPanel={
        <ContextPanel />
      }
    />
  );
}

export default App;
