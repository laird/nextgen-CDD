/**
 * Expert Call Routes
 *
 * REST API endpoints for expert call transcript processing and analysis
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  authHook,
  requireEngagementAccess,
} from '../middleware/index.js';
import {
  ExpertCallRepository,
  type ExpertCallStatus,
} from '../../repositories/index.js';
import { getPool } from '../../db/index.js';
import { createDealMemory } from '../../memory/index.js';
import { processExpertCallTranscript } from '../../workflows/index.js';
import type { TranscriptSegment } from '../../tools/transcript-processor.js';
import {
  createExpertCallStartedEvent,
  createExpertCallEndedEvent,
} from '../../models/index.js';
import { publishEvent } from '../websocket/events.js';

const expertCallRepo = new ExpertCallRepository();

/**
 * Parse call date from transcript header/metadata
 * Looks for common date patterns in the first few lines
 * Returns ISO date string or null if not found
 */
function parseCallDateFromTranscript(transcript: string): string | null {
  // Only look at the first 20 lines for metadata
  const headerLines = transcript.split('\n').slice(0, 20);

  // Patterns to match date lines
  const dateLinePatterns = [
    /^(?:date|recorded|call date|interview date|meeting date)\s*:\s*(.+)$/i,
    /^(?:date|recorded)\s+(.+)$/i,
  ];

  for (const line of headerLines) {
    const trimmedLine = line.trim();

    for (const pattern of dateLinePatterns) {
      const match = trimmedLine.match(pattern);
      if (match && match[1]) {
        const dateStr = match[1].trim();
        const parsedDate = parseDateString(dateStr);
        if (parsedDate) {
          return parsedDate.toISOString();
        }
      }
    }
  }

  return null;
}

/**
 * Parse various date string formats into a Date object
 */
function parseDateString(dateStr: string): Date | null {
  // Try direct parsing first (handles ISO formats, etc.)
  const directParse = new Date(dateStr);
  if (!isNaN(directParse.getTime()) && directParse.getFullYear() > 1990) {
    return directParse;
  }

  // Month name patterns: "December 2024", "December 15, 2024", "Dec 15, 2024"
  const monthNamePattern = /^([a-z]+)\s+(\d{1,2})?,?\s*(\d{4})$/i;
  const monthMatch = dateStr.match(monthNamePattern);
  if (monthMatch) {
    const monthName = monthMatch[1]!;
    const day = monthMatch[2] ? parseInt(monthMatch[2], 10) : 15; // Default to mid-month
    const year = parseInt(monthMatch[3]!, 10);

    const monthIndex = getMonthIndex(monthName);
    if (monthIndex !== -1) {
      return new Date(year, monthIndex, day, 12, 0, 0); // Noon to avoid timezone issues
    }
  }

  // Try "Month Day, Year" format: "December 15, 2024"
  const monthDayYearPattern = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i;
  const mdyMatch = dateStr.match(monthDayYearPattern);
  if (mdyMatch) {
    const monthName = mdyMatch[1]!;
    const day = parseInt(mdyMatch[2]!, 10);
    const year = parseInt(mdyMatch[3]!, 10);

    const monthIndex = getMonthIndex(monthName);
    if (monthIndex !== -1) {
      return new Date(year, monthIndex, day, 12, 0, 0);
    }
  }

  // US format: MM/DD/YYYY or M/D/YYYY
  const usPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const usMatch = dateStr.match(usPattern);
  if (usMatch) {
    const month = parseInt(usMatch[1]!, 10) - 1;
    const day = parseInt(usMatch[2]!, 10);
    const year = parseInt(usMatch[3]!, 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  // ISO-like: YYYY-MM-DD
  const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = dateStr.match(isoPattern);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]!, 10);
    const month = parseInt(isoMatch[2]!, 10) - 1;
    const day = parseInt(isoMatch[3]!, 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  return null;
}

/**
 * Get month index (0-11) from month name
 */
function getMonthIndex(monthName: string): number {
  const months: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };
  return months[monthName.toLowerCase()] ?? -1;
}

/**
 * Parsed metadata from transcript content and filename
 */
interface TranscriptMetadata {
  intervieweeName?: string | undefined;
  intervieweeTitle?: string | undefined;
  callDate?: string | undefined;
}

/**
 * Common job titles for matching
 */
const JOB_TITLES = [
  'CEO', 'CFO', 'CTO', 'COO', 'CMO', 'CRO', 'CHRO', 'CIO', 'CSO',
  'Chief Executive Officer', 'Chief Financial Officer', 'Chief Technology Officer',
  'Chief Operating Officer', 'Chief Marketing Officer', 'Chief Revenue Officer',
  'President', 'Vice President', 'VP', 'SVP', 'EVP',
  'Director', 'Senior Director', 'Managing Director',
  'Manager', 'Senior Manager', 'General Manager',
  'Partner', 'Managing Partner', 'Senior Partner',
  'Analyst', 'Senior Analyst', 'Principal', 'Associate',
  'Consultant', 'Senior Consultant', 'Managing Consultant',
  'Engineer', 'Senior Engineer', 'Staff Engineer', 'Principal Engineer',
  'Founder', 'Co-Founder', 'Owner',
  'Head of', 'Lead', 'Senior',
];

/**
 * Parse interviewee metadata from transcript content
 * Looks for patterns like:
 * - "Interviewee: John Smith, CEO at Acme Corp"
 * - "Expert: Jane Doe (VP Engineering, TechCo)"
 * - "Guest: Bob Jones - Director of Sales"
 */
function parseIntervieweeFromTranscript(transcript: string): { name?: string | undefined; title?: string | undefined } {
  const headerLines = transcript.split('\n').slice(0, 30);

  // Patterns to match interviewee information
  const intervieweePatterns = [
    // "Interviewee: John Smith, CEO at Acme Corp"
    /^(?:interviewee|expert|guest|speaker|participant)\s*:\s*([^,\n]+?)(?:,\s*(.+?))?(?:\s+at\s+(.+))?$/i,
    // "Expert: Jane Doe (VP Engineering, TechCo)"
    /^(?:interviewee|expert|guest|speaker|participant)\s*:\s*([^(\n]+?)\s*\(([^)]+)\)/i,
    // "Guest: Bob Jones - Director of Sales"
    /^(?:interviewee|expert|guest|speaker|participant)\s*:\s*([^-\n]+?)\s*-\s*(.+)$/i,
    // "Name: John Smith" + "Title: CEO"
    /^name\s*:\s*(.+)$/i,
  ];

  const titlePattern = /^(?:title|role|position)\s*:\s*(.+)$/i;

  let name: string | undefined;
  let title: string | undefined;

  for (const line of headerLines) {
    const trimmedLine = line.trim();

    // Try interviewee patterns
    for (const pattern of intervieweePatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        if (pattern === intervieweePatterns[3]) {
          // "Name: X" pattern - just get name
          name = match[1]?.trim();
        } else {
          name = match[1]?.trim();
          if (match[2]) {
            title = match[2]?.trim();
            if (match[3]) {
              title = `${title} at ${match[3].trim()}`;
            }
          }
        }
        break;
      }
    }

    // Try title pattern separately
    const titleMatch = trimmedLine.match(titlePattern);
    if (titleMatch && !title) {
      title = titleMatch[1]?.trim();
    }
  }

  // If no explicit interviewee, try to infer from speaker names
  if (!name) {
    const speakerMatches = transcript.match(/^([A-Z][a-z]+ [A-Z][a-z]+)\s*:/gm);
    if (speakerMatches) {
      // Find speakers that aren't "Interviewer" or generic names
      const speakers = [...new Set(speakerMatches.map(m => m.replace(':', '').trim()))];
      const nonInterviewers = speakers.filter(s =>
        !s.toLowerCase().includes('interviewer') &&
        !s.toLowerCase().includes('host') &&
        !s.toLowerCase().includes('moderator') &&
        !s.match(/^speaker\s*\d*$/i)
      );
      if (nonInterviewers.length === 1) {
        name = nonInterviewers[0];
      }
    }
  }

  return { name, title };
}

/**
 * Parse metadata from filename
 * Supports patterns like:
 * - "John_Smith_CEO_2024-12-15.txt"
 * - "2024-12-15_Jane_Doe_VP_Engineering.txt"
 * - "interview_Bob_Jones_Director_Sales_Dec15.txt"
 */
function parseMetadataFromFilename(filename: string): TranscriptMetadata {
  // Remove extension
  const baseName = filename.replace(/\.(txt|vtt|srt)$/i, '');

  // Replace common separators with spaces
  const normalized = baseName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const result: TranscriptMetadata = {};

  // Try to extract date from filename
  // ISO format: 2024-12-15 or 20241215
  const isoDateMatch = baseName.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
  if (isoDateMatch) {
    const year = parseInt(isoDateMatch[1]!, 10);
    const month = parseInt(isoDateMatch[2]!, 10) - 1;
    const day = parseInt(isoDateMatch[3]!, 10);
    result.callDate = new Date(year, month, day, 12, 0, 0).toISOString();
  }

  // Month name patterns: Dec15, December_15, etc.
  if (!result.callDate) {
    const monthDayMatch = normalized.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})\b/i);
    if (monthDayMatch) {
      const monthIndex = getMonthIndex(monthDayMatch[1]!);
      if (monthIndex !== -1) {
        const day = parseInt(monthDayMatch[2]!, 10);
        const year = new Date().getFullYear();
        result.callDate = new Date(year, monthIndex, day, 12, 0, 0).toISOString();
      }
    }
  }

  // Try to extract name and title
  // Remove date portions from normalized string
  let nameStr = normalized
    .replace(/\d{4}\s*\d{2}\s*\d{2}/g, '')
    .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*\d{1,2}\b/gi, '')
    .replace(/\b(interview|call|transcript|expert)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Look for known job titles
  for (const jobTitle of JOB_TITLES) {
    const titleRegex = new RegExp(`\\b(${jobTitle}(?:\\s+of\\s+\\w+)?)\\b`, 'i');
    const titleMatch = nameStr.match(titleRegex);
    if (titleMatch) {
      result.intervieweeTitle = titleMatch[1];
      // Remove title from name string
      nameStr = nameStr.replace(titleRegex, '').replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // What remains should be the name (if it looks like a name)
  // Names typically have 2-4 capitalized words
  const nameParts = nameStr.split(/\s+/).filter(p => p.length > 1);
  if (nameParts.length >= 2 && nameParts.length <= 4) {
    // Capitalize each part
    const formattedName = nameParts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
    result.intervieweeName = formattedName;
  }

  return result;
}

/**
 * Merge metadata from multiple sources with priority:
 * 1. User-provided (highest)
 * 2. Transcript content
 * 3. Filename (lowest)
 */
function mergeMetadata(
  userProvided: TranscriptMetadata,
  fromTranscript: TranscriptMetadata,
  fromFilename: TranscriptMetadata
): TranscriptMetadata {
  return {
    intervieweeName: userProvided.intervieweeName || fromTranscript.intervieweeName || fromFilename.intervieweeName,
    intervieweeTitle: userProvided.intervieweeTitle || fromTranscript.intervieweeTitle || fromFilename.intervieweeTitle,
    callDate: userProvided.callDate || fromTranscript.callDate || fromFilename.callDate,
  };
}

/**
 * Parse raw transcript text into segments
 * Supports common formats:
 * - "Speaker Name: Text..."
 * - "[Speaker Name] Text..."
 * - Timestamps like "00:01:23 Speaker: Text..."
 */
function parseTranscript(transcript: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = transcript.split('\n').filter((line) => line.trim());

  // Pattern for various speaker formats
  const patterns = [
    /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?([^:\[\]]+?):\s*(.+)$/,  // "Speaker: Text" or "00:00 Speaker: Text"
    /^\[([^\]]+)\]\s*(.+)$/,  // "[Speaker] Text"
  ];

  let currentTime = 0;
  const timeIncrement = 30000; // 30 seconds between segments as estimate

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

    // Parse timestamp if present
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
 * Register expert call routes
 */
export async function registerExpertCallRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authHook);

  /**
   * Get expert call history for engagement
   * GET /engagements/:engagementId/expert-calls
   */
  fastify.get(
    '/:engagementId/expert-calls',
    {
      preHandler: requireEngagementAccess('viewer'),
      schema: {
        querystring: z.object({
          status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Querystring: { status?: ExpertCallStatus; limit: number };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { status, limit } = request.query;

      // Verify engagement exists
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (rows.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const expertCalls = await expertCallRepo.getByEngagement(engagementId, {
        ...(status ? { status } : {}),
        limit,
      });

      reply.send({
        expertCalls,
        count: expertCalls.length,
      });
    }
  );

  /**
   * Get expert call statistics
   * GET /engagements/:engagementId/expert-calls/stats
   */
  fastify.get(
    '/:engagementId/expert-calls/stats',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{ Params: { engagementId: string } }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;

      // Verify engagement exists
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (rows.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      const stats = await expertCallRepo.getStats(engagementId);

      reply.send({
        engagementId,
        stats,
      });
    }
  );

  /**
   * Get a specific expert call by ID
   * GET /engagements/:engagementId/expert-calls/:callId
   */
  fastify.get(
    '/:engagementId/expert-calls/:callId',
    {
      preHandler: requireEngagementAccess('viewer'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; callId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, callId } = request.params;

      const expertCall = await expertCallRepo.getById(callId);

      if (!expertCall || expertCall.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Expert call not found',
        });
        return;
      }

      reply.send({
        expertCall,
      });
    }
  );

  /**
   * Process a new expert call transcript
   * POST /engagements/:engagementId/expert-calls
   */
  fastify.post(
    '/:engagementId/expert-calls',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          transcript: z.string().min(10, 'Transcript must be at least 10 characters'),
          filename: z.string().optional(),
          // Accept datetime-local format (YYYY-MM-DDTHH:mm) or ISO 8601
          callDate: z.string().refine(
            (val) => !isNaN(Date.parse(val)),
            { message: 'Invalid date format' }
          ).optional(),
          intervieweeName: z.string().optional(),
          intervieweeTitle: z.string().optional(),
          speakerLabels: z.record(z.string()).optional(),
          focusAreas: z.array(z.string()).optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: {
          transcript: string;
          filename?: string;
          callDate?: string;
          intervieweeName?: string;
          intervieweeTitle?: string;
          speakerLabels?: Record<string, string>;
          focusAreas?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const {
        transcript,
        filename,
        callDate: userProvidedCallDate,
        intervieweeName: userProvidedName,
        intervieweeTitle: userProvidedTitle,
        speakerLabels,
        focusAreas,
      } = request.body;

      // Parse metadata from transcript content and filename
      const transcriptMeta = parseIntervieweeFromTranscript(transcript);
      const filenameMeta = filename ? parseMetadataFromFilename(filename) : {};

      // Merge metadata with priority: user-provided > transcript > filename
      const metadata = mergeMetadata(
        {
          intervieweeName: userProvidedName,
          intervieweeTitle: userProvidedTitle,
          callDate: userProvidedCallDate,
        },
        {
          intervieweeName: transcriptMeta.name,
          intervieweeTitle: transcriptMeta.title,
          callDate: parseCallDateFromTranscript(transcript) ?? undefined,
        },
        filenameMeta
      );

      // Verify engagement exists
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (rows.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Check for duplicate transcript
      const existingCall = await expertCallRepo.findByTranscriptHash(engagementId, transcript);
      if (existingCall) {
        // Return the existing call instead of creating a duplicate
        reply.status(200).send({
          message: 'Transcript already processed',
          expertCall: existingCall,
          duplicate: true,
          statusUrl: `/api/v1/engagements/${engagementId}/expert-calls/${existingCall.id}`,
        });
        return;
      }

      // Create expert call record with merged metadata
      const expertCall = await expertCallRepo.create({
        engagementId,
        transcript,
        ...(metadata.callDate ? { callDate: metadata.callDate } : {}),
        ...(metadata.intervieweeName ? { intervieweeName: metadata.intervieweeName } : {}),
        ...(metadata.intervieweeTitle ? { intervieweeTitle: metadata.intervieweeTitle } : {}),
        ...(filename ? { sourceFilename: filename } : {}),
        ...(speakerLabels ? { speakerLabels } : {}),
        ...(focusAreas ? { focusAreas } : {}),
      });

      // Start processing asynchronously
      void processExpertCallAsync(
        expertCall.id,
        engagementId,
        transcript,
        speakerLabels,
        focusAreas
      );

      reply.status(202).send({
        message: 'Expert call transcript processing started',
        expertCall,
        statusUrl: `/api/v1/engagements/${engagementId}/expert-calls/${expertCall.id}`,
      });
    }
  );

  /**
   * Process multiple expert call transcripts (batch upload)
   * POST /engagements/:engagementId/expert-calls/batch
   *
   * Automatically eliminates duplicates (both within batch and against existing calls)
   * Parses metadata from transcript content and filenames
   */
  fastify.post(
    '/:engagementId/expert-calls/batch',
    {
      preHandler: requireEngagementAccess('editor'),
      schema: {
        body: z.object({
          transcripts: z.array(z.object({
            transcript: z.string().min(10, 'Transcript must be at least 10 characters'),
            filename: z.string().optional(),
            callDate: z.string().refine(
              (val) => !isNaN(Date.parse(val)),
              { message: 'Invalid date format' }
            ).optional(),
            intervieweeName: z.string().optional(),
            intervieweeTitle: z.string().optional(),
          })).min(1, 'At least one transcript is required').max(50, 'Maximum 50 transcripts per batch'),
          focusAreas: z.array(z.string()).optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string };
        Body: {
          transcripts: Array<{
            transcript: string;
            filename?: string;
            callDate?: string;
            intervieweeName?: string;
            intervieweeTitle?: string;
          }>;
          focusAreas?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId } = request.params;
      const { transcripts, focusAreas } = request.body;

      // Verify engagement exists
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE id = $1',
        [engagementId]
      );

      if (rows.length === 0) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Engagement not found',
        });
        return;
      }

      // Compute hashes for all transcripts
      const transcriptsWithHashes = transcripts.map((t) => ({
        ...t,
        hash: expertCallRepo.computeHash(t.transcript),
      }));

      // Deduplicate within the batch (keep first occurrence)
      const seenHashes = new Set<string>();
      const uniqueTranscripts: typeof transcriptsWithHashes = [];
      const batchDuplicates: Array<{ filename?: string | undefined; reason: string }> = [];

      for (const t of transcriptsWithHashes) {
        if (seenHashes.has(t.hash)) {
          batchDuplicates.push({
            filename: t.filename,
            reason: 'Duplicate within batch',
          });
        } else {
          seenHashes.add(t.hash);
          uniqueTranscripts.push(t);
        }
      }

      // Check for existing duplicates in database
      const hashes = uniqueTranscripts.map((t) => t.hash);
      const existingCalls = await expertCallRepo.findByTranscriptHashes(engagementId, hashes);

      // Separate new from existing
      const newTranscripts: typeof uniqueTranscripts = [];
      const existingDuplicates: Array<{ filename?: string | undefined; existingCallId: string }> = [];

      for (const t of uniqueTranscripts) {
        const existing = existingCalls.get(t.hash);
        if (existing) {
          existingDuplicates.push({
            filename: t.filename,
            existingCallId: existing.id,
          });
        } else {
          newTranscripts.push(t);
        }
      }

      // Create and process new transcripts
      const createdCalls: Array<{
        id: string;
        filename?: string | undefined;
        intervieweeName?: string | undefined;
        status: string;
      }> = [];

      for (const t of newTranscripts) {
        // Parse metadata from transcript content and filename
        const transcriptMeta = parseIntervieweeFromTranscript(t.transcript);
        const filenameMeta = t.filename ? parseMetadataFromFilename(t.filename) : {};

        // Merge metadata with priority: user-provided > transcript > filename
        const metadata = mergeMetadata(
          {
            intervieweeName: t.intervieweeName,
            intervieweeTitle: t.intervieweeTitle,
            callDate: t.callDate,
          },
          {
            intervieweeName: transcriptMeta.name,
            intervieweeTitle: transcriptMeta.title,
            callDate: parseCallDateFromTranscript(t.transcript) ?? undefined,
          },
          filenameMeta
        );

        // Create expert call record
        const expertCall = await expertCallRepo.create({
          engagementId,
          transcript: t.transcript,
          ...(metadata.callDate ? { callDate: metadata.callDate } : {}),
          ...(metadata.intervieweeName ? { intervieweeName: metadata.intervieweeName } : {}),
          ...(metadata.intervieweeTitle ? { intervieweeTitle: metadata.intervieweeTitle } : {}),
          ...(t.filename ? { sourceFilename: t.filename } : {}),
          ...(focusAreas ? { focusAreas } : {}),
        });

        createdCalls.push({
          id: expertCall.id,
          filename: t.filename,
          intervieweeName: metadata.intervieweeName,
          status: 'pending',
        });

        // Start processing asynchronously
        void processExpertCallAsync(
          expertCall.id,
          engagementId,
          t.transcript,
          undefined,
          focusAreas
        );
      }

      reply.status(202).send({
        message: `Batch processing started: ${createdCalls.length} new, ${existingDuplicates.length + batchDuplicates.length} duplicates skipped`,
        summary: {
          total: transcripts.length,
          created: createdCalls.length,
          duplicatesInBatch: batchDuplicates.length,
          duplicatesExisting: existingDuplicates.length,
        },
        created: createdCalls,
        duplicates: {
          withinBatch: batchDuplicates,
          existing: existingDuplicates,
        },
      });
    }
  );

  /**
   * Delete an expert call
   * DELETE /engagements/:engagementId/expert-calls/:callId
   */
  fastify.delete(
    '/:engagementId/expert-calls/:callId',
    {
      preHandler: requireEngagementAccess('editor'),
    },
    async (
      request: FastifyRequest<{
        Params: { engagementId: string; callId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { engagementId, callId } = request.params;

      const expertCall = await expertCallRepo.getById(callId);

      if (!expertCall || expertCall.engagementId !== engagementId) {
        reply.status(404).send({
          error: 'Not Found',
          message: 'Expert call not found',
        });
        return;
      }

      // Don't allow deleting processing calls
      if (expertCall.status === 'processing') {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'Cannot delete an expert call that is currently processing',
        });
        return;
      }

      await expertCallRepo.delete(callId);

      reply.send({
        message: 'Expert call deleted successfully',
      });
    }
  );
}

/**
 * Fetch the investment thesis statement from engagement
 */
async function getEngagementThesis(engagementId: string): Promise<string | undefined> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT thesis, investment_thesis FROM engagements WHERE id = $1',
    [engagementId]
  );

  if (rows.length === 0) return undefined;

  const engagement = rows[0] as { thesis?: { statement?: string }; investment_thesis?: { summary?: string } };

  // Prefer thesis.statement (simpler format), fall back to investment_thesis.summary
  return engagement.thesis?.statement || engagement.investment_thesis?.summary;
}

/**
 * Process expert call transcript asynchronously and update repository
 */
async function processExpertCallAsync(
  callId: string,
  engagementId: string,
  transcript: string,
  speakerLabels?: Record<string, string>,
  focusAreas?: string[]
): Promise<void> {
  try {
    // Mark as processing and publish started event
    await expertCallRepo.markProcessing(callId);
    publishEvent(createExpertCallStartedEvent(engagementId, callId));

    // Parse transcript into segments
    const segments = parseTranscript(transcript);

    // Apply speaker labels if provided
    if (speakerLabels) {
      for (const segment of segments) {
        const mappedName = speakerLabels[segment.speaker];
        if (mappedName) {
          segment.speaker = mappedName;
        }
      }
    }

    // Get deal memory for the engagement
    const dealMemory = await createDealMemory(engagementId);

    // Get investment thesis for alignment assessment
    const thesisStatement = await getEngagementThesis(engagementId);

    // Execute the workflow
    const result = await processExpertCallTranscript({
      engagementId,
      callId,
      dealMemory,
      segments,
      ...(focusAreas ? { focusAreas } : {}),
      ...(thesisStatement ? { thesisStatement } : {}),
    });

    // Mark as completed with results and publish completed event
    await expertCallRepo.markCompleted(callId, result as unknown as Record<string, unknown>);
    publishEvent(createExpertCallEndedEvent(engagementId, callId, 'completed'));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await expertCallRepo.markFailed(callId, errorMessage);
    publishEvent(createExpertCallEndedEvent(engagementId, callId, 'failed', errorMessage));
  }
}
