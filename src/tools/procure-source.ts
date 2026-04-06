import type { z } from 'zod';
import type { ProcureSourceInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';
import { createRequestId, logger } from '../services/logger.js';
import {
  downloadFromPaperless,
  isPaperlessConfigured,
  searchPaperless,
  uploadToPaperless,
} from '../services/paperless.js';
import { ingestPdf } from './ingest-pdf.js';

type ProcureSourceParams = z.infer<typeof ProcureSourceInput>;

export async function procureSource(params: ProcureSourceParams): Promise<string> {
  const sql = getDb();
  const reqId = createRequestId();

  // ──────────────────────────────────────────────
  // MODE 1: Complete procurement — user has the PDF
  // ──────────────────────────────────────────────
  if (params.file_path) {
    logger.info('Completing procurement with user-provided PDF', { reqId, file_path: params.file_path });

    // Ingest into the corpus
    let ingestResult: Record<string, unknown>;
    try {
      ingestResult = JSON.parse(
        await ingestPdf({
          file_path: params.file_path,
          author: params.author,
          title: params.title,
          year: params.year,
          text_type: params.text_type,
          tradition: params.tradition,
          citation_id: params.citation_id,
        }),
      );
    } catch (err) {
      logger.error('PDF ingestion failed during procurement', { reqId, error: String(err) });
      return JSON.stringify({ status: 'error', error: `Ingestion failed: ${String(err)}` });
    }

    if (ingestResult.error) {
      return JSON.stringify({ status: 'error', error: ingestResult.error });
    }

    // Archive to Paperless-ngx if configured
    let paperlessResult = null;
    if (isPaperlessConfigured() && params.archive_to_paperless !== false) {
      paperlessResult = await uploadToPaperless(params.file_path, {
        title: params.title || (ingestResult.title as string),
        correspondent: params.author || (ingestResult.author as string),
      });
    }

    // Mark procurement as acquired
    if (params.citation_id) {
      await sql(
        `
        UPDATE procurement_queue SET status = 'acquired', resolved_at = NOW()
        WHERE citation_id = $1 AND status = 'pending'
      `,
        [params.citation_id],
      );
    }

    return JSON.stringify(
      {
        status: 'ingested',
        message:
          'Source has been ingested into the corpus. Citations referencing this source can now be fully verified.',
        text_id: ingestResult.text_id,
        chunks_created: ingestResult.chunks_created,
        archived_to_paperless: !!paperlessResult,
      },
      null,
      2,
    );
  }

  // ──────────────────────────────────────────────
  // MODE 2: Search & discover — find the source
  // ──────────────────────────────────────────────
  logger.info('Searching for source to procure', { reqId, title: params.title, author: params.author });

  // Step 1: Check if already in our corpus
  const existing = params.title
    ? await sql(
        `
        SELECT ct.id, ct.author, ct.title, ct.year
        FROM canonical_texts ct
        WHERE ct.title ILIKE $1
        LIMIT 1
      `,
        [`%${params.title}%`],
      )
    : [];

  if (existing.length) {
    return JSON.stringify(
      {
        status: 'already_indexed',
        message: 'This source is already in the corpus. No procurement needed.',
        text: existing[0],
      },
      null,
      2,
    );
  }

  // Step 2: Check Paperless-ngx
  let paperlessHit = null;
  if (isPaperlessConfigured()) {
    const searchQuery = [params.title, params.author].filter(Boolean).join(' ');
    const results = await searchPaperless(searchQuery);

    if (results && results.results.length > 0) {
      const bestMatch = results.results[0];
      logger.info('Found in Paperless-ngx', { reqId, documentId: bestMatch.id, title: bestMatch.title });

      // Download and ingest automatically
      const downloadPath = await downloadFromPaperless(bestMatch.id);
      if (downloadPath) {
        let paperlessIngestResult: Record<string, unknown> | null = null;
        try {
          paperlessIngestResult = JSON.parse(
            await ingestPdf({
              file_path: downloadPath,
              author: params.author,
              title: params.title,
              year: params.year,
              text_type: params.text_type,
              tradition: params.tradition,
              citation_id: params.citation_id,
            }),
          );
        } catch (err) {
          logger.error('Paperless auto-ingest failed', { reqId, error: String(err) });
        }

        if (paperlessIngestResult && !paperlessIngestResult.error) {
          if (params.citation_id) {
            await sql(
              `
              UPDATE procurement_queue SET status = 'acquired', resolved_at = NOW()
              WHERE citation_id = $1 AND status = 'pending'
            `,
              [params.citation_id],
            );
          }

          return JSON.stringify(
            {
              status: 'ingested_from_paperless',
              message: `Found "${bestMatch.title}" in your Paperless-ngx archive. Downloaded and indexed automatically.`,
              paperless_document_id: bestMatch.id,
              text_id: paperlessIngestResult.text_id,
              chunks_created: paperlessIngestResult.chunks_created,
            },
            null,
            2,
          );
        }
      }

      // Download failed but we found it — tell the user
      paperlessHit = {
        document_id: bestMatch.id,
        title: bestMatch.title,
        original_file_name: bestMatch.original_file_name,
      };
    }
  }

  // Step 3: Look up citation record for DOI/links
  let citationRecord = null;
  if (params.citation_id) {
    const rows = await sql(`SELECT * FROM citations WHERE id = $1`, [params.citation_id]);
    citationRecord = rows[0] as Record<string, unknown> | undefined;
  } else if (params.title) {
    const rows = await sql(`SELECT * FROM citations WHERE title ILIKE $1 AND bibliographic_verified = TRUE`, [
      `%${params.title}%`,
    ]);
    citationRecord = rows[0] as Record<string, unknown> | undefined;
  }

  // Step 4: Build access links
  const accessLinks: { source: string; url: string }[] = [];
  const doi = (citationRecord?.doi as string) || params.doi;

  if (doi) {
    accessLinks.push({ source: 'DOI', url: `https://doi.org/${doi}` });
    accessLinks.push({ source: 'Sci-Hub', url: `https://sci-hub.se/${doi}` });
  }
  if (params.title) {
    accessLinks.push({
      source: 'Google Scholar',
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(params.title)}`,
    });
    accessLinks.push({
      source: 'JSTOR',
      url: `https://www.jstor.org/action/doBasicSearch?Query=${encodeURIComponent(params.title)}`,
    });
    accessLinks.push({
      source: 'Academia.edu',
      url: `https://www.academia.edu/search?q=${encodeURIComponent(params.title)}`,
    });
  }

  // Step 5: Build the user prompt
  const source = {
    title: params.title || citationRecord?.title,
    author: params.author || (citationRecord?.authors as string[])?.join(', '),
    year: params.year || citationRecord?.year,
    journal: citationRecord?.journal,
    doi,
    citation_id: (citationRecord?.id as string) || params.citation_id,
  };

  return JSON.stringify(
    {
      status: 'procurement_needed',
      message: `I need the full text of this source to verify quotations and arguments against it. It appears to be behind a paywall or not in the indexed corpus.`,
      source,
      access_links: accessLinks,
      paperless_partial_match: paperlessHit,
      paperless_configured: isPaperlessConfigured(),
      next_step: `Once you have the PDF, call lit_procure_source again with file_path set to the downloaded file's absolute path.${isPaperlessConfigured() ? ' It will be automatically archived to Paperless-ngx.' : ''}`,
      example_followup: {
        tool: 'lit_procure_source',
        params: {
          file_path: '/path/to/downloaded.pdf',
          title: source.title,
          author: source.author,
          year: source.year,
          citation_id: source.citation_id,
        },
      },
    },
    null,
    2,
  );
}
