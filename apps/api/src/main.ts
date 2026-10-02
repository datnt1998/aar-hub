import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APP_OPTIONS, configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

const app = configureApp(await NestFactory.create(AppModule, APP_OPTIONS));
app.enableShutdownHooks();
await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }));
