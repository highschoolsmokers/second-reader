/**
 * Create the schema and apply pending migrations.
 *
 *   npm run setup-db
 *
 * - Fresh database: applies sql/schema.sql (which already contains every
 *   migration) and records all sql/migrate-*.sql files as applied.
 * - Existing database: applies any sql/migrate-*.sql not yet recorded in
 *   schema_migrations, in filename order. A database set up before migration
 *   tracking existed runs each migration once (they are re-runnable; 001
 *   rebuilds the HNSW index, which can take a while on a large corpus).
 *
 * Safe to re-run.
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type NeonQueryFunction, neon } from '@neondatabase/serverless';

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'sql');

type Sql = NeonQueryFunction<false, false>;

function splitStatements(text: string): string[] {
  return text
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, '').trim().length > 0);
}

async function runFile(sql: Sql, file: string): Promise<boolean> {
  const text = await readFile(join(sqlDir, file), 'utf-8');
  let ok = true;
  for (const statement of splitStatements(text)) {
    const label = statement.replace(/\s+/g, ' ').slice(0, 60);
    try {
      await sql(statement);
      console.log('OK:', `${label}...`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        console.log('SKIP (exists):', `${label}...`);
      } else {
        console.error('FAIL:', `${label}...`);
        console.error(message);
        ok = false;
      }
    }
  }
  return ok;
}

async function setupDb(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (checked the environment and ./.env).');
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  const [{ exists: hadSchema }] = (await sql(`SELECT to_regclass('public.canonical_texts') IS NOT NULL AS exists`)) as {
    exists: boolean;
  }[];

  console.log('== schema.sql');
  if (!(await runFile(sql, 'schema.sql'))) process.exit(1);

  await sql(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const migrations = (await readdir(sqlDir)).filter((f) => /^migrate-\d+.*\.sql$/.test(f)).sort();
  const applied = new Set(
    ((await sql(`SELECT filename FROM schema_migrations`)) as { filename: string }[]).map((r) => r.filename),
  );

  for (const file of migrations) {
    if (applied.has(file)) continue;
    if (!hadSchema) {
      // schema.sql already includes this migration's changes.
      console.log(`== ${file} (included in schema.sql, recording)`);
    } else {
      console.log(`== ${file}`);
      if (!(await runFile(sql, file))) {
        console.error(`Migration ${file} failed; not recorded. Fix and re-run.`);
        process.exit(1);
      }
    }
    await sql(`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
  }

  console.log('\nDatabase setup complete.');
}

setupDb();
