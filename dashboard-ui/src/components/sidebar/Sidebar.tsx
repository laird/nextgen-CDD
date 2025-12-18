import { useState } from 'react';
import {
  Home,
  Briefcase,
  Search,
  FileText,
  BarChart3,
  Settings,
  HelpCircle,
  Plus,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Sparkles,
  Archive,
} from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { useEngagements, useDeleteEngagement, useUpdateEngagement } from '../../hooks/useEngagements';
import { ConfirmationModal } from '../common/ConfirmationModal';

interface SidebarProps {
  collapsed?: boolean;
  onNavigate?: (view: string) => void;
  currentView?: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  active: <Clock className="h-3 w-3 text-primary-500" />,
  in_review: <AlertTriangle className="h-3 w-3 text-yellow-500" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  draft: <FileText className="h-3 w-3 text-surface-400" />,
  pending: <Clock className="h-3 w-3 text-surface-400" />,
  research_active: <Loader2 className="h-3 w-3 text-primary-500 animate-spin" />,
  research_complete: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  research_failed: <AlertTriangle className="h-3 w-3 text-red-500" />,
};

export function Sidebar({ collapsed = false, onNavigate, currentView = 'dashboard' }: SidebarProps) {
  const [engagementsExpanded, setEngagementsExpanded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastFocusedId, setLastFocusedId] = useState<string | null>(null);
  const { data, isLoading, error } = useEngagements();
  const { mutateAsync: deleteEngagement } = useDeleteEngagement();
  const { mutateAsync: updateEngagement } = useUpdateEngagement();

  const [confirmationState, setConfirmationState] = useState<{
    type: 'delete' | 'archive' | null;
    show: boolean;
  }>({ type: null, show: false });
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);

  const handleBulkAction = async () => {
    if (!confirmationState.type || selectedIds.length === 0) return;

    setIsBulkActionPending(true);
    try {
      if (confirmationState.type === 'delete') {
        await Promise.all(selectedIds.map(id => deleteEngagement(id)));
      } else {
        await Promise.all(selectedIds.map(id => updateEngagement({ id, data: { status: 'archived' } })));
      }
      setSelectedIds([]);
      setConfirmationState({ type: null, show: false });
      if (onNavigate) onNavigate('dashboard');
    } catch (err) {
      console.error('Bulk action failed', err);
    } finally {
      setIsBulkActionPending(false);
    }
  };

  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'research', icon: Search, label: 'Research' },
    { id: 'reports', icon: FileText, label: 'Reports' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'skills', icon: Sparkles, label: 'Skills Library' },
  ];

  const bottomItems = [
    { id: 'settings', icon: Settings, label: 'Settings' },
    { id: 'help', icon: HelpCircle, label: 'Help & Support' },
  ];

  const engagements = data?.engagements || [];

  return (
    <div className="flex h-full flex-col">
      {/* Logo/Brand */}
      <div className="flex h-14 items-center border-b border-surface-200 dark:border-surface-700 px-4">
        {collapsed ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold">
            T
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold text-sm">
              TV
            </div>
            <span className="font-semibold text-surface-900 dark:text-white">
              Thesis Validator
            </span>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {/* Primary Nav Items */}
        <div className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.id)}
              className={`
                flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                transition-colors
                ${currentView === item.id
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Engagements Section */}
        <div className="mt-6">
          {!collapsed && (
            <button
              onClick={() => setEngagementsExpanded(!engagementsExpanded)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300"
            >
              <span className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Engagements
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${engagementsExpanded ? '' : '-rotate-90'}`}
              />
            </button>
          )}

          {collapsed && (
            <div className="flex justify-center py-2">
              <Briefcase className="h-5 w-5 text-surface-400" />
            </div>
          )}

          {engagementsExpanded && !collapsed && (
            <div className="mt-1 space-y-1">
              {/* New Engagement Button */}
              <button
                onClick={() => onNavigate?.('new-engagement')}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium
                         text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
              >
                <Plus className="h-4 w-4" />
                <span>New Engagement</span>
              </button>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-surface-400" />
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="px-3 py-2 text-xs text-red-500">
                  Failed to load engagements
                </div>
              )}

              {/* Engagement List */}
              {!isLoading && !error && engagements.map((engagement) => (
                <button
                  key={engagement.id}
                  onClick={(e) => {
                    // Multi-select logic
                    if (e.metaKey || e.ctrlKey) {
                      // Toggle selection, NO NAVIGATION
                      e.preventDefault();
                      e.stopPropagation();
                      if (selectedIds.includes(engagement.id)) {
                        setSelectedIds(selectedIds.filter(id => id !== engagement.id));
                      } else {
                        setSelectedIds([...selectedIds, engagement.id]);
                        setLastFocusedId(engagement.id);
                      }
                    } else if (e.shiftKey && lastFocusedId) {
                      // Range selection, NO NAVIGATION
                      e.preventDefault();
                      e.stopPropagation();
                      const startIdx = engagements.findIndex(e => e.id === lastFocusedId);
                      const endIdx = engagements.findIndex(e => e.id === engagement.id);
                      if (startIdx !== -1 && endIdx !== -1) {
                        const low = Math.min(startIdx, endIdx);
                        const high = Math.max(startIdx, endIdx);
                        const range = engagements.slice(low, high + 1).map(e => e.id);
                        // Merge with existing logic or replace? Standard is replace current selection with range unless Ctrl also held.
                        // Simplified: Replace selection with range.
                        setSelectedIds(range);
                      }
                    } else {
                      // Normal click: Clear selection, Navigate
                      setSelectedIds([]);
                      setLastFocusedId(engagement.id);
                      onNavigate?.(`engagement-${engagement.id}`);
                    }
                  }}
                  className={`
                    flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors relative
                    ${selectedIds.includes(engagement.id)
                      ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-900 dark:text-primary-100'
                      : currentView === `engagement-${engagement.id}`
                        ? 'bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-white'
                        : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'
                    }
                  `}
                >
                  {statusIcons[engagement.status]}
                  <span className="truncate flex-1 text-left">{engagement.target_company || 'Unnamed Engagement'}</span>
                  {selectedIds.includes(engagement.id) && (
                    <div className="absolute right-2 w-2 h-2 rounded-full bg-primary-500" />
                  )}
                </button>
              ))}

              {/* Empty State */}
              {!isLoading && !error && engagements.length === 0 && (
                <div className="px-3 py-2 text-xs text-surface-500">
                  No engagements yet
                </div>
              )}
            </div>
          )}

          {engagementsExpanded && !collapsed && (
            <div className="mt-2 pt-2 border-t border-surface-200 dark:border-surface-700">
              <button
                onClick={() => onNavigate?.('archived-engagements')}
                className={`
                   flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm
                   text-surface-500 hover:bg-surface-100 hover:text-surface-900 
                   dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white
                   ${currentView === 'archived-engagements' ? 'bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-white' : ''}
                 `}
              >
                <Archive className="h-4 w-4" />
                <span>Archived Projects</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="border-t border-surface-200 dark:border-surface-700 p-2 bg-surface-50 dark:bg-surface-800">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
              {selectedIds.length} Selected
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmationState({ type: 'archive', show: true })}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-surface-700 text-surface-700 dark:text-surface-300 border border-surface-200 dark:border-surface-600 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-600 text-xs font-medium"
              title="Archive Selected"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
            <button
              onClick={() => setConfirmationState({ type: 'delete', show: true })}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-surface-700 text-red-600 dark:text-red-400 border border-surface-200 dark:border-surface-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium"
              title="Delete Selected"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="border-t border-surface-200 dark:border-surface-700 p-2">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate?.(item.id)}
            className={`
              flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
              text-surface-600 hover:bg-surface-100 hover:text-surface-900
              dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white
              ${collapsed ? 'justify-center' : ''}
            `}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>

      <ConfirmationModal
        isOpen={confirmationState.show}
        onClose={() => setConfirmationState({ ...confirmationState, show: false })}
        onConfirm={handleBulkAction}
        title={confirmationState.type === 'delete' ? `Delete ${selectedIds.length} Engagements?` : `Archive ${selectedIds.length} Engagements?`}
        message={
          confirmationState.type === 'delete'
            ? 'Are you sure you want to delete these engagements? This action cannot be undone.'
            : 'Are you sure you want to archive these engagements? They will be hidden from the main list.'
        }
        confirmLabel={confirmationState.type === 'delete' ? 'Delete All' : 'Archive All'}
        isDestructive={confirmationState.type === 'delete'}
        isLoading={isBulkActionPending}
      />
    </div>
  );
}
