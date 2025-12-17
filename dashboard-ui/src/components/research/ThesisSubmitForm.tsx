/**
 * Form component for submitting investment thesis for research
 */
import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useStartResearch } from '../../hooks/useResearch';

interface ThesisSubmitFormProps {
  engagementId: string;
  initialThesis?: string;
  onSubmitSuccess?: (jobId: string) => void;
}

export function ThesisSubmitForm({ engagementId, initialThesis = '', onSubmitSuccess }: ThesisSubmitFormProps) {
  const [thesis, setThesis] = useState(initialThesis);
  const { mutate: startResearch, isPending, error } = useStartResearch();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!thesis.trim()) {
      return;
    }

    startResearch(
      { engagementId, thesis: thesis.trim() },
      {
        onSuccess: (data) => {
          setThesis('');
          if (onSubmitSuccess && data.job_id) {
            onSubmitSuccess(data.job_id);
          }
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="thesis"
          className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
        >
          Investment Thesis
        </label>
        <textarea
          id="thesis"
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Enter the investment thesis to validate (e.g., 'AI-powered healthcare platform will achieve $50M ARR by leveraging proprietary diagnostic algorithms')"
          rows={6}
          className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600
                   bg-white dark:bg-surface-800 text-surface-900 dark:text-white
                   placeholder-surface-400 dark:placeholder-surface-500
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                   resize-none"
          disabled={isPending}
        />
        <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
          Describe the core investment hypothesis you want to validate
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Failed to start research'}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !thesis.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                 bg-primary-600 hover:bg-primary-700 disabled:bg-surface-300 dark:disabled:bg-surface-700
                 text-white disabled:text-surface-500 dark:disabled:text-surface-500
                 font-medium transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Starting Research...
          </>
        ) : (
          <>
            <Search className="h-5 w-5" />
            Start Research
          </>
        )}
      </button>
    </form>
  );
}
