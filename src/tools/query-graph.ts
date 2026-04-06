import type { z } from 'zod';
import type { QueryGraphInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';

type QueryGraphParams = z.infer<typeof QueryGraphInput>;

export async function queryGraph(params: QueryGraphParams): Promise<string> {
  const sql = getDb();

  if (params.claim_id) {
    const directionMap = {
      outgoing: 'cr.source_claim_id = $1',
      incoming: 'cr.target_claim_id = $1',
      both: '(cr.source_claim_id = $1 OR cr.target_claim_id = $1)',
    };

    const queryParams: unknown[] = [params.claim_id];
    let relationFilter = '';
    if (params.relation_type) {
      relationFilter = `AND cr.relation = $2`;
      queryParams.push(params.relation_type);
    }

    const results = await sql(
      `
      SELECT
        cr.relation, cr.notes,
        sc.theorist AS source_theorist, sc.work_title AS source_work,
        sc.claim_summary AS source_claim,
        tc.theorist AS target_theorist, tc.work_title AS target_work,
        tc.claim_summary AS target_claim
      FROM claim_relations cr
      JOIN claims sc ON cr.source_claim_id = sc.id
      JOIN claims tc ON cr.target_claim_id = tc.id
      WHERE ${directionMap[params.direction]} ${relationFilter}
      ORDER BY sc.theorist, tc.theorist
    `,
      queryParams,
    );

    if (!results.length) {
      return 'No relationships found for this claim. Any stated relationship should be marked as INFERENCE.';
    }
    return JSON.stringify(results, null, 2);
  } else if (params.theorist) {
    const queryParams: unknown[] = [`%${params.theorist}%`, `%${params.theorist}%`];
    let relationFilter = '';
    if (params.relation_type) {
      relationFilter = `AND cr.relation = $3`;
      queryParams.push(params.relation_type);
    }

    const results = await sql(
      `
      SELECT
        cr.relation, cr.notes,
        sc.theorist AS source_theorist, sc.work_title AS source_work,
        sc.claim_summary AS source_claim,
        tc.theorist AS target_theorist, tc.work_title AS target_work,
        tc.claim_summary AS target_claim
      FROM claim_relations cr
      JOIN claims sc ON cr.source_claim_id = sc.id
      JOIN claims tc ON cr.target_claim_id = tc.id
      WHERE (sc.theorist ILIKE $1 OR tc.theorist ILIKE $2) ${relationFilter}
      ORDER BY sc.theorist, tc.theorist
    `,
      queryParams,
    );

    if (!results.length) {
      return `No documented relationships found involving ${params.theorist}. Any stated relationship should be marked as INFERENCE.`;
    }
    return JSON.stringify(results, null, 2);
  }

  return 'Provide either a claim_id or theorist name to query the graph.';
}
