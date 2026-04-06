import type { z } from 'zod';
import type { IngestPdfInput } from '../schemas/tools.js';
import { callClaude } from '../services/claude.js';
import { getDb } from '../services/db.js';
import { generateEmbeddings } from '../services/embeddings.js';
import { createRequestId, logger } from '../services/logger.js';
import { chunkText, extractPdfText } from '../services/pdf.js';

type IngestPdfParams = z.infer<typeof IngestPdfInput>;

export async function ingestPdf(params: IngestPdfParams): Promise<string> {
  const sql = getDb();
  const reqId = createRequestId();
  logger.info('Starting PDF ingestion', { reqId, file_path: params.file_path });

  // Step 1: Extract text (with OCR fallback)
  const { text, pageCount, ocrUsed } = await extractPdfText(params.file_path);
  if (!text.trim()) {
    return JSON.stringify({ error: 'PDF extraction produced no text (including OCR fallback)' });
  }

  logger.info('PDF extracted', { reqId, pageCount, textLength: text.length, ocrUsed });

  // Step 2: Extract metadata with Claude if not provided
  let author = params.author;
  let title = params.title;
  let year = params.year;
  let textType = params.text_type || 'article';

  if (!author || !title) {
    const metadataResponse = await callClaude(
      [
        {
          role: 'user',
          content: `Extract metadata from the beginning of this academic text. Return ONLY JSON:
{"author": "...", "title": "...", "year": number|null, "text_type": "literary_work"|"theory"|"criticism"|"article"|"dissertation"}

Text (first 2000 chars):
${text.slice(0, 2000)}`,
        },
      ],
      300,
    );

    try {
      const meta = JSON.parse(metadataResponse.replace(/```json|```/g, '').trim());
      author = author || meta.author;
      title = title || meta.title;
      year = year ?? meta.year;
      textType = params.text_type || meta.text_type || 'article';
    } catch {
      if (!author || !title) {
        return JSON.stringify({ error: 'Could not extract metadata and author/title not provided' });
      }
    }
  }

  // Step 3: Deduplication check — look for existing text with same title+author
  const existing = await sql(
    `SELECT id, title, author FROM canonical_texts
     WHERE title ILIKE $1 AND author ILIKE $2
     LIMIT 1`,
    [`%${title}%`, `%${author}%`],
  );

  if (existing.length > 0) {
    const ex = existing[0] as Record<string, unknown>;
    logger.info('Duplicate detected', { reqId, existingId: ex.id, title: ex.title });
    return JSON.stringify(
      {
        status: 'duplicate',
        message: `A document with a matching title and author already exists in the corpus.`,
        existing_text_id: ex.id,
        existing_title: ex.title,
        existing_author: ex.author,
        action: 'If this is a different edition or version, provide a distinct title to force ingestion.',
      },
      null,
      2,
    );
  }

  // Step 4: Create canonical_texts record
  const textRows = await sql(
    `
    INSERT INTO canonical_texts (author, title, year, text_type, tradition, page_count, format)
    VALUES ($1, $2, $3, $4, $5, $6, 'pdf')
    RETURNING id
  `,
    [author, title, year, textType, params.tradition || null, pageCount],
  );
  const textId = (textRows[0] as Record<string, unknown>).id as string;

  // Step 5: Chunk text (with chapter/section detection)
  const chunks = chunkText(text);
  logger.info('Text chunked', { reqId, chunkCount: chunks.length });

  // Step 6: Generate embeddings in batches
  const chunkTexts = chunks.map((c) => c.text);
  const embeddings = await generateEmbeddings(chunkTexts);

  // Step 7: Insert chunks with embeddings and section metadata
  for (let i = 0; i < chunks.length; i++) {
    await sql(
      `
      INSERT INTO text_chunks (text_id, chapter_number, chapter_title, section_title, paragraph_index, page_number, content, embedding)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
    `,
      [
        textId,
        chunks[i].chapterNumber || null,
        chunks[i].chapterTitle || null,
        chunks[i].sectionTitle || null,
        chunks[i].paragraphIndex,
        chunks[i].estimatedPage,
        chunks[i].text,
        JSON.stringify(embeddings[i]),
      ],
    );
  }

  // Step 8: Track source file
  await sql(
    `
    INSERT INTO source_files (filename, file_path, text_id, page_count, processing_status, processed_at)
    VALUES ($1, $2, $3, $4, 'indexed', NOW())
  `,
    [params.file_path.split('/').pop(), params.file_path, textId, pageCount],
  );

  // Step 9: Link citation if provided
  if (params.citation_id) {
    await sql(
      `
      UPDATE citations SET full_text_indexed = TRUE, text_id = $1, updated_at = NOW()
      WHERE id = $2
    `,
      [textId, params.citation_id],
    );

    await sql(
      `
      UPDATE procurement_queue SET status = 'acquired', resolved_at = NOW()
      WHERE citation_id = $1 AND status = 'pending'
    `,
      [params.citation_id],
    );
  }

  logger.info('PDF ingestion complete', { reqId, textId, chunks: chunks.length, ocrUsed });

  return JSON.stringify(
    {
      status: 'indexed',
      text_id: textId,
      author,
      title,
      year,
      text_type: textType,
      page_count: pageCount,
      chunks_created: chunks.length,
      citation_linked: !!params.citation_id,
      ocr_used: ocrUsed,
    },
    null,
    2,
  );
}
