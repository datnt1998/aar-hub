import { DomainError } from '../common/errors/domain-error.js';

export class FileTypeNotAllowedError extends DomainError {
  readonly code = 'PARTNER_APPLICATION_FILE_TYPE_NOT_ALLOWED';
  readonly kind = 'unprocessable';

  constructor() {
    super('Only pdf, jpg and png files are accepted');
  }
}

export class BusinessRegistrationInvalidError extends DomainError {
  readonly code = 'PARTNER_APPLICATION_BUSINESS_REGISTRATION_INVALID';
  readonly kind = 'unprocessable';

  constructor() {
    super('The business registration file does not exist or is already attached to an application');
  }
}

export class OtherDocumentsInvalidError extends DomainError {
  readonly code = 'PARTNER_APPLICATION_OTHER_DOCUMENTS_INVALID';
  readonly kind = 'unprocessable';

  constructor() {
    super('An additional document does not exist or is already attached to an application');
  }
}
