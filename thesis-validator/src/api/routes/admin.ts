
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getResearchQueue } from '../../services/job-queue.js';


/**
 * Register admin routes
 */
export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
    const researchQueue = getResearchQueue();

    /**
     * GET /admin/queues/research
     * Get research queue statistics and jobs
     */
    fastify.get(
        '/queues/research',
        {
            // preHandler: [requireRole('admin')], // Optional: Secure this endpoint
        },
        async (request: FastifyRequest<{ Querystring: { status?: string; includeJobs?: boolean } }>, reply: FastifyReply) => {
            try {
                const counts = await researchQueue.getQueueCounts();

                let jobs: any[] = [];
                if (request.query.includeJobs || request.query.status) {
                    // Default to 'active' if status not provided but jobs requested
                    const status = (request.query.status as any) || 'active';
                    jobs = await researchQueue.getJobs(status);
                }

                reply.send({
                    success: true,
                    queue: 'research-jobs',
                    counts,
                    jobs: jobs.length > 0 ? jobs : undefined
                });
            } catch (error) {
                request.log.error(error);
                reply.status(500).send({
                    error: 'Internal Server Error',
                    message: 'Failed to retrieve queue stats',
                });
            }
        }
    );
}
