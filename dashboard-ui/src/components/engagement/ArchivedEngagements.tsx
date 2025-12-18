
import { useState } from 'react';
import {
    Building2,
    Calendar,
    User,
    Tag,
    RotateCcw,
    Search,
    Archive
} from 'lucide-react';
import { useEngagements, useUpdateEngagement } from '../../hooks/useEngagements';

interface ArchivedEngagementsProps {
    onNavigate?: (view: string) => void;
}

export function ArchivedEngagements({ onNavigate }: ArchivedEngagementsProps) {
    const { data, isLoading, error } = useEngagements({ status: 'archived' });
    const { mutate: updateEngagement, isPending: isUpdating } = useUpdateEngagement();
    const [searchTerm, setSearchTerm] = useState('');

    const handleReactivate = (engagementId: string, name: string) => {
        if (window.confirm(`Are you sure you want to reactivate "${name}"? It will appear in the main list again.`)) {
            updateEngagement({
                id: engagementId,
                data: { status: 'active' } // Or 'in_review' if you prefer, but 'active' implies current
            }, {
                onSuccess: () => {
                    // Optionally stay here or navigate to dashboard
                    // For now, let's just let the list update
                }
            });
        }
    };

    const archivedEngagements = data?.engagements || [];

    const filteredEngagements = archivedEngagements.filter(engagement =>
        (engagement.target_company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (engagement.sector || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-surface-50 dark:bg-surface-900">
            <div className="bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 p-6">
                <div className="max-w-6xl mx-auto">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg">
                            <Archive className="h-6 w-6" />
                        </div>
                        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
                            Archived Engagements
                        </h1>
                    </div>
                    <p className="text-surface-600 dark:text-surface-400 max-w-2xl">
                        View and manage past engagements. Reactivate projects that require additional work or review.
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto">
                    {/* Search Bar */}
                    <div className="mb-6 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
                        <input
                            type="text"
                            placeholder="Search archived engagements..."
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="text-surface-500 dark:text-surface-400">Loading archived engagements...</div>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 p-4 rounded-lg">
                            Failed to load archived engagements. Please try again.
                        </div>
                    ) : filteredEngagements.length === 0 ? (
                        <div className="text-center py-12 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
                            <Archive className="h-12 w-12 text-surface-300 dark:text-surface-600 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-surface-900 dark:text-white mb-2">
                                No archived engagements found
                            </h3>
                            <p className="text-surface-600 dark:text-surface-400">
                                {searchTerm ? 'Try adjusting your search terms' : 'Archived projects will appear here'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {filteredEngagements.map((engagement) => (
                                <div
                                    key={engagement.id}
                                    className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-6 flex items-center justify-between hover:shadow-sm transition-shadow"
                                >
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-surface-900 dark:text-white mb-2">
                                            {engagement.target_company || 'Unnamed Engagement'}
                                        </h3>
                                        <div className="flex flex-wrap gap-4 text-sm text-surface-600 dark:text-surface-400">
                                            <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4" />
                                                <span>{engagement.sector || 'Not specified'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4" />
                                                <span>Created {new Date(engagement.created_at || Date.now()).toLocaleDateString()}</span>
                                            </div>
                                            {engagement.deal_size && (
                                                <div className="flex items-center gap-2">
                                                    <Tag className="h-4 w-4" />
                                                    <span>${engagement.deal_size}M</span>
                                                </div>
                                            )}
                                            {engagement.lead_partner && (
                                                <div className="flex items-center gap-2">
                                                    <User className="h-4 w-4" />
                                                    <span>{engagement.lead_partner}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => handleReactivate(engagement.id, engagement.target_company || 'Unnamed Engagement')}
                                            disabled={isUpdating}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 dark:text-primary-400 dark:bg-primary-900/20 dark:hover:bg-primary-900/30 transition-colors"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                            Reactivate
                                        </button>
                                        <button
                                            onClick={() => onNavigate?.(`engagement-${engagement.id}`)}
                                            className="px-4 py-2 rounded-lg text-sm font-medium text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700 transition-colors"
                                        >
                                            View Details
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
