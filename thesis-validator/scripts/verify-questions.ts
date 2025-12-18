import 'dotenv/config';
import { EngagementRepository } from '../src/repositories/index.js';
import { getPool } from '../src/db/index.js';

const engagementId = 'e9d2cfc1-cb54-49d7-bf6d-e36b256fd74c';

async function main() {
    const repo = new EngagementRepository();
    const engagement = await repo.getById(engagementId);

    if (!engagement) {
        console.error(`Engagement ${engagementId} not found`);
        process.exit(1);
    }

    console.log('Current thesis:', engagement.thesis);

    const questions = [
        'What are the primary drivers of customer churn in the SMB segment?',
        'How does the competitive landscape differ in the EMEA region?',
        'Can we validate the projected 20% growth in recurring revenue?',
        'What is the true cost of customer acquisition across different channels?'
    ];

    await repo.update(engagementId, {
        thesis: {
            statement: engagement.thesis?.statement || 'Default Thesis Statement',
            submitted_at: engagement.thesis?.submitted_at || Date.now(),
            key_questions: questions
        }
    });

    console.log('Updated engagement with key questions');
    process.exit(0);
}

main().catch(console.error);
