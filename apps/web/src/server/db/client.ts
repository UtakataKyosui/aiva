import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import { schema } from './schema';

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: false,
  connection: {
    search_path: 'public',
  },
});

export const db = drizzle(sql, { schema });
