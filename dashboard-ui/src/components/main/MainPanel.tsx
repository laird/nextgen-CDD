/**
 * Main panel component - displays different views based on current selection
 */
import { Briefcase } from 'lucide-react';
import { EngagementDetail } from '../engagement/EngagementDetail';
import { EngagementForm, type EngagementFormData } from '../engagement/EngagementForm';
import { ArchivedEngagements } from '../engagement/ArchivedEngagements';
import { SkillsPage } from '../skills';
import { useCreateEngagement } from '../../hooks/useEngagements';

interface MainPanelProps {
  currentView: string;
  onViewChange?: (view: string) => void;
}

export function MainPanel({ currentView, onViewChange }: MainPanelProps) {
  const { mutate: createEngagement, isPending } = useCreateEngagement();

  // Parse view to determine what to display

  const isNewEngagement = currentView === 'new-engagement';


  const handleCreateEngagement = (data: EngagementFormData) => {
    createEngagement(data, {
      onSuccess: (response) => {
        // Navigate to the newly created engagement
        if (onViewChange && response.engagement?.id) {
          // Force a small delay or ensure state update priority if needed, but standard should work.
          // Converting to string just to be safe if ID is number/string mismatch (though unlikely with TS)
          const newId = String(response.engagement.id);
          onViewChange(`engagement-${newId}`);
        } else {
          console.error('Failed to navigate to new engagement: ID missing', response);
        }
      },
      onError: (error) => {
        console.error('Failed to create engagement:', error);
      }
    });
  };

  const handleCancelCreate = () => {
    if (onViewChange) {
      onViewChange('dashboard');
    }
  };

  // New Engagement Form
  if (isNewEngagement) {
    return (
      <div className="h-full overflow-y-auto p-6 bg-surface-50 dark:bg-surface-900">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">
              Create New Engagement
            </h1>
            <p className="text-surface-600 dark:text-surface-400">
              Set up a new deal for thesis validation and research
            </p>
          </div>
          <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-6">
            <EngagementForm
              onSubmit={handleCreateEngagement}
              onCancel={handleCancelCreate}
              isSubmitting={isPending}
            />
          </div>
        </div>
      </div>
    );
  }

  // Engagement Detail View
  if (currentView.startsWith('engagement-')) {
    const engagementId = currentView.replace('engagement-', '');
    // Using key ensures clean remount when switching engagements
    return <EngagementDetail key={engagementId} engagementId={engagementId} onNavigate={onViewChange} />;
  }

  // Skills Library View
  if (currentView === 'skills') {
    return <SkillsPage />;
  }

  // Archived Engagements View
  if (currentView === 'archived-engagements') {
    return <ArchivedEngagements onNavigate={onViewChange} />;
  }

  // Dashboard/Default View
  return (
    <div className="h-full flex items-center justify-center bg-surface-50 dark:bg-surface-900">
      <div className="text-center max-w-md">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 mb-4">
          <Briefcase className="h-8 w-8 text-primary-600 dark:text-primary-400" />
        </div>
        <h2 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">
          Welcome to Thesis Validator
        </h2>
        <p className="text-surface-600 dark:text-surface-400 mb-6">
          Select an engagement from the sidebar to view details and run research, or create a new
          engagement to get started.
        </p>
        <button
          onClick={() => onViewChange?.('new-engagement')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors"
        >
          <Briefcase className="h-5 w-5" />
          Create New Engagement
        </button>
      </div>
    </div>
  );
}
