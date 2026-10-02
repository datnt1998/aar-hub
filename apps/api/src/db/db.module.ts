import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Env } from '../config/env.js';
import { type AppDb, DB, PG_POOL } from './db.js';
import * as schema from './schema.js';

/**
 * PostgreSQL via Drizzle. The pool connects on first query, so the API boots (health, OpenAPI export) without a
 * database; tests replace DB with PGlite (test/support/create-test-app.ts).
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new pg.Pool({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    },
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
