import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('GET /api/health', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication()) as INestApplication<Server>;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-HUB-INIT-01-01 returns ok and non-negative uptime in seconds', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', uptimeSeconds: expect.any(Number) });
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('AC-HUB-INIT-01-02 returns 404 without the /api prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
