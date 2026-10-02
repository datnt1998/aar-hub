import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lt } from 'drizzle-orm';
import { type AppDb, DB } from '../db/db.js';
import {
  accounts,
  applicationSubmissions,
  attachments,
  emailOutbox,
  notifications,
  partnerApplications,
} from '../db/schema.js';
import type {
  AcceptedApplication,
  AdminContact,
  ApplicationFile,
  InAppNotification,
  NewApplication,
  OutgoingEmail,
  SubmissionKey,
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

  /** The application accepted for this key at or after `since`, if any. */
  async findRecentSubmission(key: SubmissionKey, since: Date): Promise<string | undefined> {
    const [row] = await this.db
      .select({ applicationId: applicationSubmissions.applicationId })
      .from(applicationSubmissions)
      .where(
        and(
          eq(applicationSubmissions.legalForm, key.legalForm),
          eq(applicationSubmissions.legalId, key.legalId),
          eq(applicationSubmissions.contactEmail, key.contactEmail),
          gte(applicationSubmissions.acceptedAt, since),
        ),
      );
    return row?.applicationId;
  }

  /**
   * Claims the key for `applicationId`, unless another application was accepted for it at or after `since`; returns
   * the application that holds the key. While another transaction holds an uncommitted claim on the same key, the
   * primary key makes this one wait for it, then see its claim (or take the key if it rolled back).
   */
  async claimSubmission(tx: Tx, key: SubmissionKey, applicationId: string, now: Date, since: Date): Promise<string> {
    const [claimed] = await tx
      .insert(applicationSubmissions)
      .values({ ...key, applicationId, acceptedAt: now })
      .onConflictDoUpdate({
        target: [applicationSubmissions.legalForm, applicationSubmissions.legalId, applicationSubmissions.contactEmail],
        set: { applicationId, acceptedAt: now },
        setWhere: lt(applicationSubmissions.acceptedAt, since),
      })
      .returning({ applicationId: applicationSubmissions.applicationId });
    if (claimed) {
      return claimed.applicationId;
    }
    const [holder] = await tx
      .select({ applicationId: applicationSubmissions.applicationId })
      .from(applicationSubmissions)
      .where(
        and(
          eq(applicationSubmissions.legalForm, key.legalForm),
          eq(applicationSubmissions.legalId, key.legalId),
          eq(applicationSubmissions.contactEmail, key.contactEmail),
        ),
      );
    if (!holder) {
      throw new Error('application_submissions has neither claimed nor kept the key');
    }
    return holder.applicationId;
  }

  /** The fields of an accepted application that its key does not hold. */
  async findAcceptedApplication(id: string): Promise<AcceptedApplication> {
    const [row] = await this.db
      .select({
        id: partnerApplications.id,
        submittedAt: partnerApplications.submittedAt,
        applicantName: partnerApplications.applicantName,
        contactEmail: partnerApplications.contactEmail,
        legalName: partnerApplications.legalName,
        salesOnly: partnerApplications.salesOnly,
        declaredArtists: partnerApplications.declaredArtists,
      })
      .from(partnerApplications)
      .where(eq(partnerApplications.id, id));
    if (!row) {
      throw new Error(`partner application ${id} not found`);
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
