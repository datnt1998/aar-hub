import { Injectable } from '@nestjs/common';
import { Clock } from '../common/time/clock.js';
import {
  BusinessRegistrationInvalidError,
  CitizenIdImageInvalidError,
  FileTypeNotAllowedError,
  OtherDocumentsInvalidError,
} from './partner-applications.errors.js';
import {
  allowedContentType,
  type ApplicationFiles,
  type FileUpload,
  type NewApplication,
  planNotifications,
} from './partner-applications.js';
import { PartnerApplicationsRepository } from './partner-applications.repository.js';
import type {
  AttachmentResponse,
  IndividualApplicationCreate,
  IndividualPartnerApplicationResponse,
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

  /** Creates an organization application in SUBMITTED, or creates nothing. Duplicate tax codes are accepted silently. */
  submitOrganization(input: OrganizationApplicationCreate): Promise<PartnerApplicationResponse> {
    const { businessRegistration, otherDocuments, ...application } = input;
    return this.submit(application, { main: businessRegistration, kind: 'BUSINESS_REGISTRATION', otherDocuments });
  }

  /** Creates an individual application in SUBMITTED, or creates nothing. Duplicate citizen IDs are accepted silently. */
  submitIndividual(input: IndividualApplicationCreate): Promise<IndividualPartnerApplicationResponse> {
    const { citizenIdImage, otherDocuments, ...application } = input;
    return this.submit(application, { main: citizenIdImage, kind: 'CITIZEN_ID_IMAGE', otherDocuments });
  }

  /**
   * Stores the application in SUBMITTED with its files and queues its notifications in one transaction: a file that
   * cannot be attached rolls everything back. The confirmation email goes to the contact email in the application;
   * the applicant gets no in-app notification. Every platform admin gets an email and an in-app notification.
   */
  private submit<T extends NewApplication>(
    application: T,
    files: ApplicationFiles,
  ): Promise<T & { id: string; status: 'SUBMITTED'; submittedAt: string }> {
    const now = this.clock.now();
    return this.repository.transaction(async (tx) => {
      const { id, submittedAt } = await this.repository.insertApplication(tx, application, now);

      if ((await this.repository.attachUploads(tx, id, [files.main], files.kind)) !== 1) {
        throw files.kind === 'CITIZEN_ID_IMAGE'
          ? new CitizenIdImageInvalidError()
          : new BusinessRegistrationInvalidError();
      }
      if (files.otherDocuments.length > 0) {
        const attachedOthers = await this.repository.attachUploads(tx, id, files.otherDocuments, 'OTHER');
        if (attachedOthers !== files.otherDocuments.length) {
          throw new OtherDocumentsInvalidError();
        }
      }

      const admins = await this.repository.findPlatformAdmins(tx);
      const { inApp, emails } = planNotifications(application.legalForm, application.contactEmail, admins);
      await this.repository.insertNotifications(tx, id, inApp, now);
      await this.repository.insertEmails(tx, id, emails, now);

      return { ...application, id, status: 'SUBMITTED' as const, submittedAt: submittedAt.toISOString() };
    });
  }
}
