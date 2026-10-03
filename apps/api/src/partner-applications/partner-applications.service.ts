import { Injectable } from '@nestjs/common';
import { Clock } from '../common/time/clock.js';
import { MalwareScanner } from '../malware-scan/malware-scanner.js';
import { FileInfectedError, FileScanUnavailableError } from './partner-applications.errors.js';
import {
  type AcceptedFile,
  type ApplicationFile,
  type NewApplication,
  planNotifications,
  RESUBMIT_WINDOW_MS,
  submissionKey,
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

/** An application as its submitter is shown it once accepted. */
type Submitted<T extends NewApplication> = T & { id: string; status: 'SUBMITTED'; submittedAt: string };

/** Thrown inside the transaction to roll it back when an identical submission was accepted meanwhile. */
class AcceptedMeanwhile extends Error {
  constructor(readonly applicationId: string) {
    super('An identical submission was accepted meanwhile');
  }
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
   * anything is kept, and one infected or unscanned file refuses the whole application (BR-PARTNER-ONBOARDING-035,
   * -038). The confirmation email goes to the contact email in the application; the applicant gets no in-app
   * notification. Every platform admin gets an email and an in-app notification.
   *
   * A submission identical to an application accepted at most 1 minute earlier repeats it (BR-PARTNER-ONBOARDING-042):
   * nothing is scanned, kept or sent, and the submitter is shown that earlier application. The submission claims its
   * key before scanning, so an identical one arriving meanwhile waits for this one's outcome: it repeats this
   * application once accepted, or is handled on its own when this one is refused. The price is a transaction open for
   * the scan, which only identical submissions wait on.
   */
  private async submit<T extends NewApplication>(application: T, files: SubmittedFile[]): Promise<Submitted<T>> {
    const now = this.clock.now();
    try {
      return await this.repository.transaction(async (tx) => {
        const { id, submittedAt } = await this.repository.insertApplication(tx, application, now);
        const holder = await this.repository.claimSubmission(
          tx,
          submissionKey(application),
          id,
          now,
          new Date(now.getTime() - RESUBMIT_WINDOW_MS),
        );
        if (holder !== id) {
          throw new AcceptedMeanwhile(holder);
        }

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
        await this.repository.insertFiles(tx, id, files, now);

        const admins = await this.repository.findPlatformAdmins(tx);
        const { inApp, emails } = planNotifications(application.legalForm, application.contactEmail, admins);
        await this.repository.insertNotifications(tx, id, inApp, now);
        await this.repository.insertEmails(tx, id, emails, now);

        return { ...application, id, status: 'SUBMITTED' as const, submittedAt: submittedAt.toISOString() };
      });
    } catch (error) {
      if (error instanceof AcceptedMeanwhile) {
        return this.repeat(application, error.applicationId);
      }
      throw error;
    }
  }

  /**
   * The earlier application a repeated submission is shown, as its first submission returned it. Legal form and
   * identifier are the same by the submission key; every other field is the earlier one's.
   */
  private async repeat<T extends NewApplication>(application: T, id: string): Promise<Submitted<T>> {
    const { submittedAt, ...earlier } = await this.repository.findAcceptedApplication(id);
    return { ...application, ...earlier, status: 'SUBMITTED', submittedAt: submittedAt.toISOString() };
  }
}
