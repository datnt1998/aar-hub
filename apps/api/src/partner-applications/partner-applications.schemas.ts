import { z } from 'zod';
import { APPLICATION_STATUSES, APPLICATION_TYPES } from '../db/schema.js';
import { MAX_OTHER_ATTACHMENTS } from './partner-applications.js';

const Text = z.string().trim().min(1);

export const PlannedArtistSchema = z
  .strictObject({ name: Text.meta({ description: 'Tên nghệ sĩ dự kiến', example: 'Nguyễn Văn A' }) })
  .meta({ id: 'PlannedArtist' });

export const OrganizationApplicationCreateSchema = z
  .strictObject({
    contactName: Text.meta({ description: 'Họ tên người nộp đơn (người liên hệ)' }),
    contactEmail: z
      .preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.email())
      .meta({ description: 'Email liên hệ của người nộp đơn' }),
    legalName: Text.meta({ description: 'Tên pháp nhân' }),
    taxId: Text.meta({ description: 'Mã số thuế của pháp nhân' }),
    sellOnly: z
      .boolean()
      .default(false)
      .meta({ description: 'Chọn "chỉ bán hàng": không cần khai báo nghệ sĩ dự kiến' }),
    plannedArtists: z
      .array(PlannedArtistSchema)
      .default([])
      .meta({ description: 'Nghệ sĩ dự kiến. Bắt buộc ít nhất một nghệ sĩ khi sellOnly là false.' }),
    businessRegistrationAttachmentId: z.uuid().meta({
      description: 'Id file giấy đăng ký kinh doanh, lấy từ POST /api/partner-applications/attachments',
    }),
    otherAttachmentIds: z
      .array(z.uuid())
      .max(MAX_OTHER_ATTACHMENTS)
      .default([])
      .meta({
        description: `Id các file hồ sơ khác (tùy chọn), tối đa ${MAX_OTHER_ATTACHMENTS}: cả đơn tối đa ${MAX_OTHER_ATTACHMENTS + 1} file, tính cả giấy đăng ký kinh doanh. Mỗi file chỉ dùng một lần trong đơn.`,
      }),
  })
  .check((ctx) => {
    const { sellOnly, plannedArtists, businessRegistrationAttachmentId, otherAttachmentIds } = ctx.value;
    if (!sellOnly && plannedArtists.length === 0) {
      ctx.issues.push({
        code: 'custom',
        input: plannedArtists,
        path: ['plannedArtists'],
        message: 'At least one planned artist is required unless sellOnly is true',
      });
    }
    const ids = [businessRegistrationAttachmentId, ...otherAttachmentIds].map((id) => id.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      ctx.issues.push({
        code: 'custom',
        input: otherAttachmentIds,
        path: ['otherAttachmentIds'],
        message: 'Each attachment can be used once in an application',
      });
    }
  })
  .meta({ id: 'OrganizationApplicationCreateRequest' });

export type OrganizationApplicationCreate = z.infer<typeof OrganizationApplicationCreateSchema>;

export const AttachmentSchema = z
  .object({
    id: z.uuid(),
    fileName: z.string().meta({ description: 'Tên file gốc' }),
    contentType: z.string().meta({ description: 'MIME type do client gửi lên' }),
    sizeBytes: z.int().min(0),
  })
  .meta({ id: 'Attachment' });

export type AttachmentResponse = z.infer<typeof AttachmentSchema>;

export const PartnerApplicationSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(APPLICATION_TYPES),
    status: z.enum(APPLICATION_STATUSES),
    submittedAt: z.iso.datetime(),
    contactName: z.string(),
    contactEmail: z.string(),
    legalName: z.string(),
    taxId: z.string(),
    sellOnly: z.boolean(),
    plannedArtists: z.array(PlannedArtistSchema),
    businessRegistration: AttachmentSchema,
    otherAttachments: z.array(AttachmentSchema),
  })
  .meta({ id: 'PartnerApplication' });

export type PartnerApplicationResponse = z.infer<typeof PartnerApplicationSchema>;
