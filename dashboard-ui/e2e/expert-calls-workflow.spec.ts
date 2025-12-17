/**
 * End-to-End Test: Expert Calls Workflow
 *
 * This test validates the complete user journey through the web UI:
 * 1. Create a new engagement for a target company
 * 2. Submit an investment thesis
 * 3. Upload expert call transcripts
 * 4. Wait for AI processing
 * 5. View thesis alignment results
 * 6. Verify the complete analysis
 *
 * Prerequisites:
 * - Backend server running on http://localhost:3000
 * - Frontend dev server running on http://localhost:5173
 * - API keys configured for LLM services
 *
 * Run with: npx playwright test e2e/expert-calls-workflow.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const TEST_COMPANY = 'DataFlow Analytics';
const TEST_SECTOR = 'Technology';
const INVESTMENT_THESIS = `DataFlow Analytics represents an attractive investment opportunity in the rapidly growing unified data analytics market.
The company has demonstrated strong product-market fit with 230% ARR growth over 24 months, reaching $42M ARR.
Key investment thesis points:
1. The unified analytics platform market is growing at 28% CAGR
2. Strong unit economics with 78% gross margins and 4.2x LTV/CAC ratio
3. Differentiated technology with proprietary ML models
4. Sticky customer base with 95%+ renewal rates`;

// Path to test transcripts
const TRANSCRIPT_DIR = path.join(__dirname, '../../thesis-validator/test-data/transcripts/dataflow');

// Helper to wait for processing to complete
async function waitForProcessing(page: Page, timeout = 180000) {
  // Wait for processing indicator to disappear
  await expect(page.locator('text=Processing')).toBeHidden({ timeout });
}

// Helper to upload a transcript file
async function uploadTranscript(page: Page, transcriptPath: string) {
  const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');

  // Click on Expert Calls tab
  await page.click('button:has-text("Expert Calls")');
  await page.waitForTimeout(500);

  // Find and fill the transcript textarea
  const textarea = page.locator('textarea[placeholder*="Paste transcript"]');
  await textarea.fill(transcriptContent);

  // Click process button
  await page.click('button:has-text("Process Transcript")');

  // Wait for processing to start
  await expect(page.locator('text=Processing')).toBeVisible({ timeout: 10000 });
}

test.describe('Expert Calls Workflow', () => {
  test.describe.configure({ mode: 'serial' }); // Run tests in order

  let engagementId: string;

  test.beforeAll(async () => {
    // Verify transcript files exist
    const files = fs.readdirSync(TRANSCRIPT_DIR).filter(f => f.endsWith('.txt'));
    expect(files.length).toBeGreaterThan(0);
    console.log(`Found ${files.length} transcript files for testing`);
  });

  test('should create a new engagement', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');

    // Wait for app to load
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 });

    // Click "New Engagement" button
    await page.click('button:has-text("New Engagement")');

    // Wait for form to appear
    await expect(page.locator('input#target_company')).toBeVisible();

    // Fill in engagement form
    await page.fill('input#target_company', TEST_COMPANY);
    await page.fill('input#sector', TEST_SECTOR);

    // Optional: fill description
    const descriptionInput = page.locator('textarea#description');
    if (await descriptionInput.isVisible()) {
      await descriptionInput.fill('E2E test engagement for DataFlow Analytics due diligence');
    }

    // Submit the form
    await page.click('button[type="submit"]:has-text("Create"), button[type="submit"]:has-text("Save")');

    // Wait for navigation to engagement detail
    await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]+/, { timeout: 10000 });

    // Extract engagement ID from URL
    const url = page.url();
    const match = url.match(/\/engagements\/([a-f0-9-]+)/);
    expect(match).toBeTruthy();
    engagementId = match![1]!;

    console.log(`Created engagement: ${engagementId}`);

    // Verify engagement is shown
    await expect(page.locator(`text=${TEST_COMPANY}`)).toBeVisible();
  });

  test('should submit investment thesis', async ({ page }) => {
    // Navigate to the engagement
    await page.goto(`/engagements/${engagementId}`);

    // Wait for page to load
    await expect(page.locator(`text=${TEST_COMPANY}`)).toBeVisible({ timeout: 10000 });

    // Click on Research tab
    await page.click('button:has-text("Research")');

    // Find thesis textarea
    const thesisInput = page.locator('textarea#thesis, textarea[placeholder*="thesis"]');
    await expect(thesisInput).toBeVisible();

    // Fill in the investment thesis
    await thesisInput.fill(INVESTMENT_THESIS);

    // Submit thesis / Start research
    await page.click('button:has-text("Start Research"), button:has-text("Submit")');

    // Verify thesis was submitted - research should start or thesis should be saved
    await expect(
      page.locator('text=Research in progress, text=queued, text=Thesis submitted').first()
    ).toBeVisible({ timeout: 30000 });

    console.log('Investment thesis submitted');
  });

  test('should upload first expert call transcript', async ({ page }) => {
    const transcriptFiles = fs.readdirSync(TRANSCRIPT_DIR)
      .filter(f => f.endsWith('.txt'))
      .sort();

    const firstTranscript = path.join(TRANSCRIPT_DIR, transcriptFiles[0]!);
    const transcriptContent = fs.readFileSync(firstTranscript, 'utf-8');

    // Navigate to the engagement
    await page.goto(`/engagements/${engagementId}`);
    await expect(page.locator(`text=${TEST_COMPANY}`)).toBeVisible({ timeout: 10000 });

    // Click on Expert Calls tab
    await page.click('button:has-text("Expert Calls")');

    // Wait for Expert Calls panel to load
    await expect(page.locator('text=Upload a transcript, text=Expert Call')).toBeVisible({ timeout: 5000 });

    // Find the transcript input area
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // Fill in the transcript
    await textarea.fill(transcriptContent);

    // Click process button
    const processButton = page.locator('button:has-text("Process"), button:has-text("Upload"), button:has-text("Submit")').first();
    await processButton.click();

    // Wait for processing to start
    await expect(page.locator('text=Processing, text=Analyzing').first()).toBeVisible({ timeout: 10000 });

    console.log(`Uploaded transcript: ${transcriptFiles[0]}`);

    // Wait for processing to complete (up to 3 minutes)
    await expect(page.locator('text=Processing, text=Analyzing').first()).toBeHidden({ timeout: 180000 });

    // Verify call appears in history with sentiment
    await expect(
      page.locator('text=Supporting, text=Neutral, text=Contradicting').first()
    ).toBeVisible({ timeout: 10000 });

    console.log('First transcript processed successfully');
  });

  test('should upload remaining expert call transcripts', async ({ page }) => {
    const transcriptFiles = fs.readdirSync(TRANSCRIPT_DIR)
      .filter(f => f.endsWith('.txt'))
      .sort()
      .slice(1); // Skip first one already uploaded

    // Navigate to the engagement
    await page.goto(`/engagements/${engagementId}`);
    await expect(page.locator(`text=${TEST_COMPANY}`)).toBeVisible({ timeout: 10000 });

    // Click on Expert Calls tab
    await page.click('button:has-text("Expert Calls")');

    for (const filename of transcriptFiles) {
      const transcriptPath = path.join(TRANSCRIPT_DIR, filename);
      const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');

      console.log(`Uploading transcript: ${filename}`);

      // Find the transcript input
      const textarea = page.locator('textarea').first();
      await textarea.fill(transcriptContent);

      // Click process button
      const processButton = page.locator('button:has-text("Process"), button:has-text("Upload"), button:has-text("Submit")').first();
      await processButton.click();

      // Wait for processing to start
      await expect(page.locator('text=Processing, text=Analyzing').first()).toBeVisible({ timeout: 10000 });

      // Wait for processing to complete (up to 3 minutes per transcript)
      await expect(page.locator('text=Processing, text=Analyzing').first()).toBeHidden({ timeout: 180000 });

      console.log(`Processed: ${filename}`);

      // Small delay between uploads
      await page.waitForTimeout(1000);
    }

    console.log('All transcripts uploaded');
  });

  test('should display thesis alignment results', async ({ page }) => {
    // Navigate to the engagement
    await page.goto(`/engagements/${engagementId}`);
    await expect(page.locator(`text=${TEST_COMPANY}`)).toBeVisible({ timeout: 10000 });

    // Click on Expert Calls tab
    await page.click('button:has-text("Expert Calls")');

    // Wait for call history to load
    await page.waitForTimeout(2000);

    // Verify we have multiple calls displayed
    const callCards = page.locator('[class*="border-l-4"]');
    const callCount = await callCards.count();
    console.log(`Found ${callCount} expert calls in history`);
    expect(callCount).toBeGreaterThan(0);

    // Verify sentiment colors are displayed
    const supportingCalls = page.locator('[class*="border-l-green"]');
    const neutralCalls = page.locator('[class*="border-l-surface"], [class*="border-l-gray"]');
    const contradictingCalls = page.locator('[class*="border-l-red"]');

    const supportingCount = await supportingCalls.count();
    const neutralCount = await neutralCalls.count();
    const contradictingCount = await contradictingCalls.count();

    console.log('Thesis Alignment Distribution:');
    console.log(`  Supporting: ${supportingCount}`);
    console.log(`  Neutral: ${neutralCount}`);
    console.log(`  Contradicting: ${contradictingCount}`);

    // Expect at least some calls classified
    expect(supportingCount + neutralCount + contradictingCount).toBeGreaterThan(0);
  });

  test('should view detailed call results', async ({ page }) => {
    // Navigate to the engagement
    await page.goto(`/engagements/${engagementId}`);
    await expect(page.locator(`text=${TEST_COMPANY}`)).toBeVisible({ timeout: 10000 });

    // Click on Expert Calls tab
    await page.click('button:has-text("Expert Calls")');

    // Wait for calls to load
    await page.waitForTimeout(2000);

    // Click on the first completed call
    const firstCall = page.locator('[class*="border-l-4"]').first();
    await firstCall.click();

    // Wait for results to display
    await page.waitForTimeout(1000);

    // Verify key result sections are visible
    await expect(page.locator('text=Executive Summary, text=Call Summary').first()).toBeVisible({ timeout: 10000 });

    // Verify thesis alignment banner
    const alignmentBanner = page.locator('text=Supporting, text=Neutral, text=Contradicting').first();
    await expect(alignmentBanner).toBeVisible();

    // Verify confidence score is displayed
    await expect(page.locator('text=/\\d+%.*confidence/')).toBeVisible();

    // Verify key insights section
    await expect(page.locator('text=Key Insights, text=Insights').first()).toBeVisible();

    // Verify expert profiles section
    await expect(page.locator('text=Expert Profile, text=Profiles').first()).toBeVisible();

    console.log('Call detail view validated');
  });

  test('should show aggregated insights across all calls', async ({ page }) => {
    // Navigate to the engagement
    await page.goto(`/engagements/${engagementId}`);
    await expect(page.locator(`text=${TEST_COMPANY}`)).toBeVisible({ timeout: 10000 });

    // Click on Expert Calls tab
    await page.click('button:has-text("Expert Calls")');

    // Wait for calls to load
    await page.waitForTimeout(2000);

    // Count total calls
    const callCards = page.locator('[class*="border-l-4"]');
    const totalCalls = await callCards.count();

    // Click through each call and count insights
    let totalInsights = 0;
    let totalSupportingPoints = 0;
    let totalContradictingPoints = 0;

    for (let i = 0; i < Math.min(totalCalls, 3); i++) {
      // Click on call
      await callCards.nth(i).click();
      await page.waitForTimeout(1000);

      // Count insights on this page
      const insightItems = page.locator('[class*="insight"], [data-testid="insight"]');
      const insightCount = await insightItems.count();
      totalInsights += insightCount;

      // Count supporting/contradicting points
      const supportingPoints = page.locator('text=Supporting Point, [class*="text-green"]');
      const contradictingPoints = page.locator('text=Contradicting Point, [class*="text-red"]');

      totalSupportingPoints += await supportingPoints.count();
      totalContradictingPoints += await contradictingPoints.count();
    }

    console.log('========================================');
    console.log('EXPERT CALL ANALYSIS SUMMARY');
    console.log('========================================');
    console.log(`Company: ${TEST_COMPANY}`);
    console.log(`Total Calls: ${totalCalls}`);
    console.log(`Total Insights (sampled): ${totalInsights}`);
    console.log(`Supporting Points (sampled): ${totalSupportingPoints}`);
    console.log(`Contradicting Points (sampled): ${totalContradictingPoints}`);
    console.log('========================================');

    // Verify we have substantial analysis output
    expect(totalCalls).toBeGreaterThan(0);
  });

  test.afterAll(async ({ browser }) => {
    // Clean up - optionally delete the test engagement
    // For now, leave it for manual inspection
    console.log(`\nTest engagement ID: ${engagementId}`);
    console.log('View at: http://localhost:5173/engagements/' + engagementId);
  });
});
