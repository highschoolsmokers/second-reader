import { readFile } from 'fs/promises';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function setupDb(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  const schema = await readFile(join(__dirname, '..', 'sql', 'schema.sql'), 'utf-8');

  // Split on semicolons and execute each statement
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      await sql(statement);
      console.log('OK:', statement.slice(0, 60) + '...');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Skip "already exists" errors
      if (message.includes('already exists')) {
        console.log('SKIP (exists):', statement.slice(0, 60) + '...');
      } else {
        console.error('FAIL:', statement.slice(0, 60) + '...');
        console.error(message);
      }
    }
  }

  console.log('\nDatabase setup complete.');
}

setupDb();
