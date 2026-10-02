import { Injectable } from '@nestjs/common';
import { Clock } from '../common/time/clock.js';
import { MalwareScanner } from '../malware-scan/malware-scanner.js';
import { FileInfectedError, FileScanUnavailableError } from './partner-applications.errors.js';
import { type ApplicationFile, planNotifications } from './partner-applications.js';
import { PartnerApplicationsRepository } from './partner-applications.repository.js';
import type { OrganizationApplicationCreate, PartnerApplicationResponse } from './partner-applications.schemas.js';

@Injectable()
export class PartnerApplicationsService {
  constructor(
    private readonly repository: PartnerApplicationsRepository,
    private readonly scanner: MalwareScanner,
    private readonly clock: Clock,
  ) {}

  /**
   * Creates an organization application in SUBMITTED with its files, or creates and stores nothing.
   * Files arrive with the application, already checked for count, type and size; each is scanned for malware before
   * anything is stored, and one infected or unscanned file refuses the whole application (BR-PARTNER-ONBOARDING-035,
   * -038). Duplicate tax codes are accepted silently. The confirmation email goes to the contact email in the
   * application; the applicant gets no in-app notification.
   */
  async submitOrganization(input: OrganizationApplicationCreate): Promise<PartnerApplicationResponse> {
    const files: (ApplicationFile & { pointer: string })[] = [
      ...input.businessRegistration.map((file, index) => ({
        ...file,
        kind: 'BUSINESS_REGISTRATION' as const,
        pointer: `/body/businessRegistration/${index}`,
      })),
      ...input.otherDocuments.map((file, index) => ({
        ...file,
        kind: 'OTHER' as const,
        pointer: `/body/otherDocuments/${index}`,
      })),
    ];

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
      const application = await this.repository.insertApplication(tx, input, now);
      await this.repository.insertFiles(tx, application.id, files, now);

      const admins = await this.repository.findPlatformAdmins(tx);
      const { inApp, emails } = planNotifications(input.contactEmail, admins);
      await this.repository.insertNotifications(tx, application.id, inApp, now);
      await this.repository.insertEmails(tx, application.id, emails, now);

      return { ...application, submittedAt: application.submittedAt.toISOString() };
    });
  }
}
