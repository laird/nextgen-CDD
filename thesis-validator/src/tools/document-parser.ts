/**
 * Document Parser - Multi-format document parsing
 *
 * Parses various document formats from data rooms:
 * - PDF documents
 * - Microsoft Office (Word, Excel, PowerPoint)
 * - Plain text and markdown
 * - HTML documents
 * - CSV/TSV data files
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import Tesseract from 'tesseract.js';

/**
 * Parsed document content
 */
export interface ParsedDocument {
  id: string;
  filename: string;
  mimeType: string;
  content: string;
  chunks: DocumentChunk[];
  metadata: DocumentMetadata;
  tables?: ParsedTable[];
  images?: ImageReference[];
}

/**
 * Document chunk for embedding
 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  page?: number;
  section?: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  title?: string;
  author?: string;
  createdDate?: string;
  modifiedDate?: string;
  pageCount?: number;
  wordCount: number;
  language?: string;
  keywords?: string[];
  properties?: Record<string, unknown>;
}

/**
 * Parsed table from document
 */
export interface ParsedTable {
  id: string;
  page?: number;
  headers: string[];
  rows: string[][];
  caption?: string;
}

/**
 * Image reference from document
 */
export interface ImageReference {
  id: string;
  page?: number;
  caption?: string;
  altText?: string;
  width?: number;
  height?: number;
}

/**
 * Parser options
 */
export interface ParserOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  extractTables?: boolean;
  extractImages?: boolean;
  preserveFormatting?: boolean;
  language?: string;
}

/**
 * Default parser options
 */
const defaultOptions: ParserOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  extractTables: true,
  extractImages: false,
  preserveFormatting: false,
};

/**
 * MIME types for common document formats
 */
const mimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.json': 'application/json',
  '.xml': 'application/xml',
};

/**
 * Document Parser Service
 */
export class DocumentParser {
  private options: ParserOptions;

  constructor(options?: ParserOptions) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Parse a document from file path
   */
  async parseFile(filePath: string, options?: ParserOptions): Promise<ParsedDocument> {
    const opts = { ...this.options, ...options };
    const ext = extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] ?? 'application/octet-stream';
    const filename = filePath.split('/').pop() ?? 'unknown';

    const content = await readFile(filePath);
    return this.parseBuffer(content, filename, mimeType, opts);
  }

  /**
   * Parse a document from buffer
   */
  async parseBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    options?: ParserOptions
  ): Promise<ParsedDocument> {
    const opts = { ...this.options, ...options };
    const id = crypto.randomUUID();

    let content: string;
    let metadata: DocumentMetadata;
    let tables: ParsedTable[] = [];

    // Parse based on MIME type
    switch (mimeType) {
      case 'text/plain':
      case 'text/markdown':
        content = buffer.toString('utf-8');
        metadata = this.extractTextMetadata(content);
        break;

      case 'text/csv':
        content = buffer.toString('utf-8');
        metadata = this.extractTextMetadata(content);
        if (opts.extractTables) {
          tables = [this.parseCSV(content, ',')];
        }
        break;

      case 'text/tab-separated-values':
        content = buffer.toString('utf-8');
        metadata = this.extractTextMetadata(content);
        if (opts.extractTables) {
          tables = [this.parseCSV(content, '\t')];
        }
        break;

      case 'text/html':
        content = this.parseHTMLContent(buffer.toString('utf-8'));
        metadata = this.extractTextMetadata(content);
        break;

      case 'application/json':
        content = JSON.stringify(JSON.parse(buffer.toString('utf-8')), null, 2);
        metadata = this.extractTextMetadata(content);
        break;

      case 'application/pdf': {
        const pdfResult = await this.parsePDF(buffer);
        if (pdfResult.needsOCR) {
          const ocrResult = await this.performOCR(buffer);
          content = ocrResult.content;
          metadata = {
            ...pdfResult.metadata,
            wordCount: content.split(/\s+/).filter(Boolean).length,
            properties: { ocrConfidence: ocrResult.confidence },
          };
        } else {
          content = pdfResult.content;
          metadata = pdfResult.metadata;
        }
        break;
      }

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        content = await this.parseDOCX(buffer);
        metadata = this.extractTextMetadata(content);
        break;

      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        const xlsxResult = this.parseXLSX(buffer);
        content = xlsxResult.content;
        metadata = this.extractTextMetadata(content);
        if (opts.extractTables) {
          tables = xlsxResult.tables;
        }
        break;
      }

      default:
        // Attempt to read as text
        try {
          content = buffer.toString('utf-8');
          metadata = this.extractTextMetadata(content);
        } catch {
          content = `[Binary content - ${buffer.length} bytes]`;
          metadata = { wordCount: 0 };
        }
    }

    // Create chunks
    const chunks = this.createChunks(id, content, opts);

    return {
      id,
      filename,
      mimeType,
      content,
      chunks,
      metadata,
      ...(tables.length > 0 ? { tables } : {}),
    };
  }

  /**
   * Create text chunks for embedding
   */
  private createChunks(
    documentId: string,
    content: string,
    options: ParserOptions
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const chunkSize = options.chunkSize ?? 1000;
    const overlap = options.chunkOverlap ?? 200;

    // Split by paragraphs first to maintain context
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;
    let startOffset = 0;

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          id: `${documentId}_chunk_${chunkIndex}`,
          documentId,
          content: currentChunk.trim(),
          chunkIndex,
          startOffset,
          endOffset: startOffset + currentChunk.length,
        });

        // Start new chunk with overlap
        const words = currentChunk.split(/\s+/);
        const overlapWords = Math.ceil((overlap / chunkSize) * words.length);
        currentChunk = words.slice(-overlapWords).join(' ') + '\n\n' + paragraph;
        startOffset += currentChunk.length - overlap;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `${documentId}_chunk_${chunkIndex}`,
        documentId,
        content: currentChunk.trim(),
        chunkIndex,
        startOffset,
        endOffset: startOffset + currentChunk.length,
      });
    }

    return chunks;
  }

  /**
   * Extract metadata from text content
   */
  private extractTextMetadata(content: string): DocumentMetadata {
    const words = content.split(/\s+/).filter(Boolean);
    const lines = content.split('\n');

    // Try to extract title from first line
    const firstLine = lines[0]?.trim();
    const title = firstLine && firstLine.length < 200 ? firstLine : null;

    return {
      ...(title ? { title } : {}),
      wordCount: words.length,
      pageCount: Math.ceil(words.length / 300), // Approximate pages
    };
  }

  /**
   * Parse HTML content using cheerio
   */
  private parseHTMLContent(html: string): string {
    const $ = cheerio.load(html);

    // Remove scripts, styles, and other non-content elements
    $('script, style, noscript, iframe, svg').remove();

    // Get text content
    let text = $('body').text() || $.root().text();

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Parse CSV/TSV content
   */
  private parseCSV(content: string, delimiter: string): ParsedTable {
    const lines = content.split('\n').filter(Boolean);
    const headers = lines[0]?.split(delimiter).map((h) => h.trim()) ?? [];
    const rows = lines.slice(1).map((line) =>
      line.split(delimiter).map((cell) => cell.trim())
    );

    return {
      id: crypto.randomUUID(),
      headers,
      rows,
    };
  }

  /**
   * Parse PDF document
   */
  private async parsePDF(buffer: Buffer): Promise<{ content: string; metadata: DocumentMetadata; needsOCR: boolean }> {
    try {
      const pdf = new PDFParse({ data: buffer });
      const textResult = await pdf.getText();
      const infoResult = await pdf.getInfo();
      await pdf.destroy();

      const text = textResult.text;
      // Check if PDF has actual text or is scanned
      const hasText = text.trim().length > 50;

      if (!hasText) {
        return {
          content: '',
          metadata: {
            wordCount: 0,
            pageCount: infoResult.pages.length,
          },
          needsOCR: true,
        };
      }

      return {
        content: text,
        metadata: {
          ...(infoResult.info?.title ? { title: infoResult.info.title } : {}),
          ...(infoResult.info?.author ? { author: infoResult.info.author } : {}),
          wordCount: text.split(/\s+/).filter(Boolean).length,
          pageCount: infoResult.pages.length,
          ...(infoResult.info?.creationDate ? { createdDate: infoResult.info.creationDate.toISOString() } : {}),
        },
        needsOCR: false,
      };
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform OCR on image/scanned PDF
   */
  private async performOCR(buffer: Buffer): Promise<{ content: string; confidence: number }> {
    try {
      const result = await Tesseract.recognize(buffer, 'eng', {
        logger: () => {}, // Suppress progress logs
      });

      return {
        content: result.data.text,
        confidence: result.data.confidence / 100,
      };
    } catch (error) {
      throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse DOCX document
   */
  private async parseDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse XLSX document
   */
  private parseXLSX(buffer: Buffer): { content: string; tables: ParsedTable[] } {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const tables: ParsedTable[] = [];
      let allContent = '';

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        // Convert to JSON for table extraction
        const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

        if (jsonData.length > 0) {
          const headers = (jsonData[0] ?? []).map(h => String(h ?? ''));
          const rows = jsonData.slice(1).map(row =>
            (row ?? []).map(cell => String(cell ?? ''))
          );

          tables.push({
            id: crypto.randomUUID(),
            headers,
            rows,
            caption: sheetName,
          });

          // Also get text content
          const textContent = XLSX.utils.sheet_to_txt(sheet);
          allContent += `\n\n--- ${sheetName} ---\n${textContent}`;
        }
      }

      return { content: allContent.trim(), tables };
    } catch (error) {
      throw new Error(`XLSX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return Object.values(mimeTypes);
  }

  /**
   * Get MIME type for file extension
   */
  getMimeType(extension: string): string {
    const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
    return mimeTypes[ext] ?? 'application/octet-stream';
  }
}

// Singleton instance
let _documentParser: DocumentParser | null = null;

/**
 * Get the singleton Document Parser
 */
export function getDocumentParser(): DocumentParser {
  if (!_documentParser) {
    _documentParser = new DocumentParser();
  }
  return _documentParser;
}

/**
 * Set a custom Document Parser (for testing)
 */
export function setDocumentParser(parser: DocumentParser): void {
  _documentParser = parser;
}

/**
 * Helper function to parse a document file
 */
export async function parseDocument(
  filePath: string,
  options?: ParserOptions
): Promise<ParsedDocument> {
  return getDocumentParser().parseFile(filePath, options);
}

/**
 * Extract text from document chunks
 */
export function extractTextFromChunks(chunks: DocumentChunk[]): string {
  return chunks.map((chunk) => chunk.content).join('\n\n');
}
