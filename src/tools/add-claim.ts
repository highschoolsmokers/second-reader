import type { z } from 'zod';
import type { AddClaimInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';
import { createRequestId, logger } from '../services/logger.js';

type AddClaimParams = z.infer<typeof AddClaimInput>;

export async function addClaim(params: AddClaimParams): Promise<string> {
  const sql = getDb();
  const reqId = createRequestId();
  logger.info('Adding claim', { reqId, theorist: params.theorist, work: params.work_title });

  // Insert the claim
  const rows = await sql(
    `
    INSERT INTO claims (theorist, work_title, text_id, year, chapter, section, page_range, claim_summary, source_passage, keywords, tradition)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, created_at
  `,
    [
      params.theorist,
      params.work_title,
      params.text_id || null,
      params.year || null,
      params.chapter || null,
      params.section || null,
      params.page_range || null,
      params.claim_summary,
      params.source_passage || null,
      params.keywords,
      params.tradition || null,
    ],
  );

  const claim = rows[0] as Record<string, unknown>;
  const claimId = claim.id as string;

  // Optionally create a relationship edge
  let relationCreated = false;
  if (params.relation) {
    // Verify target claim exists
    const target = await sql(`SELECT id FROM claims WHERE id = $1`, [params.relation.target_claim_id]);
    if (target.length > 0) {
      await sql(
        `
        INSERT INTO claim_relations (source_claim_id, target_claim_id, relation, notes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (source_claim_id, target_claim_id, relation) DO NOTHING
      `,
        [claimId, params.relation.target_claim_id, params.relation.type, params.relation.notes || null],
      );
      relationCreated = true;
      logger.info('Claim relation created', {
        reqId,
        source: claimId,
        target: params.relation.target_claim_id,
        type: params.relation.type,
      });
    } else {
      logger.warn('Target claim not found for relation', {
        reqId,
        targetId: params.relation.target_claim_id,
      });
    }
  }

  logger.info('Claim added', { reqId, claimId });

  return JSON.stringify(
    {
      status: 'created',
      claim_id: claimId,
      theorist: params.theorist,
      work_title: params.work_title,
      claim_summary: params.claim_summary,
      keywords: params.keywords,
      relation_created: relationCreated,
      relation_target: params.relation?.target_claim_id ?? null,
    },
    null,
    2,
  );
}
