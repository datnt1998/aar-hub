import { DomainError } from '../common/errors/domain-error.js';

export class ContractDateInFutureError extends DomainError {
  readonly code = 'PARTNER_CONTRACT_DATE_IN_FUTURE';
  readonly kind = 'unprocessable';

  constructor() {
    super('contractDate must not be later than today (Vietnam time)');
  }
}
