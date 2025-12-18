
import 'dotenv/config';
import { executeStressTestWorkflow } from '../src/workflows/stress-test-workflow.js';
import { EngagementRepository, HypothesisRepository } from '../src/repositories/index.js';

async function reproduce() {
    console.log('Starting stress test reproduction...');

    // Use a known engagement ID or find one
    const engRepo = new EngagementRepository();
    const hypRepo = new HypothesisRepository();

    // Find an engagement with hypotheses
    // For reproduction, we'll try to use a specific one if known, or just pick the first one
    // Using the one from previous turn: e9d2cfc1-cb54-49d7-bf6d-e36b256fd74c
    const engagementId = 'e9d2cfc1-cb54-49d7-bf6d-e36b256fd74c';

    const engagement = await engRepo.getById(engagementId);
    if (!engagement) {
        console.error('Engagement not found');
        process.exit(1);
    }

    console.log(`Found engagement: ${engagementId}`);

    // Ensure we have hypotheses
    const hypotheses = await hypRepo.getByEngagement(engagementId);
    if (hypotheses.length === 0) {
        console.log('No hypotheses found, cannot stress test.');
        process.exit(0);
    }

    console.log(`Found ${hypotheses.length} hypotheses. Running stress test...`);

    try {
        const result = await executeStressTestWorkflow({
            engagementId,
            config: {
                intensity: 'light', // Start light
                maxContradictionsPerHypothesis: 1
            },
            onEvent: (event) => console.log('Event:', event.type)
        });

        console.log('Stress test completed successfully (unexpected if crash reported)');
        console.log('Result summary:', result.summary);
    } catch (error) {
        console.error('Caught expected crash:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
    }

    process.exit(0);
}

reproduce().catch(err => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});
