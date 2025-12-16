/**
 * Reprocess all expert call transcripts to generate thesis alignment scores
 *
 * Usage: npx tsx scripts/reprocess-expert-calls.ts [engagementId]
 */

// Load environment variables
import 'dotenv/config';

import crypto from 'node:crypto';

// Make crypto available globally (some modules expect it)
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as unknown as { crypto: typeof crypto }).crypto = crypto;
}

import { getPool } from '../src/db/index.js';
import { ExpertCallRepository } from '../src/repositories/expert-call-repository.js';
import { createDealMemory, initializeMemorySystems } from '../src/memory/index.js';
import { processExpertCallTranscript } from '../src/workflows/index.js';

interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * Parse raw transcript text into segments
 */
function parseTranscript(transcript: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = transcript.split('\n').filter((line) => line.trim());

  const patterns = [
    /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?([^:\[\]]+?):\s*(.+)$/,
    /^\[([^\]]+)\]\s*(.+)$/,
  ];

  let currentTime = 0;
  const timeIncrement = 30000;

  for (const line of lines) {
    let speaker = 'Unknown';
    let text = line;
    let timestamp: string | undefined;

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        if (pattern === patterns[0] && match[1] && match[2] && match[3]) {
          timestamp = match[1];
          speaker = match[2].trim();
          text = match[3].trim();
        } else if (pattern === patterns[0] && match[2] && match[3]) {
          speaker = match[2].trim();
          text = match[3].trim();
        } else if (pattern === patterns[1] && match[1] && match[2]) {
          speaker = match[1].trim();
          text = match[2].trim();
        }
        break;
      }
    }

    if (timestamp) {
      const parts = timestamp.split(':').map(Number);
      if (parts.length === 2) {
        currentTime = ((parts[0] ?? 0) * 60 + (parts[1] ?? 0)) * 1000;
      } else if (parts.length === 3) {
        currentTime = ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;
      }
    }

    if (text.trim()) {
      segments.push({
        id: `segment_${segments.length}`,
        speaker,
        text: text.trim(),
        startTime: currentTime,
        endTime: currentTime + timeIncrement,
      });
      currentTime += timeIncrement;
    }
  }

  return segments;
}

/**
 * Get engagement thesis statement
 */
async function getEngagementThesis(engagementId: string): Promise<string | undefined> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT thesis, config FROM engagements WHERE id = $1',
    [engagementId]
  );

  if (rows.length === 0) return undefined;

  const row = rows[0] as { thesis?: unknown; config?: { thesis?: { statement?: string } } };

  // Parse thesis if it's a string
  const thesis = typeof row.thesis === 'string' ? JSON.parse(row.thesis) : row.thesis;

  // Try thesis column first, then config.thesis
  if (thesis && typeof thesis === 'object' && 'statement' in thesis) {
    return (thesis as { statement: string }).statement;
  }

  // Fallback to config.thesis
  if (row.config?.thesis?.statement) {
    return row.config.thesis.statement;
  }

  return undefined;
}

async function main() {
  const engagementIdFilter = process.argv[2];

  console.log('Initializing memory systems...');
  await initializeMemorySystems();
  console.log('Memory systems initialized.');

  const repo = new ExpertCallRepository();
  const pool = getPool();

  // Get all completed expert calls
  let query = `
    SELECT ec.id, ec.engagement_id, ec.transcript, ec.focus_areas
    FROM expert_calls ec
    WHERE ec.status = 'completed'
  `;
  const params: string[] = [];

  if (engagementIdFilter) {
    query += ' AND ec.engagement_id = $1';
    params.push(engagementIdFilter);
  }

  query += ' ORDER BY ec.created_at DESC';

  const { rows: calls } = await pool.query(query, params);

  console.log(`Found ${calls.length} completed expert calls to reprocess`);

  // Show engagement thesis info
  const engagementIds = [...new Set(calls.map((c: { engagement_id: string }) => c.engagement_id))];
  console.log(`\nChecking ${engagementIds.length} unique engagements for thesis statements...`);
  for (const eid of engagementIds) {
    const { rows: engRows } = await pool.query('SELECT id, target_company, thesis, config FROM engagements WHERE id = $1', [eid]);
    if (engRows.length > 0) {
      const eng = engRows[0] as { target_company: string; thesis: unknown; config: unknown };
      console.log(`  ${eid}: ${eng.target_company}`);
      console.log(`    thesis: ${JSON.stringify(eng.thesis)}`);
      console.log(`    config.thesis: ${JSON.stringify((eng.config as Record<string, unknown>)?.thesis)}`);
    }
  }
  console.log('');

  if (calls.length === 0) {
    console.log('No calls to reprocess.');
    process.exit(0);
  }

  let processed = 0;
  let failed = 0;

  for (const call of calls) {
    const { id, engagement_id, transcript, focus_areas } = call as {
      id: string;
      engagement_id: string;
      transcript: string;
      focus_areas?: string[];
    };

    console.log(`\nReprocessing call ${id} (engagement: ${engagement_id})...`);

    try {
      // Parse transcript
      const segments = parseTranscript(transcript);

      // Get deal memory
      const dealMemory = await createDealMemory(engagement_id);

      // Get thesis statement (optional - classification works without it)
      const thesisStatement = await getEngagementThesis(engagement_id);

      if (thesisStatement) {
        const thesisPreview = thesisStatement.length > 80
          ? thesisStatement.substring(0, 80) + '...'
          : thesisStatement;
        console.log(`  Thesis: "${thesisPreview}"`);
      } else {
        console.log(`  Thesis: (none defined - will classify based on general investment viability)`);
      }
      console.log(`  Segments: ${segments.length}`);

      // Reprocess
      const result = await processExpertCallTranscript({
        engagementId: engagement_id,
        callId: id,
        dealMemory,
        segments,
        ...(focus_areas ? { focusAreas: focus_areas } : {}),
        thesisStatement,
      });

      // Update the call with new results
      await repo.markCompleted(id, result as unknown as Record<string, unknown>);

      const alignment = result.thesisAlignment;
      const confidenceStr = Math.round(alignment.confidence * 100);
      console.log(`  Done - Sentiment: ${alignment.sentiment} (${confidenceStr}% confidence)`);
      console.log(`  Reasoning: ${alignment.reasoning}`);
      if (alignment.supportingPoints.length > 0) {
        console.log(`  Supporting: ${alignment.supportingPoints.slice(0, 2).join('; ')}`);
      }
      if (alignment.contradictingPoints.length > 0) {
        console.log(`  Contradicting: ${alignment.contradictingPoints.slice(0, 2).join('; ')}`);
      }

      processed++;
    } catch (error) {
      console.error(`  Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  }

  const skipped = calls.length - processed - failed;
  console.log(`\n========================================`);
  console.log(`Reprocessing complete!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped: ${skipped}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
