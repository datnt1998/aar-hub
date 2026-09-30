import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DB, PG_POOL, type AppDb } from './db.js';
import * as schema from './schema.js';

/**
 * PostgreSQL via Drizzle. The pool connects lazily: the API boots (health, OpenAPI export) without a database,
 * and a request that needs one fails until DATABASE_URL points at a reachable server.
 */
@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => new pg.Pool({ connectionString: process.env.DATABASE_URL }) },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: pg.Pool): AppDb => drizzle(pool, { schema }) },
  ],
  exports: [DB],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
