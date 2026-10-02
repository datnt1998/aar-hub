import { DomainError } from '../common/errors/domain-error.js';

export class BusinessRegistrationInvalidError extends DomainError {
  readonly code = 'PARTNER_APPLICATION_BUSINESS_REGISTRATION_INVALID';
  readonly kind = 'unprocessable';

  constructor() {
    super('The business registration file does not exist or is already attached to an application');
  }
}

export class OtherAttachmentInvalidError extends DomainError {
  readonly code = 'PARTNER_APPLICATION_OTHER_ATTACHMENT_INVALID';
  readonly kind = 'unprocessable';

  constructor() {
    super('An additional file does not exist or is already attached to an application');
  }
}
