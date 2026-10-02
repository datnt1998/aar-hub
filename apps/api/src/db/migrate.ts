/** Applies the committed SQL migrations (apps/api/drizzle) to the database at DATABASE_URL. */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { envSchema } from '../config/env.js';
import { MIGRATIONS_FOLDER } from './db.js';

// eslint-disable-next-line no-restricted-properties -- standalone script outside Nest; validated by envSchema
const { DATABASE_URL } = envSchema.parse(process.env);
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(MIGRATIONS_FOLDER) });
  console.log('migrations applied');
} finally {
  await pool.end();
}
