import { test, expect } from '@playwright/test';

test.describe('Research Workflow', () => {
    test('should execute full research workflow via UI', async ({ page }) => {
        // 1. Go to Home (Dashboard)
        await page.goto('/');

        // 2. Create New Engagement
        // Assuming there's a button "New Engagement" or similar
        // If not, we might need to rely on seed data. 
        // Let's try to create one if the UI supports it.
        // 2. Create New Engagement
        const createButton = page.getByRole('button', { name: 'New Engagement', exact: true });
        if (await createButton.isVisible()) {
            await createButton.click();
            // 2. Select Target (simulated by filling input in our current simple form)
            const targetInput = page.getByLabel(/Target Company/i);
            await targetInput.fill('Databricks');
            await expect(targetInput).toHaveValue('Databricks');
            await page.getByLabel(/Sector/i).selectOption('Technology');
            await page.getByRole('button', { name: /Create|Save/i }).click();

            // Verify creation
            await expect(page.getByRole('heading', { name: 'Databricks', level: 1 })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Research Workflow' })).toBeVisible();
        } else {
            // Fallback: Click the first engagement in the list (sidebar buttons)
            // Use a specific selector for engagement items in the sidebar
            // Assuming they are buttons with status icons
            await page.locator('nav button').filter({ hasText: /Databricks|Test Corp|Stripe/ }).first().click();
        }

        // 3. Navigate to Research Tab (It's a button in the main panel navigation)
        await page.getByRole('button', { name: 'Research Workflow' }).click();
        // Remove URL assertion as we use custom routing
        // await expect(page).toHaveURL...

        // 4. Input Thesis
        const thesisInput = page.getByRole('textbox', { name: /Investment Thesis/i });
        await expect(thesisInput).toBeVisible();
        await expect(thesisInput).toBeEnabled();

        // Short wait to ensure any initial state settling (like the useEffect we added) doesn't overwrite input
        await page.waitForTimeout(500);

        const thesisText = 'Databricks is the leader in the data lakehouse category, combining the best elements of data lakes and data warehouses, positioning it to dominate enterprise AI infrastructure.';
        await thesisInput.fill(thesisText);
        await expect(thesisInput).toHaveValue(thesisText);

        // 5. configuration (optional)
        // Check if there are configuration options like "Depth"
        const depthSelect = page.getByRole('combobox', { name: /Depth|Mode/i });
        if (await depthSelect.isVisible()) {
            await depthSelect.selectOption('standard');
        }

        // 6. Start Research
        const startButton = page.getByRole('button', { name: /Start Research|Run Analysis/i });
        await expect(startButton).toBeEnabled();
        await startButton.click();

        // 7. Verify Progress
        // Expect status to change to "Research Status: In Progress"
        await expect(page.getByText(/Research Status:/i)).toBeVisible();

        // 8. Wait for Completion
        // Look for "Research Status: Completed"
        await expect(page.getByText(/Research Status: Completed/i)).toBeVisible({ timeout: 600000 });

        // 9. Verify Results
        // Check for Key Findings
        await expect(page.getByText(/Key Findings/i)).toBeVisible();
        await expect(page.getByText(/Confidence:/i)).toBeVisible();

        // Check for Recommendations or Risks
        await expect(page.getByText(/Recommendations|Identified Risks/i).first()).toBeVisible();
    });
});
