import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DB, type AppDb } from '../db/db.js';
import {
  accounts,
  attachments,
  emailOutbox,
  notifications,
  partnerApplications,
  type NotificationKind,
} from '../db/schema.js';
import { validateOrganizationApplication } from './organization-application.validation.js';
import type { ApplicationValidationErrorDto, AttachmentDto, PartnerApplicationDto } from './partner-applications.dto.js';

/** Largest accepted upload. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Notification content, from the ticket (AC-PARTNER-ONBOARDING-01-09 and -10). Sent as email subject/body and in-app message. */
const MESSAGE_RECEIVED = 'Đơn tổ chức đã được nhận';
const MESSAGE_NEW_FOR_ADMIN = 'Có đơn tổ chức mới cần nhận';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class PartnerApplicationsService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async uploadAttachment(file: UploadedFile | undefined): Promise<AttachmentDto> {
    if (!file || file.size === 0) {
      throw new BadRequestException('A non-empty file is required');
    }
    const [row] = await this.db
      .insert(attachments)
      .values({
        // Multer decodes multipart file names as latin1; browsers send UTF-8.
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        contentType: file.mimetype,
        sizeBytes: file.size,
        content: file.buffer,
      })
      .returning({
        id: attachments.id,
        fileName: attachments.fileName,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
      });
    return row;
  }

  /**
   * Creates an organization application in SUBMITTED, or creates nothing. Duplicate tax ids are accepted silently.
   * `applicantAccountId` is the logged-in applicant's account: the application is bound to it and that account gets the
   * in-app notification. The caller (the auth layer) guarantees it is an existing account id. The confirmation email always goes to the contact email in the application.
   */
  async submitOrganization(body: unknown, applicantAccountId?: string): Promise<PartnerApplicationDto> {
    const parsed = validateOrganizationApplication(body);
    if (!parsed.ok) throw validationError(parsed.errors, 'Application is invalid');
    const input = parsed.value;

    return this.db.transaction(async (tx) => {
      const [application] = await tx
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
        })
        .returning();

      const attachmentColumns = {
        id: attachments.id,
        fileName: attachments.fileName,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
      };
      const unattached = (ids: string[]) => and(inArray(attachments.id, ids), isNull(attachments.applicationId));

      const [businessRegistration] = await tx
        .update(attachments)
        .set({ applicationId: application.id, kind: 'BUSINESS_REGISTRATION' })
        .where(unattached([input.businessRegistrationAttachmentId]))
        .returning(attachmentColumns);
      if (!businessRegistration) {
        throw validationError([{ field: 'businessRegistrationAttachmentId', reason: 'INVALID' }], 'Application is invalid');
      }

      const otherAttachments =
        input.otherAttachmentIds.length === 0
          ? []
          : await tx
              .update(attachments)
              .set({ applicationId: application.id, kind: 'OTHER' })
              .where(unattached(input.otherAttachmentIds))
              .returning(attachmentColumns);
      if (otherAttachments.length !== input.otherAttachmentIds.length) {
        throw validationError([{ field: 'otherAttachmentIds', reason: 'INVALID' }], 'Application is invalid');
      }

      const admins = await tx
        .select({ id: accounts.id, email: accounts.email })
        .from(accounts)
        .where(eq(accounts.isPlatformAdmin, true));

      const inApp: { accountId: string; kind: NotificationKind; message: string }[] = [
        ...(applicantAccountId
          ? [{ accountId: applicantAccountId, kind: 'APPLICATION_RECEIVED' as const, message: MESSAGE_RECEIVED }]
          : []),
        ...admins.map((a) => ({ accountId: a.id, kind: 'APPLICATION_NEW_FOR_ADMIN' as const, message: MESSAGE_NEW_FOR_ADMIN })),
      ];
      if (inApp.length > 0) {
        await tx.insert(notifications).values(inApp.map((n) => ({ ...n, applicationId: application.id })));
      }

      const emails: { toEmail: string; kind: NotificationKind; message: string }[] = [
        { toEmail: input.contactEmail, kind: 'APPLICATION_RECEIVED', message: MESSAGE_RECEIVED },
        ...admins.map((a) => ({ toEmail: a.email, kind: 'APPLICATION_NEW_FOR_ADMIN' as const, message: MESSAGE_NEW_FOR_ADMIN })),
      ];
      await tx
        .insert(emailOutbox)
        .values(emails.map((e) => ({ toEmail: e.toEmail, kind: e.kind, subject: e.message, body: e.message, applicationId: application.id })));

      return {
        id: application.id,
        type: application.type,
        status: application.status,
        submittedAt: application.submittedAt.toISOString(),
        contactName: application.contactName,
        contactEmail: application.contactEmail,
        legalName: application.legalName,
        taxId: application.taxId,
        sellOnly: application.sellOnly,
        plannedArtists: application.plannedArtists,
        businessRegistration,
        otherAttachments,
      };
    });
  }
}

function validationError(errors: ApplicationValidationErrorDto['errors'], message: string): BadRequestException {
  const body: ApplicationValidationErrorDto = { statusCode: 400, message, errors };
  return new BadRequestException(body);
}
