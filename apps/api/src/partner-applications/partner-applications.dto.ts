import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { APPLICATION_TYPES, APPLICATION_STATUSES, type ApplicationStatus, type ApplicationType } from '../db/schema.js';

export const FIELD_ERROR_FIELDS = [
  'contactName',
  'contactEmail',
  'legalName',
  'taxId',
  'sellOnly',
  'plannedArtists',
  'businessRegistrationAttachmentId',
  'otherAttachmentIds',
] as const;
export type FieldErrorField = (typeof FIELD_ERROR_FIELDS)[number];

export const FIELD_ERROR_REASONS = ['REQUIRED', 'INVALID', 'TOO_MANY'] as const;
export type FieldErrorReason = (typeof FIELD_ERROR_REASONS)[number];

export class PlannedArtistDto {
  @ApiProperty({ description: 'Tên nghệ sĩ dự kiến', example: 'Nguyễn Văn A' })
  name: string;
}

export class SubmitOrganizationApplicationDto {
  @ApiProperty({ description: 'Họ tên người nộp đơn (người liên hệ)' })
  contactName: string;

  @ApiProperty({ description: 'Email liên hệ của người nộp đơn', format: 'email' })
  contactEmail: string;

  @ApiProperty({ description: 'Tên pháp nhân' })
  legalName: string;

  @ApiProperty({ description: 'Mã số thuế của pháp nhân' })
  taxId: string;

  @ApiPropertyOptional({
    description: 'Chọn "chỉ bán hàng": không cần khai báo nghệ sĩ dự kiến. Mặc định false.',
    default: false,
  })
  sellOnly?: boolean;

  @ApiPropertyOptional({
    type: [PlannedArtistDto],
    description: 'Nghệ sĩ dự kiến. Bắt buộc ít nhất một nghệ sĩ khi sellOnly là false.',
  })
  plannedArtists?: PlannedArtistDto[];

  @ApiProperty({
    format: 'uuid',
    description: 'Id file giấy đăng ký kinh doanh, lấy từ POST /api/partner-applications/attachments',
  })
  businessRegistrationAttachmentId: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Id các file hồ sơ khác (tùy chọn), tối đa 2 (cả đơn tối đa 3 file, tính cả giấy đăng ký kinh doanh). Lấy từ POST /api/partner-applications/attachments',
  })
  otherAttachmentIds?: string[];
}

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Tên file gốc' })
  fileName: string;

  @ApiProperty({ description: 'MIME type do client gửi lên' })
  contentType: string;

  @ApiProperty({ minimum: 0 })
  sizeBytes: number;
}

export class PartnerApplicationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: APPLICATION_TYPES })
  type: ApplicationType;

  @ApiProperty({ enum: APPLICATION_STATUSES })
  status: ApplicationStatus;

  @ApiProperty({ format: 'date-time' })
  submittedAt: string;

  @ApiProperty()
  contactName: string;

  @ApiProperty({ format: 'email' })
  contactEmail: string;

  @ApiProperty()
  legalName: string;

  @ApiProperty()
  taxId: string;

  @ApiProperty()
  sellOnly: boolean;

  @ApiProperty({ type: [PlannedArtistDto] })
  plannedArtists: PlannedArtistDto[];

  @ApiProperty({ type: AttachmentDto })
  businessRegistration: AttachmentDto;

  @ApiProperty({ type: [AttachmentDto] })
  otherAttachments: AttachmentDto[];
}

export class FieldErrorDto {
  @ApiProperty({ enum: FIELD_ERROR_FIELDS, description: 'Trường thiếu hoặc không hợp lệ' })
  field: FieldErrorField;

  @ApiProperty({
    enum: FIELD_ERROR_REASONS,
    description: 'REQUIRED: thiếu. INVALID: sai định dạng, hoặc file không tồn tại / đã gắn vào đơn khác. TOO_MANY: quá 3 file (tính cả giấy đăng ký kinh doanh).',
  })
  reason: FieldErrorReason;
}

export class ApplicationValidationErrorDto {
  @ApiProperty({ enum: [400] })
  statusCode: 400;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: [FieldErrorDto], description: 'Mọi trường lỗi; không có đơn nào được tạo.' })
  errors: FieldErrorDto[];
}
