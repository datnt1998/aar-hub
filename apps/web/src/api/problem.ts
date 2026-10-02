import type { components } from './schema.gen';

/** Error body of every API error (RFC 9457 Problem Details with a required `code`). */
export type Problem = components['schemas']['Problem'];
export type FieldError = components['schemas']['FieldError'];

export function isProblem(value: unknown): value is Problem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { status, code } = value as Record<string, unknown>;
  return typeof status === 'number' && typeof code === 'string';
}

/**
 * Form field path of a request-body pointer: `/body/owner/email` → `owner.email`, `/body/items/0/name` →
 * `items.0.name` (react-hook-form paths). Pointers outside the body (`/query/...`, `/path/...`) have no field.
 */
export function bodyFieldPath(pointer: string): string | undefined {
  if (!pointer.startsWith('/body/')) {
    return undefined;
  }
  return pointer
    .slice('/body/'.length)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
    .join('.');
}
