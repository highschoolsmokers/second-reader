import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pdfParse from 'pdf-parse';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

export interface PdfExtraction {
  text: string;
  pageCount: number;
  ocrUsed: boolean;
}

export async function extractPdfText(filePath: string): Promise<PdfExtraction> {
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);

  // If pdf-parse extracted meaningful text, use it
  const textContent = data.text.trim();
  if (textContent.length > 100) {
    return {
      text: textContent,
      pageCount: data.numpages,
      ocrUsed: false,
    };
  }

  // Fallback: OCR with tesseract.js
  logger.info('PDF text extraction yielded little content, attempting OCR', {
    filePath,
    extractedLength: textContent.length,
  });

  try {
    const ocrText = await ocrPdf(buffer, data.numpages);
    if (ocrText.trim().length > 100) {
      return {
        text: ocrText,
        pageCount: data.numpages,
        ocrUsed: true,
      };
    }
  } catch (err) {
    logger.warn('OCR fallback failed', { error: String(err) });
  }

  // Return whatever we got (may be empty)
  return {
    text: textContent,
    pageCount: data.numpages,
    ocrUsed: false,
  };
}

async function ocrPdf(pdfBuffer: Buffer, pageCount: number): Promise<string> {
  const { createWorker } = await import('tesseract.js');

  // Convert PDF pages to images using pdftoppm (poppler) if available,
  // otherwise fall back to tesseract.js PDF support
  let imagePaths: string[] | null = null;

  try {
    const tmpBase = join(tmpdir(), `lit-ocr-${Date.now()}`);
    const pdfPath = `${tmpBase}.pdf`;
    await writeFile(pdfPath, pdfBuffer);

    await execFileAsync('pdftoppm', ['-png', '-r', '300', pdfPath, tmpBase], {
      timeout: 120_000,
    });

    // pdftoppm outputs files like tmpBase-1.png, tmpBase-2.png, etc.
    const { readdir } = await import('node:fs/promises');
    const dir = tmpdir();
    const basePrefix = tmpBase.split('/').pop()!;
    const files = await readdir(dir);
    imagePaths = files
      .filter((f) => f.startsWith(basePrefix) && f.endsWith('.png'))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    // pdftoppm not available — use tesseract.js directly on the PDF
    logger.debug('pdftoppm not available, using tesseract.js PDF mode');
  }

  const worker = await createWorker('eng');
  const pages: string[] = [];

  try {
    if (imagePaths && imagePaths.length > 0) {
      // OCR each page image
      const limit = Math.min(imagePaths.length, pageCount, 50); // Cap at 50 pages
      for (let i = 0; i < limit; i++) {
        const { data } = await worker.recognize(imagePaths[i]);
        pages.push(data.text);
      }
    } else {
      // Try direct PDF recognition (tesseract.js supports it)
      const tmpPath = join(tmpdir(), `lit-ocr-${Date.now()}.pdf`);
      await writeFile(tmpPath, pdfBuffer);
      const { data } = await worker.recognize(tmpPath);
      pages.push(data.text);
    }
  } finally {
    await worker.terminate();
  }

  return pages.join('\n\n');
}

export interface ChunkSection {
  chapterNumber?: number;
  chapterTitle?: string;
  sectionTitle?: string;
}

export interface TextChunkData {
  text: string;
  estimatedPage: number;
  paragraphIndex: number;
  chapterNumber?: number;
  chapterTitle?: string;
  sectionTitle?: string;
}

// Patterns that detect chapter/section headings
const CHAPTER_PATTERN = /^(?:chapter|ch\.?)\s+(\d+|[ivxlcdm]+)[\s.:—–-]*(.*)$/im;
const SECTION_PATTERN = /^(?:section|part|§)\s+(\d+|[ivxlcdm]+)[\s.:—–-]*(.*)$/im;
const NUMBERED_HEADING_PATTERN = /^(\d+\.(?:\d+\.?)*)\s+(.+)$/m;
// A line that's all-caps and reasonably short is likely a heading
const ALLCAPS_HEADING_PATTERN = /^([A-Z][A-Z\s]{4,60})$/m;

function detectHeading(paragraph: string): ChunkSection | null {
  const trimmed = paragraph.trim();
  const firstLine = trimmed.split('\n')[0].trim();

  const chapterMatch = firstLine.match(CHAPTER_PATTERN);
  if (chapterMatch) {
    const num = parseInt(chapterMatch[1], 10) || romanToInt(chapterMatch[1]);
    return {
      chapterNumber: num || undefined,
      chapterTitle: chapterMatch[2].trim() || undefined,
    };
  }

  const sectionMatch = firstLine.match(SECTION_PATTERN);
  if (sectionMatch) {
    return { sectionTitle: sectionMatch[2].trim() || sectionMatch[0].trim() };
  }

  const numberedMatch = firstLine.match(NUMBERED_HEADING_PATTERN);
  if (numberedMatch && firstLine.length < 80) {
    return { sectionTitle: firstLine };
  }

  const capsMatch = firstLine.match(ALLCAPS_HEADING_PATTERN);
  if (capsMatch && firstLine.length < 60) {
    return { sectionTitle: titleCase(firstLine) };
  }

  return null;
}

function romanToInt(s: string): number {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const lower = s.toLowerCase();
  let result = 0;
  for (let i = 0; i < lower.length; i++) {
    const curr = map[lower[i]] || 0;
    const next = map[lower[i + 1]] || 0;
    result += curr < next ? -curr : curr;
  }
  return result;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 100): TextChunkData[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: TextChunkData[] = [];
  let currentChunk = '';
  let charCount = 0;
  let chunkIndex = 0;

  // Track current section context
  let currentSection: ChunkSection = {};

  for (const para of paragraphs) {
    // Detect headings and update section context
    const heading = detectHeading(para);
    if (heading) {
      // Flush current chunk before a new section
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          estimatedPage: Math.floor(charCount / 3000) + 1,
          paragraphIndex: chunkIndex,
          ...currentSection,
        });
        chunkIndex++;
        currentChunk = '';
      }

      if (heading.chapterNumber !== undefined || heading.chapterTitle) {
        currentSection = {
          chapterNumber: heading.chapterNumber ?? currentSection.chapterNumber,
          chapterTitle: heading.chapterTitle ?? currentSection.chapterTitle,
          sectionTitle: undefined,
        };
      }
      if (heading.sectionTitle) {
        currentSection = {
          ...currentSection,
          sectionTitle: heading.sectionTitle,
        };
      }
    }

    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push({
        text: currentChunk.trim(),
        estimatedPage: Math.floor(charCount / 3000) + 1,
        paragraphIndex: chunkIndex,
        ...currentSection,
      });
      chunkIndex++;
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = `${overlapWords.join(' ')}\n\n${para}`;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
    charCount += para.length;
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      estimatedPage: Math.floor(charCount / 3000) + 1,
      paragraphIndex: chunkIndex,
      ...currentSection,
    });
  }

  return chunks;
}
