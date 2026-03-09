import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

const main = async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  await pool.end();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
