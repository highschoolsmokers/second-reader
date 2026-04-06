import type { z } from 'zod';
import type { LookupClaimsInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';

type LookupClaimsParams = z.infer<typeof LookupClaimsInput>;

export async function lookupClaims(params: LookupClaimsParams): Promise<string> {
  const sql = getDb();
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let idx = 1;

  if (params.theorist) {
    conditions.push(`theorist ILIKE $${idx}`);
    queryParams.push(`%${params.theorist}%`);
    idx++;
  }
  if (params.work_title) {
    conditions.push(`work_title ILIKE $${idx}`);
    queryParams.push(`%${params.work_title}%`);
    idx++;
  }
  if (params.keyword) {
    conditions.push(`$${idx} = ANY(keywords)`);
    queryParams.push(params.keyword);
    idx++;
  }
  if (params.tradition) {
    conditions.push(`tradition ILIKE $${idx}`);
    queryParams.push(`%${params.tradition}%`);
    idx++;
  }
  if (params.query) {
    conditions.push(`claim_summary ILIKE $${idx}`);
    queryParams.push(`%${params.query}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const results = await sql(
    `
    SELECT id, theorist, work_title, year, chapter, section,
           page_range, claim_summary, source_passage, keywords, tradition
    FROM claims ${whereClause}
    ORDER BY theorist, year
    LIMIT 20
  `,
    queryParams,
  );

  if (!results.length) {
    return 'No documented claims found matching these criteria. Any characterization of this argument should be marked as UNVERIFIED.';
  }

  return JSON.stringify(results, null, 2);
}
