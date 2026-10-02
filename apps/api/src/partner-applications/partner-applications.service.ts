import { Injectable } from '@nestjs/common';
import { Clock } from '../common/time/clock.js';
import {
  BusinessRegistrationInvalidError,
  FileTypeNotAllowedError,
  OtherDocumentsInvalidError,
} from './partner-applications.errors.js';
import { allowedContentType, type FileUpload, planNotifications } from './partner-applications.js';
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

  /** Stores a pdf, jpg or png file for a later application. Other types are refused. */
  uploadAttachment(file: FileUpload): Promise<AttachmentResponse> {
    // Multer decodes multipart file names as latin1; browsers send UTF-8.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const contentType = allowedContentType(fileName, file.buffer);
    if (!contentType) {
      throw new FileTypeNotAllowedError();
    }
    return this.repository.insertAttachment({ fileName, contentType, content: file.buffer }, this.clock.now());
  }

  /**
   * Creates an organization application in SUBMITTED, or creates nothing. Duplicate tax codes are accepted silently.
   * The confirmation email goes to the contact email in the application; the applicant gets no in-app notification.
   */
  submitOrganization(input: OrganizationApplicationCreate): Promise<PartnerApplicationResponse> {
    const now = this.clock.now();
    return this.repository.transaction(async (tx) => {
      const application = await this.repository.insertApplication(tx, input, now);

      const attachedRegistration = await this.repository.attachUploads(
        tx,
        application.id,
        [input.businessRegistration],
        'BUSINESS_REGISTRATION',
      );
      if (attachedRegistration !== 1) {
        throw new BusinessRegistrationInvalidError();
      }

      if (input.otherDocuments.length > 0) {
        const attachedOthers = await this.repository.attachUploads(tx, application.id, input.otherDocuments, 'OTHER');
        if (attachedOthers !== input.otherDocuments.length) {
          throw new OtherDocumentsInvalidError();
        }
      }

      const admins = await this.repository.findPlatformAdmins(tx);
      const { inApp, emails } = planNotifications(input.contactEmail, admins);
      await this.repository.insertNotifications(tx, application.id, inApp, now);
      await this.repository.insertEmails(tx, application.id, emails, now);

      return { ...application, submittedAt: application.submittedAt.toISOString() };
    });
  }
}
