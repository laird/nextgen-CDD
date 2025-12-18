import { useState, useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose, Menu, X } from 'lucide-react';

interface ThreePanelLayoutProps {
  leftPanel: ReactNode;
  mainPanel: ReactNode;
  rightPanel: ReactNode;
  defaultLeftCollapsed?: boolean;
  defaultRightCollapsed?: boolean;
}

export function ThreePanelLayout({
  leftPanel,
  mainPanel,
  rightPanel,
  defaultLeftCollapsed = false,
  defaultRightCollapsed = false,
}: ThreePanelLayoutProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(defaultLeftCollapsed);
  const [rightCollapsed, setRightCollapsed] = useState(defaultRightCollapsed);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'main' | 'context'>('main');
  const [isMobile, setIsMobile] = useState(false);

  // Handle responsive breakpoints
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle resizing logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate new width based on mouse position from right edge of screen
      const newWidth = window.innerWidth - e.clientX;

      // Apply constraints
      if (newWidth >= 250 && newWidth <= 600) {
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default'; // Cleanup style
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  // Close mobile menu on navigation
  const handleMobileMenuClose = () => {
    setMobileMenuOpen(false);
  };

  const startResizing = () => {
    setIsResizing(true);
  };

  return (
    <div className="flex h-screen bg-surface-50 dark:bg-surface-900 overflow-hidden">
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-4">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <span className="font-semibold text-surface-900 dark:text-white">Thesis Validator</span>

          <div className="flex gap-1">
            <button
              onClick={() => setMobileView('main')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mobileView === 'main'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-surface-600 dark:text-surface-400'
                }`}
            >
              Chat
            </button>
            <button
              onClick={() => setMobileView('context')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mobileView === 'context'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-surface-600 dark:text-surface-400'
                }`}
            >
              Details
            </button>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={handleMobileMenuClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-surface-800 shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-surface-200 dark:border-surface-700 px-4">
              <span className="font-semibold text-surface-900 dark:text-white">Menu</span>
              <button
                onClick={handleMobileMenuClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(100vh-56px)] overflow-y-auto" onClick={handleMobileMenuClose}>
              {leftPanel}
            </div>
          </aside>
        </>
      )}

      {/* Desktop Left Panel (Sidebar) */}
      {!isMobile && (
        <aside
          className={`
            relative flex flex-col border-r border-surface-200 dark:border-surface-700
            bg-white dark:bg-surface-800 transition-all duration-300 ease-in-out
            ${leftCollapsed ? 'w-16' : 'w-72'}
          `}
        >
          <div className="flex-1 overflow-hidden">
            {leftPanel}
          </div>

          {/* Left Panel Toggle */}
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center
                       rounded-full border border-surface-200 bg-white shadow-sm
                       hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-700
                       dark:hover:bg-surface-600 transition-colors"
            aria-label={leftCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {leftCollapsed ? (
              <ChevronRight className="h-4 w-4 text-surface-500" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-surface-500" />
            )}
          </button>
        </aside>
      )}

      {/* Main Content Panel */}
      <main
        className={`
          flex-1 flex flex-col min-w-0 overflow-hidden
          ${isMobile ? 'pt-14' : ''}
          ${isMobile && mobileView !== 'main' ? 'hidden' : ''}
        `}
      >
        {mainPanel}
      </main>

      {/* Right Panel (Context/Details) - Desktop */}
      {!isMobile && (
        <aside
          className={`
            relative flex flex-col border-l border-surface-200 dark:border-surface-700
            bg-white dark:bg-surface-800 transition-all duration-300 ease-in-out
          `}
          style={{ width: rightCollapsed ? 0 : rightPanelWidth }}
        >
          {/* Drag Handle */}
          {!rightCollapsed && (
            <div
              onMouseDown={startResizing}
              className={`
                absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize z-20 hover:bg-primary-500/50 transition-colors
                ${isResizing ? 'bg-primary-500' : 'bg-transparent'}
              `}
              title="Drag to resize"
            />
          )}

          {!rightCollapsed && (
            <div className="flex-1 overflow-hidden">
              {rightPanel}
            </div>
          )}

          {/* Right Panel Toggle */}
          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className={`
              absolute top-6 z-10 flex h-6 w-6 items-center justify-center
              rounded-full border border-surface-200 bg-white shadow-sm
              hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-700
              dark:hover:bg-surface-600 transition-colors
              -left-3
            `}
            aria-label={rightCollapsed ? 'Expand details panel' : 'Collapse details panel'}
          >
            {rightCollapsed ? (
              <PanelRightClose className="h-4 w-4 text-surface-500" />
            ) : (
              <PanelLeftClose className="h-4 w-4 text-surface-500" />
            )}
          </button>
        </aside>
      )}

      {/* Right Panel (Context/Details) - Mobile */}
      {isMobile && mobileView === 'context' && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden pt-14 bg-white dark:bg-surface-800">
          {rightPanel}
        </div>
      )}
    </div>
  );
}
