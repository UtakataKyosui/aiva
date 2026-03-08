import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sql } from './client';

const main = async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  await sql.end();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
