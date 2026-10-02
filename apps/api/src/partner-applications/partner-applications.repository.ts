import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { type AppDb, DB } from '../db/db.js';
import {
  accounts,
  attachments,
  type AttachmentKind,
  emailOutbox,
  notifications,
  partnerApplications,
} from '../db/schema.js';
import type {
  AdminContact,
  Attachment,
  FileUpload,
  InAppNotification,
  OutgoingEmail,
  StoredApplication,
} from './partner-applications.js';
import type { OrganizationApplicationCreate } from './partner-applications.schemas.js';

/** Handle of one open database transaction, passed between the repository calls of a use case. */
export type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

const attachmentColumns = {
  id: attachments.id,
  fileName: attachments.fileName,
  contentType: attachments.contentType,
  sizeBytes: attachments.sizeBytes,
};

@Injectable()
export class PartnerApplicationsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  async insertAttachment(file: FileUpload, fileName: string, now: Date): Promise<Attachment> {
    const [row] = await this.db
      .insert(attachments)
      .values({
        fileName,
        contentType: file.mimetype,
        sizeBytes: file.size,
        content: file.buffer,
        createdAt: now,
      })
      .returning(attachmentColumns);
    if (!row) {
      throw new Error('insert into attachments returned no row');
    }
    return row;
  }

  async insertApplication(
    tx: Tx,
    input: OrganizationApplicationCreate,
    applicantAccountId: string | undefined,
    now: Date,
  ): Promise<StoredApplication> {
    const [row] = await tx
      .insert(partnerApplications)
      .values({
        type: 'ORGANIZATION',
        status: 'SUBMITTED',
        applicantAccountId: applicantAccountId ?? null,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        legalName: input.legalName,
        taxId: input.taxId,
        sellOnly: input.sellOnly,
        plannedArtists: input.plannedArtists,
        submittedAt: now,
      })
      .returning({
        id: partnerApplications.id,
        type: partnerApplications.type,
        status: partnerApplications.status,
        submittedAt: partnerApplications.submittedAt,
        contactName: partnerApplications.contactName,
        contactEmail: partnerApplications.contactEmail,
        legalName: partnerApplications.legalName,
        taxId: partnerApplications.taxId,
        sellOnly: partnerApplications.sellOnly,
        plannedArtists: partnerApplications.plannedArtists,
      });
    if (!row) {
      throw new Error('insert into partner_applications returned no row');
    }
    return row;
  }

  /** Attaches the given uploads to the application. Uploads that do not exist or are attached already are skipped. */
  attachUploads(tx: Tx, applicationId: string, ids: string[], kind: AttachmentKind): Promise<Attachment[]> {
    return tx
      .update(attachments)
      .set({ applicationId, kind })
      .where(and(inArray(attachments.id, ids), isNull(attachments.applicationId)))
      .returning(attachmentColumns);
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
