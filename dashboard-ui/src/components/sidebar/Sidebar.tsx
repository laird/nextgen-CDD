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
} from 'lucide-react';

interface Engagement {
  id: string;
  name: string;
  status: 'active' | 'in_review' | 'completed' | 'draft';
  company: string;
}

interface SidebarProps {
  collapsed?: boolean;
  onNavigate?: (view: string) => void;
  currentView?: string;
}

// Mock data for engagements
const mockEngagements: Engagement[] = [
  { id: '1', name: 'TechCorp Acquisition', status: 'active', company: 'TechCorp Inc.' },
  { id: '2', name: 'HealthPlus Platform', status: 'in_review', company: 'HealthPlus Ltd.' },
  { id: '3', name: 'RetailMax Add-on', status: 'completed', company: 'RetailMax' },
  { id: '4', name: 'CloudScale Growth', status: 'draft', company: 'CloudScale' },
];

const statusIcons = {
  active: <Clock className="h-3 w-3 text-primary-500" />,
  in_review: <AlertTriangle className="h-3 w-3 text-yellow-500" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  draft: <FileText className="h-3 w-3 text-surface-400" />,
};

export function Sidebar({ collapsed = false, onNavigate, currentView = 'dashboard' }: SidebarProps) {
  const [engagementsExpanded, setEngagementsExpanded] = useState(true);

  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'research', icon: Search, label: 'Research' },
    { id: 'reports', icon: FileText, label: 'Reports' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
  ];

  const bottomItems = [
    { id: 'settings', icon: Settings, label: 'Settings' },
    { id: 'help', icon: HelpCircle, label: 'Help & Support' },
  ];

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
                ${
                  currentView === item.id
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

              {/* Engagement List */}
              {mockEngagements.map((engagement) => (
                <button
                  key={engagement.id}
                  onClick={() => onNavigate?.(`engagement-${engagement.id}`)}
                  className={`
                    flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm
                    text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700
                    ${currentView === `engagement-${engagement.id}` ? 'bg-surface-100 dark:bg-surface-700' : ''}
                  `}
                >
                  {statusIcons[engagement.status]}
                  <span className="truncate">{engagement.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

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
    </div>
  );
}
