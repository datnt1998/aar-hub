import type { AttachmentKind, LegalForm, NotificationKind } from '../db/schema.js';

/** Largest accepted file: 10 MB, where 1 MB = 1 048 576 bytes (BR-PARTNER-ONBOARDING-041). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Files per input. One main document (business registration or citizen ID image) and up to two other documents: at
 * most three files per application (BR-PARTNER-ONBOARDING-037), so a submission with more than three files always
 * breaks one of these limits.
 */
export const MAX_FILES = { businessRegistration: 1, citizenIdImage: 1, otherDocuments: 2 } as const;
export type FileInput = keyof typeof MAX_FILES;

/** Most files one application carries: its main document and the other documents. */
export const MAX_FILES_PER_APPLICATION = 1 + MAX_FILES.otherDocuments;

/** The file inputs of each legal form (BR-PARTNER-ONBOARDING-018). */
export const FILE_INPUTS = {
  'tổ chức': ['businessRegistration', 'otherDocuments'],
  'cá nhân': ['citizenIdImage', 'otherDocuments'],
} as const satisfies Record<LegalForm, readonly FileInput[]>;

export const MAX_DECLARED_ARTISTS = 20;

/**
 * Notification content per legal form, from the tickets (AC-PARTNER-ONBOARDING-01-09/-10 and -14-02/-03). Used as email
 * subject/body and in-app message.
 */
export const MESSAGES: Record<LegalForm, { received: string; newForAdmin: string }> = {
  'tổ chức': { received: 'Đơn tổ chức đã được nhận', newForAdmin: 'Có đơn tổ chức mới cần nhận' },
  'cá nhân': { received: 'Đơn cá nhân đã được nhận', newForAdmin: 'Có đơn cá nhân mới cần nhận' },
};

/**
 * A file of the submission as the upload storage hands it over. `size` is the real size; `buffer` holds the whole
 * content only when the file can be accepted (see attachment-storage.ts), otherwise just enough to check it.
 */
export interface FileUpload {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** True for an object shaped like an uploaded file. */
export function isFileUpload(value: unknown): value is FileUpload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buffer' in value &&
    Buffer.isBuffer(value.buffer) &&
    'size' in value &&
    typeof value.size === 'number' &&
    'originalname' in value &&
    typeof value.originalname === 'string'
  );
}

/** The file types the ticket allows (BR-PARTNER-ONBOARDING-036), each with the bytes its content starts with. */
const FILE_TYPES = [
  { contentType: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { contentType: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  { contentType: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
] as const;

/** Bytes needed from the start of a file to tell its type. */
export const SIGNATURE_BYTES = Math.max(...FILE_TYPES.map((type) => type.signature.length));

/**
 * Content type of a pdf, jpg or png file, or undefined for any other content. Only the content counts, never the
 * file name: a Word file renamed to .pdf is refused, and a real pdf is a pdf whatever its name.
 */
export function detectFileType(content: Uint8Array): string | undefined {
  return FILE_TYPES.find((type) => type.signature.every((byte, index) => content[index] === byte))?.contentType;
}

/** A file that passed the type and size checks, ready to scan and store. */
export interface AcceptedFile {
  fileName: string;
  contentType: string;
  content: Buffer;
}

/** A file stored with an application. `kind` is the input the applicant put it in; the system never classifies files. */
export interface ApplicationFile extends AcceptedFile {
  kind: AttachmentKind;
}

/** What the applicant typed, after validation. The legal form decides which identifier the application carries. */
export type NewApplication = {
  applicantName: string;
  contactEmail: string;
  legalName: string;
  salesOnly: boolean;
  declaredArtists: string[];
} & ({ legalForm: 'tổ chức'; taxCode: string } | { legalForm: 'cá nhân'; citizenId: string });

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
