import { neon } from '@neondatabase/serverless';
import { readFile } from 'fs/promises';
import * as readline from 'readline';

const args = process.argv.slice(2);

async function seedFromFile(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  const filePath = args[0];
  const data = JSON.parse(await readFile(filePath, 'utf-8'));

  if (!Array.isArray(data)) {
    console.error('Expected a JSON array of claim objects.');
    process.exit(1);
  }

  console.log(`Seeding ${data.length} claims...`);

  for (const claim of data) {
    const [row] = await sql(`
      INSERT INTO claims (theorist, work_title, year, chapter, section, page_range,
                          claim_summary, source_passage, keywords, tradition, text_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `, [
      claim.theorist, claim.work_title, claim.year,
      claim.chapter, claim.section, claim.page_range,
      claim.claim_summary, claim.source_passage,
      claim.keywords || [], claim.tradition, claim.text_id,
    ]);

    console.log(`  Added: ${claim.theorist} — ${claim.claim_summary.slice(0, 60)}... (${row.id})`);
  }

  console.log('Done.');
}

async function seedInteractive(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

  console.log('Interactive claim entry. Type "done" to finish.\n');

  while (true) {
    const theorist = await ask('Theorist: ');
    if (theorist === 'done') break;

    const work_title = await ask('Work title: ');
    const year = await ask('Year (or empty): ');
    const chapter = await ask('Chapter/section (or empty): ');
    const claim_summary = await ask('Claim summary: ');
    const source_passage = await ask('Source passage (or empty): ');
    const keywords = await ask('Keywords (comma-separated): ');
    const tradition = await ask('Tradition (or empty): ');

    await sql(`
      INSERT INTO claims (theorist, work_title, year, chapter, claim_summary,
                          source_passage, keywords, tradition)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      theorist, work_title,
      year ? parseInt(year) : null,
      chapter || null,
      claim_summary,
      source_passage || null,
      keywords.split(',').map(k => k.trim()).filter(Boolean),
      tradition || null,
    ]);

    console.log('Added.\n');
  }

  rl.close();
  console.log('Done.');
}

if (args[0] && !args[0].startsWith('--')) {
  seedFromFile();
} else {
  seedInteractive();
}
