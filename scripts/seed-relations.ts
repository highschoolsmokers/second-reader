import { neon } from '@neondatabase/serverless';
import { readFile } from 'fs/promises';

// Input: JSON array of { source_theorist, source_work, target_theorist, target_work, relation, notes }
// The script resolves theorist+work to claim IDs.

const args = process.argv.slice(2);

async function seedRelations(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  const filePath = args[0];
  const data = JSON.parse(await readFile(filePath, 'utf-8'));

  for (const rel of data) {
    // Find source claim
    const sourceClaims = await sql(
      `
      SELECT id FROM claims
      WHERE theorist ILIKE $1 AND work_title ILIKE $2
      LIMIT 1
    `,
      [`%${rel.source_theorist}%`, `%${rel.source_work}%`],
    );

    // Find target claim
    const targetClaims = await sql(
      `
      SELECT id FROM claims
      WHERE theorist ILIKE $1 AND work_title ILIKE $2
      LIMIT 1
    `,
      [`%${rel.target_theorist}%`, `%${rel.target_work}%`],
    );

    if (!sourceClaims.length || !targetClaims.length) {
      console.log(`SKIP: Could not resolve claims for ${rel.source_theorist} → ${rel.target_theorist}`);
      continue;
    }

    await sql(
      `
      INSERT INTO claim_relations (source_claim_id, target_claim_id, relation, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `,
      [sourceClaims[0].id, targetClaims[0].id, rel.relation, rel.notes],
    );

    console.log(`  ${rel.source_theorist} --[${rel.relation}]--> ${rel.target_theorist}`);
  }

  console.log('Done.');
}

seedRelations();
