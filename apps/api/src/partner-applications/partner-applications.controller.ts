import { Body, Controller, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblem, Returns } from '../common/http/decorators.js';
import { attachmentStorage } from './attachment-storage.js';
import { FilesToBodyInterceptor } from './files-to-body.interceptor.js';
import {
  type IndividualApplicationCreate,
  IndividualApplicationCreateSchema,
  IndividualPartnerApplicationSchema,
  type IndividualPartnerApplicationResponse,
  type OrganizationApplicationCreate,
  OrganizationApplicationCreateSchema,
  PartnerApplicationSchema,
  type PartnerApplicationResponse,
} from './partner-applications.schemas.js';
import { PartnerApplicationsService } from './partner-applications.service.js';
import { FILE_INPUTS } from './partner-applications.js';

/**
 * Hard caps on the multipart form, far above what a valid application uses (3 files; 6 fields plus 20 artist names),
 * so an abusive request is cut off with 400 instead of being read in full. Below them every error is reported.
 */
const FORM_LIMITS = { files: 10, fields: 100 };

/** How a submission of either legal form is handled; `duplicate` names the identifier checked for duplicates. */
const submitDescription = (duplicate: string) =>
  'Không cần tài khoản. Một lần gửi multipart/form-data gồm thông tin đơn và các tệp; không có bước tải tệp lên trước. ' +
  'Hệ thống kiểm số tệp, định dạng (theo nội dung) và dung lượng của mọi tệp cùng mọi trường khác, báo mọi chỗ sai trong một lần (400 VALIDATION_FAILED); ' +
  'đơn hợp lệ thì quét mã độc từng tệp rồi mới nhận đơn. Tệp nhiễm mã độc: 422 PARTNER_APPLICATION_FILE_INFECTED; chưa quét được: 503 PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE, thử lại sau; errors[].pointer chỉ tệp bị từ chối (code infected hoặc not_scanned). ' +
  'Thành công: đơn ở SUBMITTED cùng các tệp; email xác nhận gửi tới email liên hệ trong đơn, người nộp đơn không nhận thông báo trong AarHub; mọi admin nền tảng nhận email và thông báo trong AarHub. ' +
  `Trùng ${duplicate} với đối tác hoặc đơn đang mở vẫn được nhận và phản hồi không có cảnh báo nào. Lỗi: không có đơn nào được tạo và không tệp nào được lưu. ` +
  `Quá ${FORM_LIMITS.files} tệp hoặc ${FORM_LIMITS.fields} trường chữ: 400 BAD_REQUEST.`;

@ApiTags('partner-applications')
@Controller('partner-applications')
export class PartnerApplicationsController {
  constructor(private readonly applications: PartnerApplicationsService) {}

  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({ storage: attachmentStorage(FILE_INPUTS['tổ chức']), limits: FORM_LIMITS }),
    FilesToBodyInterceptor,
  )
  @ApiOperation({
    summary: 'Nộp đơn đăng ký đối tác hình thức tổ chức, kèm tệp',
    description: submitDescription('mã số thuế'),
  })
  @ApiConsumes('multipart/form-data')
  @Returns(HttpStatus.CREATED, PartnerApplicationSchema)
  @ApiProblem(422, 'PARTNER_APPLICATION_FILE_INFECTED')
  @ApiProblem(503, 'PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE')
  submitOrganization(
    @Body({ schema: OrganizationApplicationCreateSchema }) body: OrganizationApplicationCreate,
  ): Promise<PartnerApplicationResponse> {
    return this.applications.submitOrganization(body);
  }

  @Post('individual')
  @UseInterceptors(
    AnyFilesInterceptor({ storage: attachmentStorage(FILE_INPUTS['cá nhân']), limits: FORM_LIMITS }),
    FilesToBodyInterceptor,
  )
  @ApiOperation({
    summary: 'Nộp đơn đăng ký đối tác hình thức cá nhân, kèm ảnh CCCD và hồ sơ khác',
    description: submitDescription('số CCCD'),
  })
  @ApiConsumes('multipart/form-data')
  @Returns(HttpStatus.CREATED, IndividualPartnerApplicationSchema)
  @ApiProblem(422, 'PARTNER_APPLICATION_FILE_INFECTED')
  @ApiProblem(503, 'PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE')
  submitIndividual(
    @Body({ schema: IndividualApplicationCreateSchema }) body: IndividualApplicationCreate,
  ): Promise<IndividualPartnerApplicationResponse> {
    return this.applications.submitIndividual(body);
  }
}
