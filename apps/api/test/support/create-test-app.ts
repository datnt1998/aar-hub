import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModule, type TestingModuleBuilder } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../../src/app.setup.js';
import { Clock } from '../../src/common/time/clock.js';
import { type AppDb, DB, MIGRATIONS_FOLDER } from '../../src/db/db.js';
import * as schema from '../../src/db/schema.js';

/** Clock under test control: starts at a fixed instant and only moves when the test says so. */
export class TestClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(at: Date): void {
    this.current = new Date(at);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface TestAppOptions {
  /** Starting time of the TestClock. */
  now?: Date;
  /** Extra modules for this test only, e.g. a controller that exercises shared HTTP behavior. */
  imports?: (Type | DynamicModule)[];
  /** Replaces providers outside the system under test (mail sender, external services). */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export interface TestApp {
  app: INestApplication<Server>;
  /** Same handle the app uses, for arranging and asserting data. */
  db: AppDb;
  clock: TestClock;
  /** supertest agent bound to the app. */
  http: () => request.Agent;
  /** Empties every table in the public schema. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Boots the real AppModule with the server's options and setup, on an in-process PostgreSQL (PGlite) with the
 * committed migrations applied, and a TestClock. Call `close()` in afterAll.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const clock = new TestClock(options.now ?? new Date('2026-01-01T00:00:00.000Z'));
  let app: INestApplication<Server>;
  let moduleRef: TestingModule | undefined;
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(MIGRATIONS_FOLDER) });
    const builder = Test.createTestingModule({ imports: [AppModule, ...(options.imports ?? [])] })
      .overrideProvider(DB)
      .useValue(db)
      .overrideProvider(Clock)
      .useValue(clock);
    moduleRef = await (options.override?.(builder) ?? builder).compile();
    app = configureApp(
      moduleRef.createNestApplication<INestApplication<Server>>({ ...APP_OPTIONS, logger: ['error', 'warn'] }),
    );
    await app.init();
  } catch (error) {
    await moduleRef?.close().catch(() => undefined);
    await client.close();
    throw error;
  }

  return {
    app,
    db,
    clock,
    http: () => request(app.getHttpServer()),
    async reset(): Promise<void> {
      const { rows } = await client.query<{ name: string }>(
        `SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
      );
      if (rows.length > 0) {
        await db.execute(sql.raw(`TRUNCATE ${rows.map((row) => row.name).join(', ')} RESTART IDENTITY CASCADE`));
      }
    },
    async close(): Promise<void> {
      await app.close();
      await client.close();
    },
  };
}
