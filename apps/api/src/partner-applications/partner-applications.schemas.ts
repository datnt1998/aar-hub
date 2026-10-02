import { z } from 'zod';
import { APPLICATION_STATUSES, LEGAL_FORMS } from '../db/schema.js';
import {
  type AcceptedFile,
  detectFileType,
  type FileInput,
  isFileUpload,
  MAX_DECLARED_ARTISTS,
  MAX_FILE_BYTES,
  MAX_FILES,
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

/**
 * One uploaded file: pdf, jpg or png by its content (BR-PARTNER-ONBOARDING-036) and at most 10 MB
 * (BR-PARTNER-ONBOARDING-041). A file that breaks both rules gets both errors, at the file's own pointer.
 */
const uploadedFile = z
  .unknown()
  .check((ctx) => {
    if (!isFileUpload(ctx.value)) {
      ctx.issues.push({ code: 'invalid_type', expected: 'file', input: ctx.value });
      return;
    }
    if (!detectFileType(ctx.value.buffer)) {
      ctx.issues.push({
        code: 'invalid_format',
        format: 'pdf, jpg or png',
        input: ctx.value.originalname,
        message: 'Only pdf, jpg and png files are accepted, by their content',
      });
    }
    if (ctx.value.size > MAX_FILE_BYTES) {
      ctx.issues.push({
        code: 'too_big',
        origin: 'file',
        maximum: MAX_FILE_BYTES,
        inclusive: true,
        input: ctx.value.originalname,
      });
    }
  })
  .transform((value): AcceptedFile => {
    const file = value as { originalname: string; buffer: Buffer };
    return {
      // Multer decodes multipart file names as latin1; browsers send UTF-8.
      fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      contentType: detectFileType(file.buffer) ?? 'application/octet-stream',
      content: file.buffer,
    };
  })
  .meta({ type: 'string', format: 'binary' });

/** Fewest files per input; the registration is required (BR-PARTNER-ONBOARDING-018). */
const MIN_FILES: Record<FileInput, number> = { businessRegistration: 1, otherDocuments: 0 };

/**
 * The files of one input, repeated form parts with the same name. The count is checked even when a file is wrong,
 * so too many files and a wrong file are reported together (BR-PARTNER-ONBOARDING-054). Only a list is counted: a
 * value that is not one already failed as invalid_type.
 */
const files = (input: FileInput) =>
  z.array(uploadedFile).superRefine(
    (value, ctx) => {
      if (!Array.isArray(value)) {
        return;
      }
      if (value.length < MIN_FILES[input]) {
        ctx.addIssue({
          code: 'too_small',
          origin: 'array',
          minimum: MIN_FILES[input],
          inclusive: true,
          input: value,
          message: `At least ${MIN_FILES[input]} file required`,
        });
      }
      if (value.length > MAX_FILES[input]) {
        ctx.addIssue({
          code: 'too_big',
          origin: 'array',
          maximum: MAX_FILES[input],
          inclusive: true,
          input: value,
          message: `At most ${MAX_FILES.businessRegistration + MAX_FILES.otherDocuments} files per application: ${MAX_FILES[input]} here`,
        });
      }
    },
    { when: () => true },
  );

const FILE_RULES = `pdf, jpg hoặc png nhận theo nội dung tệp, không theo đuôi tên; mỗi tệp tối đa ${MAX_FILE_BYTES} byte (10 MB). Cả đơn tối đa ${MAX_FILES.businessRegistration + MAX_FILES.otherDocuments} tệp. Tệp sai định dạng: invalid_format tại /body/<trường>/<thứ tự>; tệp quá lớn: too_big tại /body/<trường>/<thứ tự>; quá số tệp: too_big tại /body/<trường>`;

export const OrganizationApplicationCreateSchema = z
  .strictObject({
    legalForm: z.literal(LEGAL_FORMS[0]).meta({
      description:
        'Hình thức nộp đơn. Endpoint này chỉ nhận đơn "tổ chức"; "cá nhân" thuộc use case khác nên bị từ chối ở trường này.',
    }),
    applicantName: personName().meta({ description: 'Họ tên người nộp đơn, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
    contactEmail: text(1, 254, { pattern: EMAIL_SHAPE, format: 'email' }).meta({
      format: 'email',
      description:
        'Email liên hệ, tối đa 254 ký tự. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu. Đúng một dấu @, có ít nhất một ký tự trước @, phần sau @ có dấu chấm nhưng không bắt đầu và không kết thúc bằng dấu chấm, không có khoảng trắng; so khớp không phân biệt hoa thường',
    }),
    legalName: text(1, 255).meta({ description: 'Tên pháp nhân, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
    taxCode: text(1, 13, { pattern: TAX_CODE_SHAPE, format: 'regex' }).meta({
      minLength: 10,
      pattern: '^([0-9]{10}|[0-9]{13})$',
      description:
        'Mã số thuế: đúng 10 hoặc 13 chữ số, không gạch nối, không dấu cách ở giữa. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu',
    }),
    businessRegistration: files('businessRegistration').meta({
      minItems: MIN_FILES.businessRegistration,
      description: `Giấy đăng ký kinh doanh: đúng ${MAX_FILES.businessRegistration} tệp, gửi cùng đơn. ${FILE_RULES}. Bỏ trống: invalid_type; danh sách rỗng: too_small`,
    }),
    otherDocuments: files('otherDocuments')
      .default([])
      .meta({
        description: `Hồ sơ khác (tùy chọn): tối đa ${MAX_FILES.otherDocuments} tệp, mỗi tệp một phần form cùng tên otherDocuments, gửi cùng đơn. ${FILE_RULES}`,
      }),
    salesOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true')
      .meta({
        description: 'Chọn "chỉ bán hàng" ("true"/"false"): không cần khai báo nghệ sĩ dự kiến. Mặc định "false".',
      }),
    declaredArtists: z
      // A form field sent once arrives as one string, repeated as a list.
      .preprocess((value) => (typeof value === 'string' ? [value] : value), z.array(personName()))
      .check(atMostItems(MAX_DECLARED_ARTISTS))
      .default([])
      .meta({
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 255 },
        description: `Tên nghệ sĩ dự kiến, mỗi tên một phần form cùng tên declaredArtists; ${MAX_DECLARED_ARTISTS} mục tối đa, mỗi tên 1–255 ký tự. Bắt buộc ít nhất một khi salesOnly là false.`,
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
      const { salesOnly, declaredArtists } = value as Partial<Record<keyof typeof value, unknown>>;
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
    },
    { when: () => true },
  )
  .meta({ id: 'OrganizationApplicationCreateRequest' });

export type OrganizationApplicationCreate = z.infer<typeof OrganizationApplicationCreateSchema>;

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
