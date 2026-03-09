import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import { schema } from './schema';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  ssl:
    env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
  options: '-c search_path=public',
});

export const db = drizzle(pool, { schema });
