import { Injectable } from '@nestjs/common';
import { Clock } from '../common/time/clock.js';
import { BusinessRegistrationInvalidError, OtherAttachmentInvalidError } from './partner-applications.errors.js';
import { type FileUpload, planNotifications } from './partner-applications.js';
import { PartnerApplicationsRepository } from './partner-applications.repository.js';
import type {
  AttachmentResponse,
  OrganizationApplicationCreate,
  PartnerApplicationResponse,
} from './partner-applications.schemas.js';

@Injectable()
export class PartnerApplicationsService {
  constructor(
    private readonly repository: PartnerApplicationsRepository,
    private readonly clock: Clock,
  ) {}

  uploadAttachment(file: FileUpload): Promise<AttachmentResponse> {
    // Multer decodes multipart file names as latin1; browsers send UTF-8.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.repository.insertAttachment(file, fileName, this.clock.now());
  }

  /**
   * Creates an organization application in SUBMITTED, or creates nothing. Duplicate tax ids are accepted silently.
   * `applicantAccountId` is the logged-in applicant's account: the application is bound to it and that account gets the
   * in-app notification. The caller (the auth layer) guarantees it is an existing account id. The confirmation email
   * always goes to the contact email in the application.
   */
  submitOrganization(
    input: OrganizationApplicationCreate,
    applicantAccountId?: string,
  ): Promise<PartnerApplicationResponse> {
    const now = this.clock.now();
    return this.repository.transaction(async (tx) => {
      const application = await this.repository.insertApplication(tx, input, applicantAccountId, now);

      const [businessRegistration] = await this.repository.attachUploads(
        tx,
        application.id,
        [input.businessRegistrationAttachmentId],
        'BUSINESS_REGISTRATION',
      );
      if (!businessRegistration) {
        throw new BusinessRegistrationInvalidError();
      }

      const otherAttachments =
        input.otherAttachmentIds.length === 0
          ? []
          : await this.repository.attachUploads(tx, application.id, input.otherAttachmentIds, 'OTHER');
      if (otherAttachments.length !== input.otherAttachmentIds.length) {
        throw new OtherAttachmentInvalidError();
      }

      const admins = await this.repository.findPlatformAdmins(tx);
      const { inApp, emails } = planNotifications(input.contactEmail, applicantAccountId, admins);
      await this.repository.insertNotifications(tx, application.id, inApp, now);
      await this.repository.insertEmails(tx, application.id, emails, now);

      return {
        ...application,
        submittedAt: application.submittedAt.toISOString(),
        businessRegistration,
        otherAttachments,
      };
    });
  }
}
