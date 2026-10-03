import { DomainError } from '../common/errors/domain-error.js';

/** contractDate is later than today in Vietnam. `errors` points at it with the reason `in_future`. */
export class ContractDateInFutureError extends DomainError {
  readonly code = 'PARTNER_CONTRACT_DATE_IN_FUTURE';
  readonly kind = 'unprocessable';

  constructor() {
    super('contractDate must not be later than today (Vietnam time)', [
      { pointer: '/body/contractDate', code: 'in_future', detail: 'contractDate is later than today (Vietnam time)' },
    ]);
  }
}
