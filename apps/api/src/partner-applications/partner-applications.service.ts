import { Injectable } from '@nestjs/common';
import { Clock } from '../common/time/clock.js';
import { MalwareScanner } from '../malware-scan/malware-scanner.js';
import { FileInfectedError, FileScanUnavailableError } from './partner-applications.errors.js';
import {
  type AcceptedFile,
  type ApplicationFile,
  type NewApplication,
  planNotifications,
} from './partner-applications.js';
import { PartnerApplicationsRepository } from './partner-applications.repository.js';
import type {
  IndividualApplicationCreate,
  IndividualPartnerApplicationResponse,
  OrganizationApplicationCreate,
  PartnerApplicationResponse,
} from './partner-applications.schemas.js';

/** A file of the submission with the input it came in, and its JSON pointer for error reports. */
type SubmittedFile = ApplicationFile & { pointer: string };

/** The files of one input, tagged with their kind and pointer. */
function filesOf(input: string, kind: ApplicationFile['kind'], files: AcceptedFile[]): SubmittedFile[] {
  return files.map((file, index) => ({ ...file, kind, pointer: `/body/${input}/${index}` }));
}

@Injectable()
export class PartnerApplicationsService {
  constructor(
    private readonly repository: PartnerApplicationsRepository,
    private readonly scanner: MalwareScanner,
    private readonly clock: Clock,
  ) {}

  /** Creates an organization application in SUBMITTED with its files, or nothing. Duplicate tax codes are accepted silently. */
  submitOrganization(input: OrganizationApplicationCreate): Promise<PartnerApplicationResponse> {
    const { businessRegistration, otherDocuments, ...application } = input;
    return this.submit(application, [
      ...filesOf('businessRegistration', 'BUSINESS_REGISTRATION', businessRegistration),
      ...filesOf('otherDocuments', 'OTHER', otherDocuments),
    ]);
  }

  /**
   * Creates an individual application in SUBMITTED, or nothing. Duplicate citizen IDs are accepted silently. Its files
   * are only checked for count, type and size (by the request schema): they are neither scanned nor stored, which the
   * ticket of UC-PARTNER-ONBOARDING-25 adds (Q-PARTNER-ONBOARDING-148).
   */
  submitIndividual(input: IndividualApplicationCreate): Promise<IndividualPartnerApplicationResponse> {
    const { legalForm, applicantName, contactEmail, legalName, citizenId, salesOnly, declaredArtists } = input;
    return this.submit(
      { legalForm, applicantName, contactEmail, legalName, citizenId, salesOnly, declaredArtists },
      [],
    );
  }

  /**
   * Stores the application in SUBMITTED with its files and queues its notifications, or stores nothing.
   * Files arrive with the application, already checked for count, type and size; each is scanned for malware before
   * anything is stored, and one infected or unscanned file refuses the whole application (BR-PARTNER-ONBOARDING-035,
   * -038). The confirmation email goes to the contact email in the application; the applicant gets no in-app
   * notification. Every platform admin gets an email and an in-app notification.
   */
  private async submit<T extends NewApplication>(
    application: T,
    files: SubmittedFile[],
  ): Promise<T & { id: string; status: 'SUBMITTED'; submittedAt: string }> {
    const verdicts = await Promise.all(files.map((file) => this.scanner.scan(file.content)));
    const refused = files.flatMap((file, index) => {
      const verdict = verdicts[index];
      if (verdict === 'infected') {
        return [{ pointer: file.pointer, code: 'infected', detail: 'The file is infected with malware' }];
      }
      if (verdict !== 'clean') {
        return [{ pointer: file.pointer, code: 'not_scanned', detail: 'The file could not be scanned' }];
      }
      return [];
    });
    if (verdicts.includes('infected')) {
      throw new FileInfectedError(refused);
    }
    if (refused.length > 0) {
      throw new FileScanUnavailableError(refused);
    }

    const now = this.clock.now();
    return this.repository.transaction(async (tx) => {
      const { id, submittedAt } = await this.repository.insertApplication(tx, application, now);
      await this.repository.insertFiles(tx, id, files, now);

      const admins = await this.repository.findPlatformAdmins(tx);
      const { inApp, emails } = planNotifications(application.legalForm, application.contactEmail, admins);
      await this.repository.insertNotifications(tx, id, inApp, now);
      await this.repository.insertEmails(tx, id, emails, now);

      return { ...application, id, status: 'SUBMITTED' as const, submittedAt: submittedAt.toISOString() };
    });
  }
}
