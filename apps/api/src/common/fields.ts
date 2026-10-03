import { z } from 'zod';

/** Length in Unicode characters of an already trimmed, NFC-normalised string. */
const characters = (value: string): number => [...value].length;

/**
 * FD-EMAIL with DEC-PARTNER-ONBOARDING-015: exactly one @, at least one character before it, a dot after it that is
 * neither the first nor the last character of the part after @, no whitespace. Matching is case-insensitive, so the
 * value is kept as typed.
 */
const EMAIL_SHAPE = /^[^@\s]+@(?=[^@\s]*\.)[^.@\s][^@\s]*[^.@\s]$/;

/** Exactly 10 or 13 digits, no hyphen, no space (FD-TAX-CODE). */
const TAX_CODE_SHAPE = /^(?:[0-9]{10}|[0-9]{13})$/;

/** Exactly 12 digits (FD-CITIZEN-ID). */
const CITIZEN_ID_SHAPE = /^[0-9]{12}$/;

/**
 * Text input of a ticket: surrounding whitespace is dropped, the rest is Unicode NFC, and the length is counted in
 * characters between `min` and `max`. `shape` adds a format rule.
 */
export function text(min: number, max: number, shape?: { pattern: RegExp; format: string }) {
  return z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(
      z.string().check((ctx) => {
        const length = characters(ctx.value);
        if (length < min) {
          ctx.issues.push({ code: 'too_small', origin: 'string', minimum: min, inclusive: true, input: ctx.value });
        } else if (length > max) {
          ctx.issues.push({ code: 'too_big', origin: 'string', maximum: max, inclusive: true, input: ctx.value });
        } else if (shape && !shape.pattern.test(ctx.value)) {
          ctx.issues.push({ code: 'invalid_format', format: shape.format, input: ctx.value });
        }
      }),
    )
    .meta({ minLength: min, maxLength: max });
}

/** FD-EMAIL: at most 254 characters, shape as EMAIL_SHAPE. */
export const email = () => text(1, 254, { pattern: EMAIL_SHAPE, format: 'email' }).meta({ format: 'email' });

/** FD-TAX-CODE: exactly 10 or 13 digits. Any length from 1 to 13 that is not 10 or 13 fails as `invalid_format`. */
export const taxCode = () =>
  text(1, 13, { pattern: TAX_CODE_SHAPE, format: 'regex' }).meta({
    minLength: 10,
    pattern: '^([0-9]{10}|[0-9]{13})$',
  });

/** FD-CITIZEN-ID: exactly 12 digits. */
export const citizenId = () =>
  text(12, 12, { pattern: CITIZEN_ID_SHAPE, format: 'regex' }).meta({ pattern: '^[0-9]{12}$' });
