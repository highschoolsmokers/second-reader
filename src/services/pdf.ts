import { readFile } from 'node:fs/promises';
import pdfParse from 'pdf-parse';

export interface PdfExtraction {
  text: string;
  pageCount: number;
}

export async function extractPdfText(filePath: string): Promise<PdfExtraction> {
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    pageCount: data.numpages,
  };
}

export interface TextChunkData {
  text: string;
  estimatedPage: number;
  paragraphIndex: number;
}

export function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 100): TextChunkData[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: TextChunkData[] = [];
  let currentChunk = '';
  let charCount = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push({
        text: currentChunk.trim(),
        estimatedPage: Math.floor(charCount / 3000) + 1,
        paragraphIndex: chunkIndex,
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
    });
  }

  return chunks;
}
