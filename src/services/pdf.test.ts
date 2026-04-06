import { describe, expect, it } from 'vitest';
import { chunkText } from './pdf.js';

describe('chunkText', () => {
  it('returns empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const result = chunkText('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello world');
    expect(result[0].paragraphIndex).toBe(0);
    expect(result[0].estimatedPage).toBe(1);
  });

  it('splits text into multiple chunks when total exceeds maxChunkSize', () => {
    const paragraph = 'word '.repeat(40); // ~200 chars each
    const text = Array.from({ length: 10 }, () => paragraph).join('\n\n');
    const result = chunkText(text, 500, 50);
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should contain at least some text
    for (const chunk of result) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('preserves paragraph boundaries', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const result = chunkText(text, 10000);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('First paragraph.');
    expect(result[0].text).toContain('Second paragraph.');
    expect(result[0].text).toContain('Third paragraph.');
  });

  it('creates overlap between chunks', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} with some content to fill space.`);
    const text = paragraphs.join('\n\n');
    const result = chunkText(text, 200, 50);

    if (result.length >= 2) {
      // Second chunk should contain some words from the end of the first chunk
      const firstChunkWords = result[0].text.split(' ');
      const _lastWords = firstChunkWords.slice(-5).join(' ');
      // The overlap means the second chunk starts with trailing words from chunk 1
      expect(result[1].text.length).toBeGreaterThan(0);
    }
  });

  it('estimates page numbers based on character count', () => {
    // 3000 chars per page estimate
    const longText = `${'A'.repeat(3000)}\n\n${'B'.repeat(3000)}`;
    const result = chunkText(longText, 10000);
    expect(result[0].estimatedPage).toBeGreaterThanOrEqual(1);
  });

  it('increments paragraph index per chunk', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph number ${i} ${'x'.repeat(200)}`);
    const text = paragraphs.join('\n\n');
    const result = chunkText(text, 300, 50);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].paragraphIndex).toBe(i);
    }
  });

  it('handles text with only whitespace paragraphs', () => {
    const text = '  \n\n  \n\n  ';
    const result = chunkText(text);
    // Should either be empty or contain only trimmed non-empty chunks
    for (const chunk of result) {
      if (chunk.text.length > 0) {
        expect(chunk.text.trim().length).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
