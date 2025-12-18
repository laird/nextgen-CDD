import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';
import { Sidebar } from './components/sidebar/Sidebar';
import { MainPanel } from './components/main/MainPanel';
import { ContextPanel } from './components/context/ContextPanel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  // Initialize view from URL
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

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/') {
        setCurrentView('dashboard');
      } else if (path === '/new-engagement') {
        setCurrentView('new-engagement');
      } else if (path.startsWith('/engagements/')) {
        const id = path.replace('/engagements/', '');
        setCurrentView(`engagement-${id}`);
      } else {
        const view = path.substring(1); // remove leading slash
        setCurrentView(view);
      }
    };

    // Handle initial load
    handlePopState();

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (view: string) => {
    setCurrentView(view);

    // Update URL
    let url = '/';
    if (view === 'dashboard') {
      url = '/';
    } else if (view === 'new-engagement') {
      url = '/new-engagement';
    } else if (view.startsWith('engagement-')) {
      const id = view.replace('engagement-', '');
      url = `/engagements/${id}`;
    } else {
      url = `/${view}`;
    }

    window.history.pushState(null, '', url);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThreePanelLayout
        leftPanel={
          <Sidebar
            onNavigate={handleNavigate}
            currentView={currentView}
          />
        }
        mainPanel={
          <MainPanel
            currentView={currentView}
            onViewChange={handleNavigate}
          />
        }
        rightPanel={
          <ContextPanel
            engagementId={currentView.startsWith('engagement-') ? currentView.replace('engagement-', '') : undefined}
          />
        }
      />
    </QueryClientProvider>
  );
}

export default App;
