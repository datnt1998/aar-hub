import { envSchema } from './env.js';

describe('envSchema', () => {
  it('boots with defaults when nothing is set', () => {
    expect(envSchema.parse({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: 3310,
      MALWARE_SCAN_TIMEOUT_MS: 30_000,
    });
  });

  it('reads PORT from its string form and rejects values outside the port range', () => {
    expect(envSchema.parse({ PORT: '8080' }).PORT).toBe(8080);
    expect(envSchema.safeParse({ PORT: '70000' }).success).toBe(false);
  });

  it('requires a postgres DATABASE_URL in production', () => {
    expect(envSchema.safeParse({ NODE_ENV: 'production' }).success).toBe(false);
    expect(envSchema.safeParse({ NODE_ENV: 'production', DATABASE_URL: 'mysql://h/db' }).success).toBe(false);
    expect(envSchema.parse({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h:5432/db' }).DATABASE_URL).toBe(
      'postgres://u:p@h:5432/db',
    );
  });
});
