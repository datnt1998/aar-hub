/**
 * How a business rule failure maps to HTTP. Services throw DomainError subclasses and stay free of HTTP types;
 * the global ProblemFilter turns them into Problem responses.
 */
export const DOMAIN_ERROR_STATUS = {
  /** The resource does not exist (or the caller must not learn that it does). */
  not_found: 404,
  /** The caller is known but not allowed to do this. */
  forbidden: 403,
  /** The request is valid but the current state forbids it (expired, already accepted, terminated…). */
  conflict: 409,
  /** The input passed the schema but breaks a business rule that depends on more than its shape. */
  unprocessable: 422,
} as const;

export type DomainErrorKind = keyof typeof DOMAIN_ERROR_STATUS;

/**
 * Base class of business rule failures. Subclasses fix `code` (SCREAMING_SNAKE_CASE, feature prefix) and `kind`;
 * the message is English, safe to show to the API client as `detail`.
 *
 * @example
 * export class InvitationExpiredError extends DomainError {
 *   readonly code = 'INVITATION_EXPIRED';
 *   readonly kind = 'conflict';
 *   constructor() { super('The invitation has expired'); }
 * }
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  override get name(): string {
    return this.constructor.name;
  }
}
