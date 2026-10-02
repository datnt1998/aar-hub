import { z } from 'zod';

/**
 * Environment variables of the API, validated once at startup (ConfigModule). Read them through
 * `ConfigService<Env, true>`, never `process.env`. Variables needed only to boot have defaults so tests and the
 * OpenAPI export run without a .env; anything secret is required where it is used.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    /** PostgreSQL connection string. Optional outside production: connections open on first query. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;
