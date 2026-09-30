import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { DB } from '../../src/db/db.js';
import * as schema from '../../src/db/schema.js';

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Boots the real AppModule on an in-process PostgreSQL (PGlite) with the committed migrations applied. */
export async function createTestApp() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(db)
    .compile();
  const app = configureApp(moduleRef.createNestApplication()) as INestApplication<Server>;
  await app.init();

  return {
    app,
    db,
    async reset() {
      await db.execute(
        sql`TRUNCATE email_outbox, notifications, attachments, partner_applications, partners, accounts CASCADE`,
      );
    },
    async close() {
      await app.close();
      await client.close();
    },
  };
}
