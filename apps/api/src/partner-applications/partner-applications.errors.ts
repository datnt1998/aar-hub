import { DomainError } from '../common/errors/domain-error.js';
import type { FieldError } from '../common/http/problem.js';

/**
 * A file of the application was found infected (BR-PARTNER-ONBOARDING-038). `errors` points at each file the scan
 * refused: `infected`, or `not_scanned` for a file the scanner gave no verdict on in the same submission.
 */
export class FileInfectedError extends DomainError {
  readonly code = 'PARTNER_APPLICATION_FILE_INFECTED';
  readonly kind = 'unprocessable';

  constructor(errors: FieldError[]) {
    super('A file was found infected with malware', errors);
  }
}

/** The scanner gave no verdict on a file (error or no reply in time); the applicant can try again later. */
export class FileScanUnavailableError extends DomainError {
  readonly code = 'PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE';
  readonly kind = 'unavailable';

  constructor(errors: FieldError[]) {
    super('A file could not be scanned for malware; try again later', errors);
  }
}
