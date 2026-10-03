import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblem, Returns } from '../common/http/decorators.js';
import {
  type DirectPartnerDraft,
  DirectPartnerDraftSchema,
  type PartnerDuplicateCheckResponse,
  PartnerDuplicateCheckSchema,
  type PartnerIdentity,
  PartnerIdentitySchema,
} from './partners.schemas.js';
import { PartnersService } from './partners.service.js';

const NOTHING_STORED =
  'Chỉ kiểm, không lưu gì: không tạo đối tác, không gửi lời mời Owner. Hủy tạo là không gọi bước tạo đối tác, không cần gọi API nào.';

@ApiTags('partners')
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Post('duplicate-checks')
  @ApiOperation({
    summary: 'Kiểm trùng pháp nhân theo thông tin định danh',
    description: `Gọi ngay khi admin nhập xong mã số thuế (tổ chức) hoặc số CCCD (cá nhân) trên màn tạo đối tác trực tiếp. ${NOTHING_STORED}`,
  })
  @Returns(HttpStatus.OK, PartnerDuplicateCheckSchema)
  checkDuplicates(
    @Body({ schema: PartnerIdentitySchema }) body: PartnerIdentity,
  ): Promise<PartnerDuplicateCheckResponse> {
    return this.partners.checkDuplicates(body);
  }

  @Post('direct-creation-checks')
  @ApiOperation({
    summary: 'Kiểm toàn bộ dữ liệu màn tạo đối tác trực tiếp',
    description: `Kiểm mọi trường bắt buộc theo hình thức và trả cảnh báo trùng pháp nhân. Thành công nghĩa là dữ liệu đủ điều kiện; canConfirm cho biết có được xác nhận tạo không. ${NOTHING_STORED}`,
  })
  @Returns(HttpStatus.OK, PartnerDuplicateCheckSchema)
  @ApiProblem(422, 'PARTNER_CONTRACT_DATE_IN_FUTURE')
  checkDirectCreation(
    @Body({ schema: DirectPartnerDraftSchema }) body: DirectPartnerDraft,
  ): Promise<PartnerDuplicateCheckResponse> {
    return this.partners.checkDirectCreation(body);
  }
}
