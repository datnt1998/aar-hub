import { Body, Controller, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblem, Returns } from '../common/http/decorators.js';
import { FileToBodyInterceptor } from './file-to-body.interceptor.js';
import { MAX_ATTACHMENT_BYTES } from './partner-applications.js';
import {
  type AttachmentUploadForm,
  AttachmentSchema,
  AttachmentUploadFormSchema,
  type AttachmentResponse,
  type OrganizationApplicationCreate,
  OrganizationApplicationCreateSchema,
  PartnerApplicationSchema,
  type PartnerApplicationResponse,
} from './partner-applications.schemas.js';
import { PartnerApplicationsService } from './partner-applications.service.js';

@ApiTags('partner-applications')
@Controller('partner-applications')
export class PartnerApplicationsController {
  constructor(private readonly applications: PartnerApplicationsService) {}

  @Post('attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }), FileToBodyInterceptor)
  @ApiOperation({
    summary: 'Tải lên một file đính kèm',
    description: `Bước trước khi nộp đơn. Dùng id trả về trong businessRegistrationAttachmentId / otherAttachmentIds. Không cần tài khoản. File tối đa ${MAX_ATTACHMENT_BYTES} byte.`,
  })
  @ApiConsumes('multipart/form-data')
  @Returns(HttpStatus.CREATED, AttachmentSchema)
  @ApiProblem(413, 'PAYLOAD_TOO_LARGE')
  uploadAttachment(
    @Body({ schema: AttachmentUploadFormSchema }) form: AttachmentUploadForm,
  ): Promise<AttachmentResponse> {
    return this.applications.uploadAttachment(form.file);
  }

  @Post('organization')
  @ApiOperation({
    summary: 'Nộp đơn đăng ký đối tác hình thức tổ chức',
    description:
      'Không cần tài khoản. Thành công: đơn ở SUBMITTED; email xác nhận gửi tới email liên hệ trong đơn; thông báo trong AarHub chỉ gửi tới tài khoản gắn với đơn (đơn gắn tài khoản khi có đăng nhập, chưa nối vào API); mọi admin nền tảng nhận email và thông báo trong AarHub. ' +
      'Trùng mã số thuế với đối tác hoặc đơn đang mở vẫn được nhận và không có cảnh báo nào trong phản hồi. Lỗi: không có đơn nào được tạo.',
  })
  @Returns(HttpStatus.CREATED, PartnerApplicationSchema)
  @ApiProblem(422, 'PARTNER_APPLICATION_BUSINESS_REGISTRATION_INVALID', 'PARTNER_APPLICATION_OTHER_ATTACHMENT_INVALID')
  submitOrganization(
    @Body({ schema: OrganizationApplicationCreateSchema }) body: OrganizationApplicationCreate,
  ): Promise<PartnerApplicationResponse> {
    return this.applications.submitOrganization(body);
  }
}
