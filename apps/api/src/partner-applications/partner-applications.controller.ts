import {
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApplicationValidationErrorDto,
  AttachmentDto,
  PartnerApplicationDto,
  SubmitOrganizationApplicationDto,
} from './partner-applications.dto.js';
import { MAX_ATTACHMENT_BYTES, PartnerApplicationsService, type UploadedFile as UploadedFileInput } from './partner-applications.service.js';

@ApiTags('partner-applications')
@Controller('partner-applications')
export class PartnerApplicationsController {
  constructor(private readonly applications: PartnerApplicationsService) {}

  @Post('attachments')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  @ApiOperation({
    summary: 'Tải lên một file đính kèm',
    description: 'Bước trước khi nộp đơn. Dùng id trả về trong businessRegistrationAttachmentId / otherAttachmentIds. Không cần tài khoản.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: AttachmentDto })
  @ApiBadRequestResponse({ description: 'Thiếu file hoặc file rỗng' })
  @ApiPayloadTooLargeResponse({ description: `File lớn hơn ${MAX_ATTACHMENT_BYTES} byte` })
  uploadAttachment(@UploadedFile() file?: UploadedFileInput): Promise<AttachmentDto> {
    return this.applications.uploadAttachment(file);
  }

  @Post('organization')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Nộp đơn đăng ký đối tác hình thức tổ chức',
    description:
      'Không cần tài khoản. Thành công: đơn ở SUBMITTED; email xác nhận gửi tới email liên hệ trong đơn; thông báo trong AarHub chỉ gửi tới tài khoản gắn với đơn (đơn gắn tài khoản khi có đăng nhập, chưa nối vào API); mọi admin nền tảng nhận email và thông báo trong AarHub. ' +
      'Trùng mã số thuế với đối tác hoặc đơn đang mở vẫn được nhận và không có cảnh báo nào trong phản hồi. Lỗi: không có đơn nào được tạo.',
  })
  @ApiCreatedResponse({ type: PartnerApplicationDto })
  @ApiBadRequestResponse({
    type: ApplicationValidationErrorDto,
    description: 'Thiếu hoặc sai thông tin bắt buộc; errors liệt kê từng trường.',
  })
  submitOrganization(@Body() body: SubmitOrganizationApplicationDto): Promise<PartnerApplicationDto> {
    return this.applications.submitOrganization(body);
  }
}
