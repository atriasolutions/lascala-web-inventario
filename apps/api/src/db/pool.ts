import pg from 'pg';
import { env } from '../config.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
