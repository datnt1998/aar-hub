import { Injectable } from '@nestjs/common';
import { Clock } from '../common/time/clock.js';
import { ContractDateInFutureError } from './partners.errors.js';
import { type DuplicateCheck, duplicateCheck, type LegalIdentity, today } from './partners.js';
import { PartnersRepository } from './partners.repository.js';
import type { DirectPartnerDraft, PartnerIdentity } from './partners.schemas.js';

/**
 * Preparing a direct partner creation (UC-PARTNER-ONBOARDING-15). Both checks only read: nothing is stored and no
 * Owner invitation is sent, so cancelling the creation leaves no trace. Creating the partner belongs to BE-04.
 */
@Injectable()
export class PartnersService {
  constructor(
    private readonly repository: PartnersRepository,
    private readonly clock: Clock,
  ) {}

  /** Duplicate warning for the legal identity typed so far. */
  async checkDuplicates(identity: PartnerIdentity): Promise<DuplicateCheck> {
    const key: LegalIdentity =
      identity.legalForm === 'tổ chức' ? { taxCode: identity.taxCode } : { citizenId: identity.citizenId };
    const [partners, applications] = await Promise.all([
      this.repository.findPartners(key),
      this.repository.findApplications(key),
    ]);
    return duplicateCheck(partners, applications);
  }

  /** Checks the complete draft and returns the duplicate warning the admin sees before confirming. */
  checkDirectCreation(draft: DirectPartnerDraft): Promise<DuplicateCheck> {
    // contractDate is at most today; YYYY-MM-DD strings compare in calendar order.
    if (draft.contractDate > today(this.clock.now())) {
      throw new ContractDateInFutureError();
    }
    return this.checkDuplicates(draft);
  }
}
