import { createTestApp, type TestApp } from './support/create-test-app.js';

describe('GET /api/health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('AC-HUB-INIT-01-01 returns ok and non-negative uptime in seconds', async () => {
    const res = await t.http().get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', uptimeSeconds: expect.any(Number) });
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('AC-HUB-INIT-01-02 returns 404 without the /api prefix', async () => {
    await t.http().get('/health').expect(404);
  });
});
