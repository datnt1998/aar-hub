import { z } from 'zod';
import { citizenId, email, taxCode, text } from '../common/fields.js';
import { LEGAL_FORMS, OPEN_APPLICATION_STATUSES, PARTNER_STATUSES } from '../db/schema.js';

const TRIMMED = 'Khoảng trắng hai đầu được bỏ trước khi kiểm';

const organizationIdentity = {
  legalForm: z.literal(LEGAL_FORMS[0]).meta({ description: 'Hình thức pháp nhân: tổ chức' }),
  taxCode: taxCode().meta({
    description: `Mã số thuế, bắt buộc với tổ chức: đúng 10 hoặc 13 chữ số, không gạch nối, không dấu cách. ${TRIMMED}`,
  }),
};

const individualIdentity = {
  legalForm: z.literal(LEGAL_FORMS[1]).meta({ description: 'Hình thức pháp nhân: cá nhân' }),
  citizenId: citizenId().meta({ description: `Số CCCD, bắt buộc với cá nhân: đúng 12 chữ số. ${TRIMMED}` }),
};

/**
 * Identity of the legal entity, by legal form. Each form takes only its own identity field (Q-PARTNER-ONBOARDING-147):
 * an organization has a tax code and no citizen id; an individual has a citizen id, no tax code, and is matched for
 * duplicates on the citizen id only.
 */
export const PartnerIdentitySchema = z
  .discriminatedUnion('legalForm', [
    z.strictObject(organizationIdentity).meta({ id: 'OrganizationIdentity' }),
    z.strictObject(individualIdentity).meta({ id: 'IndividualIdentity' }),
  ])
  .meta({
    id: 'PartnerIdentity',
    description:
      'Thông tin định danh, mỗi hình thức chỉ nhận trường của nó: "tổ chức" kèm taxCode (không có citizenId), "cá nhân" kèm citizenId (không có taxCode). Cá nhân chỉ được so trùng theo số CCCD.',
  });

export type PartnerIdentity = z.infer<typeof PartnerIdentitySchema>;

const draftFields = {
  legalName: text(1, 255).meta({ description: `Tên pháp nhân, 1–255 ký tự, không chỉ gồm khoảng trắng. ${TRIMMED}` }),
  contractNumber: text(1, 255).meta({
    description: `Số hợp đồng hợp tác, 1–255 ký tự, không chỉ gồm khoảng trắng. ${TRIMMED}`,
  }),
  contractDate: z.iso.date().meta({
    description:
      'Ngày hợp đồng hợp tác, dạng YYYY-MM-DD, không muộn hơn hôm nay theo giờ Việt Nam (muộn hơn: lỗi 422 PARTNER_CONTRACT_DATE_IN_FUTURE, errors[] chỉ /body/contractDate với code in_future)',
  }),
  invitedEmail: email().meta({
    description: `Email người nhận lời mời Owner, tối đa 254 ký tự. ${TRIMMED}. Đúng một dấu @, có ít nhất một ký tự trước @, phần sau @ có dấu chấm nhưng không bắt đầu và không kết thúc bằng dấu chấm, không có khoảng trắng; so khớp không phân biệt hoa thường`,
  }),
};

/** Everything the direct creation screen collects before the admin confirms. */
export const DirectPartnerDraftSchema = z
  .discriminatedUnion('legalForm', [
    z.strictObject({ ...organizationIdentity, ...draftFields }).meta({ id: 'OrganizationPartnerDraft' }),
    z.strictObject({ ...individualIdentity, ...draftFields }).meta({ id: 'IndividualPartnerDraft' }),
  ])
  .meta({
    id: 'DirectPartnerDraft',
    description:
      'Dữ liệu màn tạo đối tác trực tiếp: tổ chức kèm taxCode, cá nhân kèm citizenId; các trường còn lại như nhau.',
  });

export type DirectPartnerDraft = z.infer<typeof DirectPartnerDraftSchema>;

export const PartnerDuplicateCheckSchema = z
  .object({
    partners: z
      .array(
        z
          .object({
            id: z.uuid(),
            status: z.enum(PARTNER_STATUSES).meta({ description: 'Trạng thái hiện tại của đối tác trùng' }),
          })
          .meta({ id: 'DuplicatePartner' }),
      )
      .meta({
        description:
          'Mọi đối tác có cùng mã số thuế hoặc số CCCD, gồm cả đối tác TERMINATED (để cảnh báo ghi rõ trạng thái cũ)',
      }),
    applications: z
      .array(
        z
          .object({
            id: z.uuid(),
            status: z.enum(OPEN_APPLICATION_STATUSES).meta({ description: 'Trạng thái của đơn đang mở trùng' }),
          })
          .meta({ id: 'DuplicateApplication' }),
      )
      .meta({ description: 'Đơn đang mở (SUBMITTED, UNDER_REVIEW, NEEDS_INFO) có cùng mã số thuế hoặc số CCCD' }),
    canConfirm: z.boolean().meta({
      description:
        'false khi trùng đối tác chưa chấm dứt hoặc đơn đang mở: không được xác nhận tạo, admin chỉ có thể hủy. true khi không trùng hoặc chỉ trùng đối tác TERMINATED',
    }),
  })
  .meta({
    id: 'PartnerDuplicateCheck',
    description: 'Cảnh báo trùng pháp nhân (BR-PARTNER-ONBOARDING-019). Hai danh sách rỗng: không trùng.',
  });

export type PartnerDuplicateCheckResponse = z.infer<typeof PartnerDuplicateCheckSchema>;
