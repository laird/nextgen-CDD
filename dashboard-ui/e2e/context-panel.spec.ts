import { test, expect } from '@playwright/test';

const CLIENT_URL = 'http://localhost:5173';
const TEST_COMPANY = 'TechCorp Context Test'; // Use a specific name for this test

test.describe('Context Panel Features', () => {
    let engagementId: string;

    test.beforeAll(async ({ request }) => {
        // Create a fresh engagement for testing context features
        const newEngagement = await request.post('http://localhost:3000/api/v1/engagements', {
            data: {
                name: TEST_COMPANY,
                client_name: 'Context Client',
                deal_type: 'growth_equity',
                target_company: {
                    name: TEST_COMPANY,
                    sector: 'technology',
                    description: 'A tech company for testing context features'
                }
            }
        });
        const response = await newEngagement.json();
        engagementId = response.engagement.id;
        console.log(`Created engagement ${engagementId} for Context Panel tests`);

        // Create some seeded data
        // 1. Create a hypothesis
        const hypoRes = await request.post(`http://localhost:3000/api/v1/engagements/${engagementId}/hypotheses`, {
            data: {
                content: 'Test Hypothesis Node',
                status: 'supported',
                confidence: 0.9
            }
        });
        const hypoData = await hypoRes.json();
        const hypoId = hypoData.hypothesis.id;

        // 2. Create evidence
        const evRes = await request.post(`http://localhost:3000/api/v1/engagements/${engagementId}/evidence`, {
            data: {
                content: 'Strong supporting evidence',
                sourceType: 'web',
                url: 'http://example.com',
                confidence: 0.9,
                sentiment: 'supporting',
                credibility: 0.8
            }
        });
        const evData = await evRes.json();
        const evidenceId = evData.evidence.id;

        // 3. Link Evidence to Hypothesis
        await request.post(`http://localhost:3000/api/v1/engagements/${engagementId}/evidence/${evidenceId}/hypotheses`, {
            data: {
                hypothesisId: hypoId,
                relevanceScore: 0.9
            }
        });

        // 4. Create a contradiction
        await request.post(`http://localhost:3000/api/v1/engagements/${engagementId}/contradictions`, {
            data: {
                description: 'Test Contradiction Description',
                severity: 'medium',
                status: 'unresolved'
            }
        });
    });

    test.afterAll(async ({ request }) => {
        if (engagementId) {
            // Clean up
            await request.delete(`http://localhost:3000/api/v1/engagements/${engagementId}`);
        }
    });

    test('should display Contradictions tab and content', async ({ page }) => {
        // Create data is done in beforeAll, but we need to ensure the page fetches IT freshly
        await page.goto(`${CLIENT_URL}/engagements/${engagementId}`);

        // Wait for loading to finish
        await expect(page.getByText('Loading context...')).not.toBeVisible();

        // Check for Contradictions Tab
        const contradictionsTab = page.getByRole('button', { name: /Contradiction/i });
        await expect(contradictionsTab).toBeVisible();
        await contradictionsTab.click();

        // Check content using text filtering on a generic div container (most robust)
        const contradictionItem = page.locator('div').filter({ hasText: 'Test Contradiction Description' }).last();
        await expect(contradictionItem).toBeVisible();

        // Check status badge specifically within that item
        await expect(contradictionItem.getByText('unresolved')).toBeVisible();
    });

    test('should support interactive hypothesis filtering', async ({ page }) => {
        await page.goto(`${CLIENT_URL}/engagements/${engagementId}`);

        // Wait for loading to finish
        await expect(page.getByText('Loading context...')).not.toBeVisible();

        // Go to Hypotheses tab
        await page.getByRole('button', { name: 'Hypotheses' }).click();

        // Find and click the hypothesis
        const hypoNode = page.getByText('Test Hypothesis Node');
        await expect(hypoNode).toBeVisible({ timeout: 10000 });
        await hypoNode.click();

        // Go to Evidence tab
        await page.getByRole('button', { name: 'Evidence' }).click();

        // Expect "Filtered by selection" indicator
        await expect(page.getByText('Filtered by selection')).toBeVisible();

        // Expect the specific evidence to be visible
        await expect(page.getByText('Strong supporting evidence')).toBeVisible();

        // Clear filter
        await page.getByRole('button').filter({ has: page.locator('svg.lucide-x') }).click();

        // Expect filter indicator to disappear
        await expect(page.getByText('Filtered by selection')).not.toBeVisible();
    });
});
