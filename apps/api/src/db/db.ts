import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

/** Drizzle database handle; node-postgres in the server, PGlite in tests. */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
