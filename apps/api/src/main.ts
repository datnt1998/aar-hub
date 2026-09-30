import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

const app = configureApp(await NestFactory.create(AppModule));
await app.listen(process.env.PORT ?? 3000);
