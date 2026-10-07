import pg from 'pg';
import { env } from '../config.js';

// DATE (OID 1082) como 'YYYY-MM-DD': sin esto pg crea un Date a medianoche del huso del
// servidor (UTC en prod) y el navegador en Chile lo muestra como el día anterior.
pg.types.setTypeParser(1082, (value: string) => value);

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
