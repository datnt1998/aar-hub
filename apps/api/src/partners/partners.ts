import { type ApplicationStatus, OPEN_APPLICATION_STATUSES, type PartnerStatus } from '../db/schema.js';

/** Legal identity typed on the direct creation screen: tax code of an organization or citizen id of an individual. */
export type LegalIdentity = { taxCode: string } | { citizenId: string };

/** A partner with the same legal identity. */
export interface MatchedPartner {
  id: string;
  status: PartnerStatus;
}

/** An application with the same legal identity, in any status. */
export interface MatchedApplication {
  id: string;
  status: ApplicationStatus;
}

type OpenApplicationStatus = (typeof OPEN_APPLICATION_STATUSES)[number];

export interface DuplicateCheck {
  /** Every partner with the same legal identity, terminated ones included so the warning can name the old status. */
  partners: MatchedPartner[];
  /** Open applications with the same legal identity. Decided ones (APPROVED, REJECTED) are no duplicate. */
  applications: { id: string; status: OpenApplicationStatus }[];
  /** False when a partner that is not TERMINATED or an open application has the same legal identity. */
  canConfirm: boolean;
}

const isOpen = (application: MatchedApplication): application is { id: string; status: OpenApplicationStatus } =>
  (OPEN_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(application.status);

/**
 * BR-PARTNER-ONBOARDING-019 for direct creation: a duplicate of a partner that is not terminated, or of an open
 * application, blocks creation; a duplicate of TERMINATED partners only is a warning that lets the admin go on.
 */
export function duplicateCheck(partners: MatchedPartner[], applications: MatchedApplication[]): DuplicateCheck {
  const openApplications = applications.filter(isOpen);
  const blocked = openApplications.length > 0 || partners.some((partner) => partner.status !== 'TERMINATED');
  return { partners, applications: openApplications, canConfirm: !blocked };
}

/** Vietnam time (UTC+7, no daylight saving): the calendar AarHub admins work in. */
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Today's date in Vietnam as YYYY-MM-DD. */
export function today(now: Date): string {
  return new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}
