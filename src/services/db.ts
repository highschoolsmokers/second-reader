import { type NeonQueryFunction, neon } from '@neondatabase/serverless';
import { logger } from './logger.js';

let sql: NeonQueryFunction<false, false>;

export function getDb(): NeonQueryFunction<false, false> {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is required');
    sql = neon(url);
    logger.info('Database connection initialized');
  }
  return sql;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const db = getDb();
    await db(`SELECT 1`);
    return true;
  } catch (err) {
    logger.error('Database health check failed', { error: String(err) });
    return false;
  }
}
