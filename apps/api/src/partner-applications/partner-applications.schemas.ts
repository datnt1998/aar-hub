import { z } from 'zod';
import { APPLICATION_STATUSES, LEGAL_FORMS } from '../db/schema.js';
import {
  type FileUpload,
  isNonEmptyFile,
  MAX_DECLARED_ARTISTS,
  MAX_FILE_BYTES,
  MAX_OTHER_DOCUMENTS,
} from './partner-applications.js';

/** Length in Unicode characters of an already trimmed, NFC-normalised string. */
const characters = (value: string): number => [...value].length;

/**
 * FD-EMAIL with DEC-PARTNER-ONBOARDING-015: exactly one @, at least one character before it, a dot after it that is
 * neither the first nor the last character of the part after @, no whitespace. Matching is case-insensitive, so the
 * value is kept as typed.
 */
const EMAIL_SHAPE = /^[^@\s]+@(?=[^@\s]*\.)[^.@\s][^@\s]*[^.@\s]$/;

/** Exactly 10 or 13 digits, no hyphen, no space (FD-TAX-CODE). */
const TAX_CODE_SHAPE = /^(?:[0-9]{10}|[0-9]{13})$/;

/** Exactly 12 ASCII digits (FD-CITIZEN-ID). */
const CITIZEN_ID_SHAPE = /^[0-9]{12}$/;

/**
 * Text input of the ticket: surrounding whitespace is dropped, the rest is Unicode NFC, and the length is counted in
 * characters between `min` and `max`. `shape` adds a format rule.
 */
function text(min: number, max: number, shape?: { pattern: RegExp; format: string }) {
  return z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(
      z.string().check((ctx) => {
        const length = characters(ctx.value);
        if (length < min) {
          ctx.issues.push({ code: 'too_small', origin: 'string', minimum: min, inclusive: true, input: ctx.value });
        } else if (length > max) {
          ctx.issues.push({ code: 'too_big', origin: 'string', maximum: max, inclusive: true, input: ctx.value });
        } else if (shape && !shape.pattern.test(ctx.value)) {
          ctx.issues.push({ code: 'invalid_format', format: shape.format, input: ctx.value });
        }
      }),
    )
    .meta({ minLength: min, maxLength: max });
}

const personName = () => text(1, 255);

/** Check: at most `max` items. Zod's own max check also measures strings, so a non-array would report two errors. */
const atMostItems =
  (max: number) =>
  (ctx: { value: unknown[]; issues: z.core.$ZodRawIssue[] }): void => {
    if (Array.isArray(ctx.value) && ctx.value.length > max) {
      ctx.issues.push({ code: 'too_big', origin: 'array', maximum: max, inclusive: true, input: ctx.value });
    }
  };

/** Inputs every application has whatever its legal form, as the tickets give them (BE-01, BE-14). */
const applicantFields = {
  applicantName: personName().meta({ description: 'Họ tên người nộp đơn, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
  contactEmail: text(1, 254, { pattern: EMAIL_SHAPE, format: 'email' }).meta({
    format: 'email',
    description:
      'Email liên hệ, tối đa 254 ký tự. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu. Đúng một dấu @, có ít nhất một ký tự trước @, phần sau @ có dấu chấm nhưng không bắt đầu và không kết thúc bằng dấu chấm, không có khoảng trắng; so khớp không phân biệt hoa thường',
  }),
  otherDocuments: z
    .array(z.uuid())
    .check(atMostItems(MAX_OTHER_DOCUMENTS))
    .default([])
    .meta({
      description: `Hồ sơ khác (tùy chọn): id của tối đa ${MAX_OTHER_DOCUMENTS} file (pdf, jpg, png; tối đa 10 MB mỗi file). Cả đơn tối đa ${MAX_OTHER_DOCUMENTS + 1} file, mỗi file chỉ dùng một lần.`,
    }),
  salesOnly: z
    .boolean()
    .default(false)
    .meta({ description: 'Chọn "chỉ bán hàng": không cần khai báo nghệ sĩ dự kiến. Mặc định false.' }),
  declaredArtists: z
    .array(personName())
    .check(atMostItems(MAX_DECLARED_ARTISTS))
    .default([])
    .meta({
      description: `Tên nghệ sĩ dự kiến, ${MAX_DECLARED_ARTISTS} mục tối đa, mỗi tên 1–255 ký tự. Bắt buộc ít nhất một khi salesOnly là false.`,
    }),
};

/**
 * Cross-field rules of an application whose main document is under `main`: at least one declared artist unless
 * sales only, and each file used once. They run even when other inputs are wrong (`when`), so one answer lists every
 * error. A key that failed its own check is absent from the value, so each rule reads only what is present and
 * well-formed.
 */
function applicationRules(main: 'businessRegistration' | 'citizenIdImage') {
  return (value: unknown, ctx: z.RefinementCtx): void => {
    // The body may not be an object at all (missing, null, a string); the object check already reported that.
    if (typeof value !== 'object' || value === null) {
      return;
    }
    const { salesOnly, declaredArtists, otherDocuments, [main]: mainDocument } = value as Record<string, unknown>;
    if (salesOnly === false && Array.isArray(declaredArtists) && declaredArtists.length === 0) {
      ctx.addIssue({
        code: 'too_small',
        origin: 'array',
        minimum: 1,
        inclusive: true,
        input: declaredArtists,
        path: ['declaredArtists'],
        message: 'At least one declared artist is required unless salesOnly is true',
      });
    }
    const ids = [mainDocument, ...(Array.isArray(otherDocuments) ? (otherDocuments as unknown[]) : [])]
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        input: otherDocuments,
        path: ['otherDocuments'],
        message: 'Each file can be used once in an application',
      });
    }
  };
}

export const OrganizationApplicationCreateSchema = z
  .strictObject({
    legalForm: z.literal(LEGAL_FORMS[0]).meta({
      description:
        'Hình thức nộp đơn. Endpoint này chỉ nhận đơn "tổ chức"; đơn "cá nhân" nộp qua POST /api/partner-applications/individual.',
    }),
    applicantName: applicantFields.applicantName,
    contactEmail: applicantFields.contactEmail,
    legalName: text(1, 255).meta({ description: 'Tên pháp nhân, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
    taxCode: text(1, 13, { pattern: TAX_CODE_SHAPE, format: 'regex' }).meta({
      minLength: 10,
      pattern: '^([0-9]{10}|[0-9]{13})$',
      description:
        'Mã số thuế: đúng 10 hoặc 13 chữ số, không gạch nối, không dấu cách ở giữa. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu',
    }),
    businessRegistration: z.uuid().meta({
      description:
        'Giấy đăng ký kinh doanh: id của đúng một file (pdf, jpg, png; tối đa 10 MB), lấy từ POST /api/partner-applications/attachments',
    }),
    otherDocuments: applicantFields.otherDocuments,
    salesOnly: applicantFields.salesOnly,
    declaredArtists: applicantFields.declaredArtists,
  })
  .superRefine(applicationRules('businessRegistration'), { when: () => true })
  .meta({ id: 'OrganizationApplicationCreateRequest' });

export type OrganizationApplicationCreate = z.infer<typeof OrganizationApplicationCreateSchema>;

export const IndividualApplicationCreateSchema = z
  .strictObject({
    legalForm: z.literal(LEGAL_FORMS[1]).meta({
      description:
        'Hình thức nộp đơn. Endpoint này chỉ nhận đơn "cá nhân"; đơn "tổ chức" nộp qua POST /api/partner-applications.',
    }),
    applicantName: applicantFields.applicantName,
    contactEmail: applicantFields.contactEmail,
    legalName: text(1, 255).meta({
      description: 'Họ tên pháp nhân cá nhân, 1–255 ký tự, không chỉ gồm khoảng trắng',
    }),
    citizenId: text(1, 12, { pattern: CITIZEN_ID_SHAPE, format: 'regex' }).meta({
      minLength: 12,
      pattern: '^[0-9]{12}$',
      description:
        'Số CCCD: đúng 12 chữ số, chỉ gồm chữ số. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu. Trùng với đối tác hay đơn đang mở vẫn được nhận; cảnh báo trùng chỉ dành cho admin',
    }),
    citizenIdImage: z.uuid().meta({
      description:
        'Ảnh CCCD: id của đúng một file (pdf, jpg, png; tối đa 10 MB), lấy từ POST /api/partner-applications/attachments',
    }),
    otherDocuments: applicantFields.otherDocuments,
    salesOnly: applicantFields.salesOnly,
    declaredArtists: applicantFields.declaredArtists,
  })
  .superRefine(applicationRules('citizenIdImage'), { when: () => true })
  .meta({ id: 'IndividualApplicationCreateRequest' });

export type IndividualApplicationCreate = z.infer<typeof IndividualApplicationCreateSchema>;

/**
 * Upload form (multipart/form-data): one `file` part and nothing else. FileToBodyInterceptor puts the file Multer
 * parsed under `file`, so a missing or empty file and unknown form fields fail like any other input (400 VALIDATION_FAILED).
 */
export const AttachmentUploadFormSchema = z
  .strictObject({
    file: z
      .unknown()
      .refine((value): value is FileUpload => isNonEmptyFile(value), 'A non-empty file is required')
      .meta({
        type: 'string',
        format: 'binary',
        description: `File pdf, jpg hoặc png, tối đa ${MAX_FILE_BYTES} byte (10 MB)`,
      }),
  })
  .meta({ id: 'AttachmentUploadRequest' });

export type AttachmentUploadForm = z.infer<typeof AttachmentUploadFormSchema>;

export const AttachmentSchema = z
  .object({
    id: z.uuid(),
    fileName: z.string().meta({ description: 'Tên file gốc' }),
    contentType: z
      .string()
      .meta({ description: 'Loại file nhận ra từ nội dung: application/pdf, image/jpeg hoặc image/png' }),
    sizeBytes: z.int().min(0),
  })
  .meta({ id: 'Attachment' });

export type AttachmentResponse = z.infer<typeof AttachmentSchema>;

/** The organization application as its submitter sees it. Files are visible to admins and the account bound to the application only. */
export const PartnerApplicationSchema = z
  .object({
    id: z.uuid(),
    legalForm: z.enum(LEGAL_FORMS),
    status: z.literal(APPLICATION_STATUSES[0]),
    submittedAt: z.iso.datetime(),
    applicantName: z.string(),
    contactEmail: z.string(),
    legalName: z.string(),
    taxCode: z.string(),
    salesOnly: z.boolean(),
    declaredArtists: z.array(z.string()),
  })
  .meta({ id: 'PartnerApplication' });

export type PartnerApplicationResponse = z.infer<typeof PartnerApplicationSchema>;

/**
 * The individual application as its submitter sees it. A duplicate citizen ID warning is for admins only, so the
 * submitter's view never carries one. Files are visible to admins and the account bound to the application only.
 */
export const IndividualPartnerApplicationSchema = z
  .object({
    id: z.uuid(),
    legalForm: z.literal(LEGAL_FORMS[1]),
    status: z.literal(APPLICATION_STATUSES[0]),
    submittedAt: z.iso.datetime(),
    applicantName: z.string(),
    contactEmail: z.string(),
    legalName: z.string(),
    citizenId: z.string(),
    salesOnly: z.boolean(),
    declaredArtists: z.array(z.string()),
  })
  .meta({ id: 'IndividualPartnerApplication' });

export type IndividualPartnerApplicationResponse = z.infer<typeof IndividualPartnerApplicationSchema>;
