import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { type AppDb, DB } from '../db/db.js';
import { accounts, attachments, emailOutbox, notifications, partnerApplications } from '../db/schema.js';
import type {
  AdminContact,
  ApplicationFile,
  InAppNotification,
  NewApplication,
  OutgoingEmail,
} from './partner-applications.js';

/** Handle of one open database transaction, passed between the repository calls of a use case. */
export type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

@Injectable()
export class PartnerApplicationsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  async insertFiles(tx: Tx, applicationId: string, files: ApplicationFile[], now: Date): Promise<void> {
    if (files.length > 0) {
      await tx.insert(attachments).values(
        files.map((file) => ({
          applicationId,
          kind: file.kind,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.content.length,
          content: file.content,
          createdAt: now,
        })),
      );
    }
  }

  /** Stores a new application in SUBMITTED; returns what the database assigned. */
  async insertApplication(tx: Tx, input: NewApplication, now: Date): Promise<{ id: string; submittedAt: Date }> {
    const [row] = await tx
      .insert(partnerApplications)
      .values({
        legalForm: input.legalForm,
        status: 'SUBMITTED',
        applicantName: input.applicantName,
        contactEmail: input.contactEmail,
        legalName: input.legalName,
        taxCode: input.legalForm === 'tổ chức' ? input.taxCode : null,
        citizenId: input.legalForm === 'cá nhân' ? input.citizenId : null,
        salesOnly: input.salesOnly,
        declaredArtists: input.declaredArtists,
        submittedAt: now,
      })
      .returning({ id: partnerApplications.id, submittedAt: partnerApplications.submittedAt });
    if (!row) {
      throw new Error('insert into partner_applications returned no row');
    }
    return row;
  }

  findPlatformAdmins(tx: Tx): Promise<AdminContact[]> {
    return tx
      .select({ id: accounts.id, email: accounts.email })
      .from(accounts)
      .where(eq(accounts.isPlatformAdmin, true));
  }

  async insertNotifications(tx: Tx, applicationId: string, rows: InAppNotification[], now: Date): Promise<void> {
    if (rows.length > 0) {
      await tx.insert(notifications).values(rows.map((row) => ({ ...row, applicationId, createdAt: now })));
    }
  }

  async insertEmails(tx: Tx, applicationId: string, rows: OutgoingEmail[], now: Date): Promise<void> {
    if (rows.length > 0) {
      await tx.insert(emailOutbox).values(rows.map((row) => ({ ...row, applicationId, createdAt: now })));
    }
  }
}
