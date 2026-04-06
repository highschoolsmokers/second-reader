import type { z } from 'zod';
import type { VerifyCitationInput } from '../schemas/tools.js';
import { queryCrossRef } from '../services/crossref.js';
import { getDb } from '../services/db.js';
import { queryOpenAlex } from '../services/openalex.js';
import { querySemanticScholar } from '../services/semantic-scholar.js';
import type { ExternalCitationResult } from '../types.js';

type VerifyCitationParams = z.infer<typeof VerifyCitationInput>;

export async function verifyCitation(params: VerifyCitationParams): Promise<string> {
  const sql = getDb();

  // Step 1: Check local cache
  let localResult: Record<string, unknown> | undefined;
  if (params.doi) {
    const rows = await sql(`SELECT * FROM citations WHERE doi = $1`, [params.doi]);
    localResult = rows[0] as Record<string, unknown> | undefined;
  }
  if (!localResult && params.title) {
    const rows = await sql(`SELECT * FROM citations WHERE title ILIKE $1`, [`%${params.title}%`]);
    localResult = rows[0] as Record<string, unknown> | undefined;
  }

  if (localResult?.bibliographic_verified) {
    return JSON.stringify({
      status: 'verified',
      source: 'local_cache',
      citation: localResult,
      full_text_available: localResult.full_text_indexed,
    });
  }

  // Step 2: Query external APIs in sequence
  let external: ExternalCitationResult | null = null;

  external = await queryCrossRef(params);
  if (!external) external = await querySemanticScholar(params);
  if (!external) external = await queryOpenAlex(params);

  if (!external) {
    return JSON.stringify({
      status: 'not_found',
      message: 'Citation could not be verified in any bibliographic database.',
      searched: ['crossref', 'semantic_scholar', 'openalex'],
      action: 'DO NOT include this citation. Mark as FLAGGED.',
    });
  }

  // Step 3: Cache the result
  const cached = await sql(
    `
    INSERT INTO citations (
      doi, title, authors, year, journal, volume, issue, pages,
      publisher, url, abstract,
      bibliographic_verified, verification_source, verified_at,
      crossref_data, semantic_scholar_data, openalex_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,NOW(),$13,$14,$15)
    ON CONFLICT (doi) DO UPDATE SET
      bibliographic_verified = TRUE,
      verification_source = $12,
      verified_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `,
    [
      external.doi,
      external.title,
      external.authors,
      external.year,
      external.journal,
      external.volume,
      external.issue,
      external.pages,
      external.publisher,
      external.url,
      external.abstract,
      external.source,
      JSON.stringify(external.crossref_data),
      JSON.stringify(external.semantic_scholar_data),
      JSON.stringify(external.openalex_data),
    ],
  );

  // Step 4: Queue for procurement if full text not available
  const citationId = (cached[0] as Record<string, unknown>).id;
  await sql(
    `
    INSERT INTO procurement_queue (citation_id, title, authors, journal, year, doi, reason)
    VALUES ($1, $2, $3, $4, $5, $6, 'Full text needed for quotation/argument verification')
    ON CONFLICT DO NOTHING
  `,
    [citationId, external.title, external.authors, external.journal, external.year, external.doi],
  );

  return JSON.stringify({
    status: 'verified',
    source: external.source,
    citation: cached[0],
    full_text_available: false,
    procurement_queued: true,
  });
}
