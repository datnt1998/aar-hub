import type { ApplicationStatus, ApplicationType, NotificationKind, PlannedArtist } from '../db/schema.js';

/** Largest accepted upload (provisional: the file limits belong to another ticket). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** At most 3 files per application, including the business registration (ticket main flow, step 2). */
export const MAX_OTHER_ATTACHMENTS = 2;

/** Notification content, from the ticket (AC-PARTNER-ONBOARDING-01-09 and -10). Used as email subject/body and in-app message. */
export const MESSAGE_RECEIVED = 'Đơn tổ chức đã được nhận';
export const MESSAGE_NEW_FOR_ADMIN = 'Có đơn tổ chức mới cần nhận';

/** A file as Multer hands it over. */
export interface FileUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** True for an object shaped like a Multer file with at least one byte. */
export function isNonEmptyFile(value: unknown): value is FileUpload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buffer' in value &&
    Buffer.isBuffer(value.buffer) &&
    'size' in value &&
    typeof value.size === 'number' &&
    value.size > 0 &&
    'originalname' in value &&
    typeof value.originalname === 'string' &&
    'mimetype' in value &&
    typeof value.mimetype === 'string'
  );
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface StoredApplication {
  id: string;
  type: ApplicationType;
  status: ApplicationStatus;
  submittedAt: Date;
  contactName: string;
  contactEmail: string;
  legalName: string;
  taxId: string;
  sellOnly: boolean;
  plannedArtists: PlannedArtist[];
}

export interface AdminContact {
  id: string;
  email: string;
}

export interface InAppNotification {
  accountId: string;
  kind: NotificationKind;
  message: string;
}

export interface OutgoingEmail {
  toEmail: string;
  kind: NotificationKind;
  subject: string;
  body: string;
}

/**
 * Who is told about a submitted application.
 * - The contact email in the application always gets the confirmation email.
 * - The in-app confirmation goes only to the account bound to the application (none for an anonymous applicant).
 * - Every platform admin gets an email and an in-app notification, also when the applicant is an admin.
 */
export function planNotifications(
  contactEmail: string,
  applicantAccountId: string | undefined,
  admins: AdminContact[],
): { inApp: InAppNotification[]; emails: OutgoingEmail[] } {
  return {
    inApp: [
      ...(applicantAccountId
        ? [{ accountId: applicantAccountId, kind: 'APPLICATION_RECEIVED' as const, message: MESSAGE_RECEIVED }]
        : []),
      ...admins.map((admin) => ({
        accountId: admin.id,
        kind: 'APPLICATION_NEW_FOR_ADMIN' as const,
        message: MESSAGE_NEW_FOR_ADMIN,
      })),
    ],
    emails: [
      { toEmail: contactEmail, kind: 'APPLICATION_RECEIVED', subject: MESSAGE_RECEIVED, body: MESSAGE_RECEIVED },
      ...admins.map((admin) => ({
        toEmail: admin.email,
        kind: 'APPLICATION_NEW_FOR_ADMIN' as const,
        subject: MESSAGE_NEW_FOR_ADMIN,
        body: MESSAGE_NEW_FOR_ADMIN,
      })),
    ],
  };
}
