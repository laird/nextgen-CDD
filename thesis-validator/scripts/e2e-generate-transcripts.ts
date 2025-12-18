#!/usr/bin/env npx tsx
/**
 * E2E Test: Synthetic Expert Call Transcript Generator
 *
 * This script generates synthetic expert call transcripts for E2E testing.
 * All transcripts are clearly marked as synthetic and use "Test" as the first name
 * of all interviewees.
 *
 * Usage: npx tsx scripts/e2e-generate-transcripts.ts <company_name> <output_dir>
 *
 * Example: npx tsx scripts/e2e-generate-transcripts.ts "Cloudflare" ./test-data/transcripts/e2e
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLLMProvider, getLLMProviderConfig, type LLMResponse } from '../src/services/llm-provider.js';

// Load environment variables
import 'dotenv/config';

// Expert role templates for generating diverse perspectives
const EXPERT_ROLES = [
  {
    role: 'Industry Analyst',
    firstName: 'Test',
    lastName: 'Anderson',
    title: 'Senior Technology Analyst',
    firm: 'Test Research Group',
    perspective: 'industry trends, market dynamics, competitive landscape',
    sentiment: 'balanced',
  },
  {
    role: 'Enterprise Customer',
    firstName: 'Test',
    lastName: 'Baker',
    title: 'VP of Engineering',
    firm: 'Test Corp (Fortune 500)',
    perspective: 'product experience, implementation challenges, ROI',
    sentiment: 'positive',
  },
  {
    role: 'Financial Analyst',
    firstName: 'Test',
    lastName: 'Chen',
    title: 'Equity Research Analyst',
    firm: 'Test Capital Markets',
    perspective: 'financial performance, valuation, growth metrics',
    sentiment: 'analytical',
  },
  {
    role: 'Competitor Executive',
    firstName: 'Test',
    lastName: 'Davis',
    title: 'Former VP of Product',
    firm: 'Competing Company',
    perspective: 'competitive threats, product differentiation, market share',
    sentiment: 'critical',
  },
  {
    role: 'Developer Advocate',
    firstName: 'Test',
    lastName: 'Evans',
    title: 'Developer Relations Lead',
    firm: 'Test Tech Company',
    perspective: 'developer ecosystem, adoption patterns, technical capabilities',
    sentiment: 'enthusiastic',
  },
  {
    role: 'Skeptical Investor',
    firstName: 'Test',
    lastName: 'Foster',
    title: 'Hedge Fund Portfolio Manager',
    firm: 'Test Capital Management',
    perspective: 'valuation concerns, risk factors, bear case arguments',
    sentiment: 'skeptical',
  },
];

interface GeneratedTranscript {
  filename: string;
  content: string;
  role: string;
  sentiment: string;
}

/**
 * Generate a synthetic expert call transcript using the LLM
 */
async function generateTranscript(
  companyName: string,
  expertRole: typeof EXPERT_ROLES[0],
  investmentThesis: string
): Promise<string> {
  const provider = await getLLMProvider();

  const systemPrompt = `You are generating a SYNTHETIC expert call transcript for E2E testing purposes.
This transcript will be used to test an investment research analysis system.

CRITICAL REQUIREMENTS:
1. The VERY FIRST LINE must be exactly: "SYNTHETIC TEST TRANSCRIPT. DO NOT USE."
2. The interviewee's first name MUST be "${expertRole.firstName}" (it's a test name)
3. Make the transcript realistic with back-and-forth Q&A format
4. Include specific data points, numbers, and concrete examples
5. The perspective should reflect the expert's role: ${expertRole.role}
6. The overall sentiment should be: ${expertRole.sentiment}
7. Length: 400-600 words of dialogue

FORMAT:
SYNTHETIC TEST TRANSCRIPT. DO NOT USE.
Expert Call Transcript - [Topic]
Date: December 15, 2024
Interviewee: ${expertRole.firstName} ${expertRole.lastName}, ${expertRole.title} at ${expertRole.firm}

Interviewer: [Question]

${expertRole.firstName}: [Response]

[Continue Q&A format]`;

  const userPrompt = `Generate a synthetic expert call transcript about ${companyName} from the perspective of a ${expertRole.role}.

The interviewer is conducting due diligence on ${companyName} as part of investment research.

Investment Thesis Context:
${investmentThesis}

The expert (${expertRole.firstName} ${expertRole.lastName}) should discuss:
- ${expertRole.perspective}
- Their direct experience or knowledge related to ${companyName}
- Specific data points, metrics, or examples
- Both strengths and concerns (weighted by sentiment: ${expertRole.sentiment})

Generate the complete transcript now:`;

  try {
    const response: LLMResponse = await provider.createMessage({
      model: provider.getModel(),
      maxTokens: 2000,
      temperature: 0.8,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extract text content from response
    const textContent = response.content.find(block => block.type === 'text');
    if (textContent && textContent.type === 'text') {
      return textContent.text;
    }
    throw new Error('No text content in LLM response');
  } catch (error) {
    console.error(`Error generating transcript for ${expertRole.role}:`, error);
    throw error;
  }
}

/**
 * Generate a simple investment thesis for the company
 */
async function generateInvestmentThesis(companyName: string): Promise<string> {
  const provider = await getLLMProvider();

  const response = await provider.createMessage({
    model: provider.getModel(),
    maxTokens: 500,
    temperature: 0.7,
    system: 'You are an investment analyst. Generate a concise investment thesis (3-5 key points) for the given company. Focus on market position, growth drivers, competitive advantages, and key risks.',
    messages: [{ role: 'user', content: `Generate a brief investment thesis for ${companyName}:` }],
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (textContent && textContent.type === 'text') {
    return textContent.text;
  }
  throw new Error('No text content in LLM response');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/e2e-generate-transcripts.ts <company_name> <output_dir>');
    console.error('Example: npx tsx scripts/e2e-generate-transcripts.ts "Cloudflare" ./test-data/transcripts/e2e');
    process.exit(1);
  }

  const companyName = args[0]!;
  const outputDir = args[1]!;

  console.log('='.repeat(60));
  console.log('E2E Test: Synthetic Expert Call Transcript Generator');
  console.log('='.repeat(60));
  console.log(`Company: ${companyName}`);
  console.log(`Output Directory: ${outputDir}`);
  console.log(`LLM Provider: ${getLLMProviderConfig().provider}`);
  console.log('='.repeat(60));

  // Create output directory
  const fullOutputDir = path.resolve(outputDir);
  fs.mkdirSync(fullOutputDir, { recursive: true });

  // Generate investment thesis first
  console.log('\n[1/7] Generating investment thesis...');
  const investmentThesis = await generateInvestmentThesis(companyName);

  // Save thesis to file
  const thesisPath = path.join(fullOutputDir, 'investment-thesis.txt');
  fs.writeFileSync(thesisPath, `Investment Thesis for ${companyName}\n${'='.repeat(40)}\n\n${investmentThesis}`);
  console.log(`    Saved: ${thesisPath}`);

  // Generate transcripts for each expert role
  const generatedTranscripts: GeneratedTranscript[] = [];

  for (let i = 0; i < EXPERT_ROLES.length; i++) {
    const role = EXPERT_ROLES[i]!;
    const num = String(i + 1).padStart(2, '0');
    const filename = `${num}-${role.role.toLowerCase().replace(/\s+/g, '-')}.txt`;

    console.log(`\n[${i + 2}/${EXPERT_ROLES.length + 1}] Generating transcript: ${role.role}...`);

    try {
      const transcript = await generateTranscript(companyName, role, investmentThesis);

      // Ensure the transcript starts with the required warning
      let finalTranscript = transcript;
      if (!transcript.startsWith('SYNTHETIC TEST TRANSCRIPT')) {
        finalTranscript = `SYNTHETIC TEST TRANSCRIPT. DO NOT USE.\n\n${transcript}`;
      }

      // Save transcript
      const transcriptPath = path.join(fullOutputDir, filename);
      fs.writeFileSync(transcriptPath, finalTranscript);
      console.log(`    Saved: ${transcriptPath}`);
      console.log(`    Sentiment: ${role.sentiment}`);

      generatedTranscripts.push({
        filename,
        content: finalTranscript,
        role: role.role,
        sentiment: role.sentiment,
      });
    } catch (error) {
      console.error(`    ERROR: Failed to generate transcript for ${role.role}`);
      console.error(`    ${error}`);
    }
  }

  // Generate manifest file for the E2E test to consume
  const manifest = {
    companyName,
    generatedAt: new Date().toISOString(),
    investmentThesis,
    transcripts: generatedTranscripts.map(t => ({
      filename: t.filename,
      role: t.role,
      sentiment: t.sentiment,
    })),
  };

  const manifestPath = path.join(fullOutputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('Generation Complete!');
  console.log('='.repeat(60));
  console.log(`Thesis: ${thesisPath}`);
  console.log(`Transcripts: ${generatedTranscripts.length}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log('='.repeat(60));

  return manifest;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
