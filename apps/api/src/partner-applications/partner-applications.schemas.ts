import { z } from 'zod';
import { email, taxCode, text } from '../common/fields.js';
import { APPLICATION_STATUSES, LEGAL_FORMS } from '../db/schema.js';
import {
  type FileUpload,
  isNonEmptyFile,
  MAX_DECLARED_ARTISTS,
  MAX_FILE_BYTES,
  MAX_OTHER_DOCUMENTS,
} from './partner-applications.js';

const personName = () => text(1, 255);

/** Check: at most `max` items. Zod's own max check also measures strings, so a non-array would report two errors. */
const atMostItems =
  (max: number) =>
  (ctx: { value: unknown[]; issues: z.core.$ZodRawIssue[] }): void => {
    if (Array.isArray(ctx.value) && ctx.value.length > max) {
      ctx.issues.push({ code: 'too_big', origin: 'array', maximum: max, inclusive: true, input: ctx.value });
    }
  };

export const OrganizationApplicationCreateSchema = z
  .strictObject({
    legalForm: z.literal(LEGAL_FORMS[0]).meta({
      description:
        'Hình thức nộp đơn. Endpoint này chỉ nhận đơn "tổ chức"; "cá nhân" thuộc use case khác nên bị từ chối ở trường này.',
    }),
    applicantName: personName().meta({ description: 'Họ tên người nộp đơn, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
    contactEmail: email().meta({
      description:
        'Email liên hệ, tối đa 254 ký tự. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu. Đúng một dấu @, có ít nhất một ký tự trước @, phần sau @ có dấu chấm nhưng không bắt đầu và không kết thúc bằng dấu chấm, không có khoảng trắng; so khớp không phân biệt hoa thường',
    }),
    legalName: text(1, 255).meta({ description: 'Tên pháp nhân, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
    taxCode: taxCode().meta({
      description:
        'Mã số thuế: đúng 10 hoặc 13 chữ số, không gạch nối, không dấu cách ở giữa. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu',
    }),
    businessRegistration: z.uuid().meta({
      description:
        'Giấy đăng ký kinh doanh: id của đúng một file (pdf, jpg, png; tối đa 10 MB), lấy từ POST /api/partner-applications/attachments',
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
  })
  // Cross-field rules run even when other inputs are wrong (`when`), so one answer lists every error. A key that failed
  // its own check is absent from the value, so each rule reads only what is present and well-formed.
  .superRefine(
    (value, ctx) => {
      // The body may not be an object at all (missing, null, a string); the object check already reported that.
      if (typeof value !== 'object' || value === null) {
        return;
      }
      const { salesOnly, declaredArtists, businessRegistration, otherDocuments } = value as Partial<
        Record<keyof typeof value, unknown>
      >;
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
      const ids = [businessRegistration, ...(Array.isArray(otherDocuments) ? (otherDocuments as unknown[]) : [])]
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
    },
    { when: () => true },
  )
  .meta({ id: 'OrganizationApplicationCreateRequest' });

export type OrganizationApplicationCreate = z.infer<typeof OrganizationApplicationCreateSchema>;

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

/** The application as its submitter sees it. Files are visible to admins and the account bound to the application only. */
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
