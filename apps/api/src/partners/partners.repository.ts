import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { type AppDb, DB } from '../db/db.js';
import { partnerApplications, partners } from '../db/schema.js';
import type { LegalIdentity, MatchedApplication, MatchedPartner } from './partners.js';

@Injectable()
export class PartnersRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** Partners with this tax code or citizen id, oldest first. */
  findPartners(identity: LegalIdentity): Promise<MatchedPartner[]> {
    return this.db
      .select({ id: partners.id, status: partners.status })
      .from(partners)
      .where(
        'taxCode' in identity ? eq(partners.taxCode, identity.taxCode) : eq(partners.citizenId, identity.citizenId),
      )
      .orderBy(asc(partners.createdAt), asc(partners.id));
  }

  /** Applications with this tax code or citizen id, in any status, oldest first. */
  findApplications(identity: LegalIdentity): Promise<MatchedApplication[]> {
    return this.db
      .select({ id: partnerApplications.id, status: partnerApplications.status })
      .from(partnerApplications)
      .where(
        'taxCode' in identity
          ? eq(partnerApplications.taxCode, identity.taxCode)
          : eq(partnerApplications.citizenId, identity.citizenId),
      )
      .orderBy(asc(partnerApplications.submittedAt), asc(partnerApplications.id));
  }
}
