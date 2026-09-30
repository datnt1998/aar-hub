/**
 * Writes the API interface document (OpenAPI) to apps/api/openapi.json.
 * With --check, fails instead of writing when the committed file differs from the code.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';

const target = fileURLToPath(new URL('../../openapi.json', import.meta.url));
const check = process.argv.includes('--check');

const app = configureApp(await NestFactory.create(AppModule, { logger: false }));
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle('aar-hub API').setVersion('0.0.0').build(),
);
await app.close();

const next = `${JSON.stringify(document, null, 2)}\n`;

if (check) {
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current !== next) {
    console.error(`${target} is out of date with the API code. Run: pnpm openapi`);
    process.exit(1);
  }
  console.log(`${target} is up to date`);
} else {
  await writeFile(target, next);
  console.log(`wrote ${target}`);
}
