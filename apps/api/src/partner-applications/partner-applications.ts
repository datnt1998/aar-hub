import type { AttachmentKind, LegalForm, NotificationKind } from '../db/schema.js';

/** Largest accepted file: 10 MB, where 1 MB = 1 048 576 bytes (businessRegistration, citizenIdImage and otherDocuments). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** The main document (businessRegistration or citizenIdImage) takes one file, otherDocuments up to two: three files per application. */
export const MAX_OTHER_DOCUMENTS = 2;

export const MAX_DECLARED_ARTISTS = 20;

/**
 * Notification content per legal form, from the tickets (AC-PARTNER-ONBOARDING-01-09/-10 and -14-02/-03). Used as email
 * subject/body and in-app message.
 */
export const MESSAGES: Record<LegalForm, { received: string; newForAdmin: string }> = {
  'tổ chức': { received: 'Đơn tổ chức đã được nhận', newForAdmin: 'Có đơn tổ chức mới cần nhận' },
  'cá nhân': { received: 'Đơn cá nhân đã được nhận', newForAdmin: 'Có đơn cá nhân mới cần nhận' },
};

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
    typeof value.originalname === 'string'
  );
}

interface FileKind {
  /** Content type stored for files of this kind (taken from the content, not from the client). */
  mime: string;
  extensions: readonly string[];
  /** The file starts with these bytes. */
  signature: readonly number[];
}

/** The file types the ticket allows: pdf, jpg, png. */
const FILE_KINDS: readonly FileKind[] = [
  { mime: 'application/pdf', extensions: ['pdf'], signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], signature: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', extensions: ['png'], signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/**
 * Content type of an allowed file, or undefined when it is not a pdf, jpg or png. The content must match one of the
 * three formats and the name's extension must agree with it, so a renamed file does not pass.
 */
export function allowedContentType(fileName: string, content: Uint8Array): string | undefined {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  const kind = FILE_KINDS.find((candidate) => candidate.signature.every((byte, index) => content[index] === byte));
  return kind?.extensions.includes(extension) ? kind.mime : undefined;
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** What the applicant typed, after validation. The legal form decides which identifier the application carries. */
export type NewApplication = {
  applicantName: string;
  contactEmail: string;
  legalName: string;
  salesOnly: boolean;
  declaredArtists: string[];
} & ({ legalForm: 'tổ chức'; taxCode: string } | { legalForm: 'cá nhân'; citizenId: string });

/** Files sent with an application: one main document of `kind` and up to two other documents (attachment ids). */
export interface ApplicationFiles {
  main: string;
  kind: Exclude<AttachmentKind, 'OTHER'>;
  otherDocuments: string[];
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
 * - The contact email in the application gets the confirmation email; the applicant gets no in-app notification.
 * - Every platform admin gets an email and an in-app notification.
 */
export function planNotifications(
  legalForm: LegalForm,
  contactEmail: string,
  admins: AdminContact[],
): { inApp: InAppNotification[]; emails: OutgoingEmail[] } {
  const { received, newForAdmin } = MESSAGES[legalForm];
  return {
    inApp: admins.map((admin) => ({
      accountId: admin.id,
      kind: 'APPLICATION_NEW_FOR_ADMIN' as const,
      message: newForAdmin,
    })),
    emails: [
      { toEmail: contactEmail, kind: 'APPLICATION_RECEIVED', subject: received, body: received },
      ...admins.map((admin) => ({
        toEmail: admin.email,
        kind: 'APPLICATION_NEW_FOR_ADMIN' as const,
        subject: newForAdmin,
        body: newForAdmin,
      })),
    ],
  };
}
