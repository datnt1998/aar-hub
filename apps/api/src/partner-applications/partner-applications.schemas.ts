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
  MAX_FILES_PER_APPLICATION,
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

/** Fewest files per input; the main document of each legal form is required (BR-PARTNER-ONBOARDING-018). */
const MIN_FILES: Record<FileInput, number> = { businessRegistration: 1, citizenIdImage: 1, otherDocuments: 0 };

/**
 * The files of one input, repeated form parts with the same name. The count is checked even when a file is wrong,
 * so too many files and a wrong file are reported together (BR-PARTNER-ONBOARDING-054). Only a list is counted: a
 * value that is not one already failed as invalid_type. The count limits are also published as minItems/maxItems.
 */
const files = (input: FileInput) =>
  z
    .array(uploadedFile)
    .superRefine(
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
            message: `At most ${MAX_FILES_PER_APPLICATION} files per application: ${MAX_FILES[input]} here`,
          });
        }
      },
      { when: () => true },
    )
    .meta({ maxItems: MAX_FILES[input], ...(MIN_FILES[input] > 0 ? { minItems: MIN_FILES[input] } : {}) });

const FILE_RULES = `pdf, jpg hoặc png nhận theo nội dung tệp, không theo đuôi tên; mỗi tệp tối đa ${MAX_FILE_BYTES} byte (10 MB). Cả đơn tối đa ${MAX_FILES_PER_APPLICATION} tệp. Tệp sai định dạng: invalid_format tại /body/<trường>/<thứ tự>; tệp quá lớn: too_big tại /body/<trường>/<thứ tự>; quá số tệp: too_big tại /body/<trường>`;

/** Who applies, the same for every legal form (BE-01, BE-14). */
const applicantContact = () => ({
  applicantName: personName().meta({ description: 'Họ tên người nộp đơn, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
  contactEmail: text(1, 254, { pattern: EMAIL_SHAPE, format: 'email' }).meta({
    format: 'email',
    description:
      'Email liên hệ, tối đa 254 ký tự. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu. Đúng một dấu @, có ít nhất một ký tự trước @, phần sau @ có dấu chấm nhưng không bắt đầu và không kết thúc bằng dấu chấm, không có khoảng trắng; so khớp không phân biệt hoa thường',
  }),
});

/** What every application holds besides its legal entity: other documents, sales only, declared artists. */
const applicationDetails = () => ({
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
      maxItems: MAX_DECLARED_ARTISTS,
      description: `Tên nghệ sĩ dự kiến, mỗi tên một phần form cùng tên declaredArtists; ${MAX_DECLARED_ARTISTS} mục tối đa, mỗi tên 1–255 ký tự. Bắt buộc ít nhất một khi salesOnly là false.`,
    }),
});

/**
 * Cross-field rule of every application: at least one declared artist unless sales only. It runs even when other
 * inputs are wrong (`when`), so one answer lists every error. A key that failed its own check is absent from the
 * value, so the rule reads only what is present and well-formed.
 */
function declaredArtistsRequired(value: unknown, ctx: z.RefinementCtx): void {
  // The body may not be an object at all (missing, null, a string); the object check already reported that.
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const { salesOnly, declaredArtists } = value as Record<string, unknown>;
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
}

export const OrganizationApplicationCreateSchema = z
  .strictObject({
    legalForm: z.literal(LEGAL_FORMS[0]).meta({
      description:
        'Hình thức nộp đơn. Endpoint này chỉ nhận đơn "tổ chức"; đơn "cá nhân" nộp qua POST /api/partner-applications/individual.',
    }),
    ...applicantContact(),
    legalName: text(1, 255).meta({ description: 'Tên pháp nhân, 1–255 ký tự, không chỉ gồm khoảng trắng' }),
    taxCode: text(1, 13, { pattern: TAX_CODE_SHAPE, format: 'regex' }).meta({
      minLength: 10,
      pattern: '^([0-9]{10}|[0-9]{13})$',
      description:
        'Mã số thuế: đúng 10 hoặc 13 chữ số, không gạch nối, không dấu cách ở giữa. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu',
    }),
    businessRegistration: files('businessRegistration').meta({
      description: `Giấy đăng ký kinh doanh: đúng ${MAX_FILES.businessRegistration} tệp, gửi cùng đơn. ${FILE_RULES}. Bỏ trống: invalid_type; danh sách rỗng: too_small`,
    }),
    ...applicationDetails(),
  })
  .superRefine(declaredArtistsRequired, { when: () => true })
  .meta({ id: 'OrganizationApplicationCreateRequest' });

export type OrganizationApplicationCreate = z.infer<typeof OrganizationApplicationCreateSchema>;

export const IndividualApplicationCreateSchema = z
  .strictObject({
    legalForm: z.literal(LEGAL_FORMS[1]).meta({
      description:
        'Hình thức nộp đơn. Endpoint này chỉ nhận đơn "cá nhân"; đơn "tổ chức" nộp qua POST /api/partner-applications.',
    }),
    ...applicantContact(),
    legalName: text(1, 255).meta({
      description: 'Họ tên pháp nhân cá nhân, 1–255 ký tự, không chỉ gồm khoảng trắng',
    }),
    citizenId: text(1, 12, { pattern: CITIZEN_ID_SHAPE, format: 'regex' }).meta({
      minLength: 12,
      pattern: '^[0-9]{12}$',
      description:
        'Số CCCD: đúng 12 chữ số, chỉ gồm chữ số. Khoảng trắng hai đầu được bỏ trước khi kiểm và không được lưu. Trùng với đối tác hay đơn đang mở vẫn được nhận; cảnh báo trùng chỉ dành cho admin. Bỏ trống: invalid_type; rỗng: too_small; thiếu số hoặc có ký tự khác chữ số: invalid_format; quá 12 ký tự: too_big',
    }),
    citizenIdImage: files('citizenIdImage').meta({
      description: `Ảnh CCCD: đúng ${MAX_FILES.citizenIdImage} tệp, gửi cùng đơn. ${FILE_RULES}. Bỏ trống: invalid_type; danh sách rỗng: too_small`,
    }),
    ...applicationDetails(),
  })
  .superRefine(declaredArtistsRequired, { when: () => true })
  .meta({ id: 'IndividualApplicationCreateRequest' });

export type IndividualApplicationCreate = z.infer<typeof IndividualApplicationCreateSchema>;

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
