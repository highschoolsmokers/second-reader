import type { z } from 'zod';
import { MAX_CITATIONS_PER_VERIFY, QUOTATION_SIMILARITY_THRESHOLD } from '../constants.js';
import type { VerifyOutputInput } from '../schemas/tools.js';
import { callClaude } from '../services/claude.js';
import { getDb } from '../services/db.js';
import { generateEmbedding } from '../services/embeddings.js';
import { createRequestId, logger } from '../services/logger.js';
import type { ProcurementItem, VerificationResult } from '../types.js';

type VerifyOutputParams = z.infer<typeof VerifyOutputInput>;

interface ExtractedCitation {
  author: string;
  title: string;
  year: number | null;
  page: string | null;
  quotation: string | null;
  claim_about_argument: string | null;
  original_text: string;
}

const CONCURRENCY_LIMIT = 5;

async function processPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function verifyOutput(params: VerifyOutputParams): Promise<string> {
  const sql = getDb();
  const reqId = createRequestId();
  logger.info('Starting output verification', { reqId, session_id: params.session_id });

  // Step 1: Extract citations using Claude
  const extractionResponse = await callClaude(
    [
      {
        role: 'user',
        content: `Extract every citation, source reference, direct quotation, and characterization of a theorist's argument from the following text. Return ONLY a JSON array.

Each item:
- "author": author name
- "title": work title (if mentioned, or null)
- "year": publication year (number or null)
- "page": page number (if mentioned, or null)
- "quotation": any directly quoted text (or null)
- "claim_about_argument": if the text characterizes what a theorist argued (or null)
- "original_text": the exact sentence containing the reference

Text:
${params.agent_output}`,
      },
    ],
    2000,
  );

  let citations: ExtractedCitation[];
  try {
    citations = JSON.parse(extractionResponse.replace(/```json|```/g, '').trim());
  } catch {
    return JSON.stringify({
      error: 'Failed to parse citation extraction',
      raw: extractionResponse,
    });
  }

  // Guard: cap the number of citations to verify
  if (citations.length > MAX_CITATIONS_PER_VERIFY) {
    logger.warn('Citation count exceeds limit, truncating', {
      reqId,
      found: citations.length,
      limit: MAX_CITATIONS_PER_VERIFY,
    });
    citations = citations.slice(0, MAX_CITATIONS_PER_VERIFY);
  }

  const procurementItems: ProcurementItem[] = [];

  // Step 2: Verify each citation with bounded concurrency
  const results = await processPool(citations, CONCURRENCY_LIMIT, async (citation) => {
    try {
      return await verifySingleCitation(sql, citation, params.session_id, procurementItems, reqId);
    } catch (err) {
      logger.error('Citation verification failed', { reqId, citation: citation.original_text, error: String(err) });
      return {
        original_text: citation.original_text,
        confidence: 'flagged' as const,
        reason: `Verification error: ${String(err)}`,
        checks: {},
      };
    }
  });

  const summary = {
    total: results.length,
    verified: results.filter((r) => r.confidence === 'verified').length,
    plausible: results.filter((r) => r.confidence === 'plausible').length,
    flagged: results.filter((r) => r.confidence === 'flagged').length,
    sources_needed: procurementItems.length,
  };

  logger.info('Verification complete', { reqId, ...summary });

  return JSON.stringify(
    {
      session_id: params.session_id,
      summary,
      results,
      procurement_needed: procurementItems,
    },
    null,
    2,
  );
}

async function verifySingleCitation(
  sql: ReturnType<typeof getDb>,
  citation: ExtractedCitation,
  sessionId: string,
  procurementItems: ProcurementItem[],
  _reqId: string,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    original_text: citation.original_text,
    confidence: 'unverified',
    reason: '',
    checks: {},
  };

  // Existence check
  let citationRecord: Record<string, unknown> | null = null;

  if (citation.title) {
    const rows = await sql(`SELECT * FROM citations WHERE title ILIKE $1 AND bibliographic_verified = TRUE`, [
      `%${citation.title}%`,
    ]);
    citationRecord = (rows[0] as Record<string, unknown>) || null;
  }

  if (!citationRecord && citation.author && citation.title) {
    const { verifyCitation } = await import('./verify-citation.js');
    const verifyResult = JSON.parse(
      await verifyCitation({ title: citation.title, author: citation.author, year: citation.year ?? undefined }),
    );

    if (verifyResult.status === 'verified') {
      citationRecord = verifyResult.citation;
      result.checks.existence = 'verified';
    } else {
      result.checks.existence = 'not_found';
      result.confidence = 'flagged';
      result.reason = 'Citation not found in any bibliographic database';

      await sql(
        `
        INSERT INTO verification_log (session_id, check_type, input_claim, result, details)
        VALUES ($1, 'citation_existence', $2, 'flagged', $3)
      `,
        [sessionId, citation.original_text, JSON.stringify({ title: citation.title, author: citation.author })],
      );

      return result;
    }
  } else if (citationRecord) {
    result.checks.existence = 'verified';
  }

  // Full text check
  const hasFullText = citationRecord?.full_text_indexed === true;

  if (!hasFullText && citationRecord) {
    result.confidence = 'plausible';
    result.reason = 'Source exists but full text not indexed';

    procurementItems.push({
      title: citationRecord.title as string,
      authors: citationRecord.authors as string[],
      journal: citationRecord.journal as string | null,
      year: citationRecord.year as number | null,
      doi: citationRecord.doi as string | null,
      citation_id: citationRecord.id as string,
      reason: 'Full text needed for quotation/argument verification',
    });

    return result;
  }

  // Quotation check — graded confidence
  if (citation.quotation && citationRecord?.text_id) {
    const embedding = await generateEmbedding(citation.quotation);
    const matches = await sql(
      `
      SELECT content, page_number, 1 - (embedding <=> $1::vector) AS similarity
      FROM text_chunks WHERE text_id = $2
      ORDER BY embedding <=> $1::vector LIMIT 3
    `,
      [JSON.stringify(embedding), citationRecord.text_id],
    );

    if (matches.length) {
      const sim = matches[0].similarity as number;
      const confidence_grade =
        sim >= 0.95
          ? 'exact'
          : sim >= QUOTATION_SIMILARITY_THRESHOLD
            ? 'high'
            : sim >= 0.70
              ? 'moderate'
              : sim >= 0.55
                ? 'low'
                : 'no_match';

      result.checks.quotation = {
        match: sim >= QUOTATION_SIMILARITY_THRESHOLD,
        similarity: sim,
        confidence_grade,
        closest_passage: matches[0].content as string,
        closest_page: matches[0].page_number as number | null,
        runner_up_similarity: matches.length > 1 ? (matches[1].similarity as number) : null,
      };
    }
  }

  // Argument fidelity check
  if (citation.claim_about_argument && citation.author) {
    const claims = await sql(
      `
      SELECT claim_summary, source_passage FROM claims
      WHERE theorist ILIKE $1
      ORDER BY work_title LIMIT 10
    `,
      [`%${citation.author}%`],
    );

    if (claims.length) {
      const claimsSummary = claims
        .map((c: Record<string, unknown>) => `Claim: ${c.claim_summary}\nSource: ${c.source_passage || 'N/A'}`)
        .join('\n---\n');

      const fidelityResponse = await callClaude(
        [
          {
            role: 'user',
            content: `Compare this characterization against documented claims. Is it faithful?

CHARACTERIZATION: ${citation.claim_about_argument}

DOCUMENTED CLAIMS:
${claimsSummary}

Return ONLY JSON: {"faithful": true/false, "analysis": "brief explanation"}`,
          },
        ],
        500,
      );

      try {
        result.checks.argument_fidelity = JSON.parse(fidelityResponse.replace(/```json|```/g, '').trim());
      } catch {
        result.checks.argument_fidelity = { faithful: false, analysis: 'Parse error in fidelity check' };
      }
    }
  }

  // Determine overall confidence
  const hasFlag =
    result.checks.existence === 'not_found' ||
    result.checks.quotation?.match === false ||
    result.checks.argument_fidelity?.faithful === false;

  const allVerified =
    result.checks.existence === 'verified' &&
    result.checks.quotation?.match !== false &&
    result.checks.argument_fidelity?.faithful !== false;

  result.confidence = hasFlag ? 'flagged' : allVerified ? 'verified' : 'plausible';
  result.reason = hasFlag
    ? 'One or more checks failed'
    : allVerified
      ? 'All checks passed'
      : 'Some checks could not be completed';

  // Log
  await sql(
    `
    INSERT INTO verification_log (session_id, check_type, input_claim, result, details)
    VALUES ($1, 'citation_existence', $2, $3, $4)
  `,
    [sessionId, citation.original_text, result.confidence, JSON.stringify(result.checks)],
  );

  return result;
}
