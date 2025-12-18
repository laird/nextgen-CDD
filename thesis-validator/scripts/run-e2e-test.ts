#!/usr/bin/env npx tsx
/**
 * E2E Test Runner: Expert Calls Workflow
 *
 * This script orchestrates the complete E2E test:
 * 1. Picks a real company
 * 2. Generates synthetic expert call transcripts using AI
 * 3. Runs Playwright test that uses the web UI to:
 *    - Create an engagement
 *    - Submit investment thesis
 *    - Upload expert call transcripts
 *    - View and verify results
 *
 * Usage: npx tsx scripts/run-e2e-test.ts [company_name]
 *
 * If no company name is provided, it will pick a random company from a preset list.
 */

import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of real companies to test with
const TEST_COMPANIES = [
  'Cloudflare',
  'Datadog',
  'MongoDB',
  'Snowflake',
  'CrowdStrike',
  'Palantir',
  'ServiceNow',
  'Twilio',
  'Okta',
  'Atlassian',
];

interface TestResult {
  company: string;
  transcriptsGenerated: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  playwrightResult?: {
    passed: number;
    failed: number;
    output: string;
  };
  success: boolean;
  error?: string;
}

/**
 * Pick a random company from the list
 */
function pickRandomCompany(): string {
  const index = Math.floor(Math.random() * TEST_COMPANIES.length);
  return TEST_COMPANIES[index]!;
}

/**
 * Generate synthetic transcripts
 */
async function generateTranscripts(company: string, outputDir: string): Promise<number> {
  console.log('\n[Step 1] Generating synthetic expert call transcripts...');
  console.log(`Company: ${company}`);
  console.log(`Output: ${outputDir}`);

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'e2e-generate-transcripts.ts');
    const child = spawn('npx', ['tsx', scriptPath, company, outputDir], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      if (code === 0) {
        // Count generated transcripts
        const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.txt') && !f.includes('thesis'));
        resolve(files.length);
      } else {
        reject(new Error(`Transcript generation failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Update the Playwright test config with generated data
 */
function updatePlaywrightTestConfig(company: string, transcriptDir: string): void {
  console.log('\n[Step 2] Updating Playwright test configuration...');

  const manifestPath = path.join(transcriptDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const configPath = path.join(__dirname, '../../dashboard-ui/e2e/e2e-test-config.json');
  const config = {
    company: manifest.companyName,
    sector: 'Technology', // Default sector for all test companies
    investmentThesis: manifest.investmentThesis,
    transcriptDir: transcriptDir,
    transcripts: manifest.transcripts,
    generatedAt: manifest.generatedAt,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Config saved: ${configPath}`);
}

/**
 * Run Playwright test
 */
async function runPlaywrightTest(): Promise<{ passed: number; failed: number; output: string }> {
  console.log('\n[Step 3] Running Playwright E2E test...');

  return new Promise((resolve, reject) => {
    const dashboardDir = path.join(__dirname, '../../dashboard-ui');
    let output = '';

    const child = spawn('npx', ['playwright', 'test', 'e2e/expert-calls-workflow.spec.ts', '--reporter=list'], {
      cwd: dashboardDir,
      env: process.env,
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      // Parse results from output
      const passedMatch = output.match(/(\d+) passed/);
      const failedMatch = output.match(/(\d+) failed/);

      resolve({
        passed: passedMatch ? parseInt(passedMatch[1]!, 10) : 0,
        failed: failedMatch ? parseInt(failedMatch[1]!, 10) : (code !== 0 ? 1 : 0),
        output,
      });
    });

    child.on('error', reject);
  });
}

/**
 * Generate test report
 */
function generateReport(result: TestResult): void {
  console.log('\n' + '='.repeat(70));
  console.log('E2E TEST REPORT');
  console.log('='.repeat(70));
  console.log(`Company: ${result.company}`);
  console.log(`Start Time: ${result.startTime.toISOString()}`);
  console.log(`End Time: ${result.endTime?.toISOString()}`);
  console.log(`Duration: ${result.duration ? (result.duration / 1000).toFixed(1) + 's' : 'N/A'}`);
  console.log(`Transcripts Generated: ${result.transcriptsGenerated}`);
  console.log('-'.repeat(70));

  if (result.playwrightResult) {
    console.log('Playwright Results:');
    console.log(`  Passed: ${result.playwrightResult.passed}`);
    console.log(`  Failed: ${result.playwrightResult.failed}`);
  }

  console.log('-'.repeat(70));
  console.log(`Overall Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }
  console.log('='.repeat(70));

  // Save report to file
  const reportDir = path.join(__dirname, '../test-results');
  fs.mkdirSync(reportDir, { recursive: true });

  const reportPath = path.join(reportDir, `e2e-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const company = args[0] || pickRandomCompany();

  const result: TestResult = {
    company,
    transcriptsGenerated: 0,
    startTime: new Date(),
    success: false,
  };

  console.log('='.repeat(70));
  console.log('E2E Test: Expert Calls Workflow');
  console.log('='.repeat(70));
  console.log(`Selected Company: ${company}`);
  console.log(`Time: ${result.startTime.toISOString()}`);
  console.log('='.repeat(70));

  try {
    // Create output directory for this test run
    const testRunId = `e2e-${Date.now()}`;
    const transcriptDir = path.join(__dirname, `../test-data/transcripts/${testRunId}`);

    // Step 1: Generate synthetic transcripts
    result.transcriptsGenerated = await generateTranscripts(company, transcriptDir);
    console.log(`\nGenerated ${result.transcriptsGenerated} synthetic transcripts`);

    // Step 2: Update Playwright test config
    updatePlaywrightTestConfig(company, transcriptDir);

    // Step 3: Run Playwright test
    result.playwrightResult = await runPlaywrightTest();

    result.success = result.playwrightResult.failed === 0;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error('\nTest failed with error:', result.error);
  }

  result.endTime = new Date();
  result.duration = result.endTime.getTime() - result.startTime.getTime();

  generateReport(result);

  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
