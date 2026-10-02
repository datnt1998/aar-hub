import { STATUS_CODES } from 'node:http';
import { z } from 'zod';

/** Media type of every error response (RFC 9457). */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export const FieldErrorSchema = z
  .object({
    pointer: z.string().meta({
      description:
        'JSON Pointer (RFC 6901) to the invalid input, prefixed by its location: `/body/email`, `/query/page`, `/path/id`',
      example: '/body/email',
    }),
    code: z.string().meta({
      description:
        'Machine-readable reason: a schema issue code such as `too_small`, `invalid_format`; for a business error, the reason its route documents (`infected`)',
      example: 'invalid_format',
    }),
    detail: z.string().meta({ description: 'English explanation for developers; clients show their own text' }),
  })
  .meta({ id: 'FieldError' });

export const ProblemSchema = z
  .object({
    type: z.string().meta({ description: 'Problem type URI; `about:blank` when `code` is enough' }),
    title: z.string().meta({ description: 'HTTP reason phrase of `status`' }),
    status: z.int().meta({ description: 'HTTP status code' }),
    code: z.string().meta({
      description: 'Stable machine-readable error code; clients branch and translate on this',
      example: 'VALIDATION_FAILED',
    }),
    detail: z.string().optional().meta({ description: 'English explanation for developers; never shown as UI text' }),
    instance: z.string().meta({ description: 'Request path that produced the error' }),
    errors: z.array(FieldErrorSchema).optional().meta({
      description:
        'Per-input errors: every invalid input when `code` is VALIDATION_FAILED; the inputs a business error is about for the codes that name them',
    }),
  })
  .meta({ id: 'Problem', description: 'Error response (RFC 9457 Problem Details) with a required `code`' });

export type FieldError = z.infer<typeof FieldErrorSchema>;
export type Problem = z.infer<typeof ProblemSchema>;

/** Error code used when an HTTP error carries no specific code: the reason phrase in SCREAMING_SNAKE_CASE. */
export function defaultCode(status: number): string {
  return (STATUS_CODES[status] ?? `HTTP ${status}`).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function problem(status: number, code: string, instance: string, extra: Partial<Problem> = {}): Problem {
  return { type: 'about:blank', title: STATUS_CODES[status] ?? 'Error', status, code, instance, ...extra };
}
