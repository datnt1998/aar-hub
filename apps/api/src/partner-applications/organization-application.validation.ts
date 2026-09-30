import type { PlannedArtist } from '../db/schema.js';
import type { FieldErrorDto, FieldErrorField, FieldErrorReason } from './partner-applications.dto.js';

export interface OrganizationApplicationInput {
  contactName: string;
  contactEmail: string;
  legalName: string;
  taxId: string;
  sellOnly: boolean;
  plannedArtists: PlannedArtist[];
  businessRegistrationAttachmentId: string;
  otherAttachmentIds: string[];
}

export type ValidationResult =
  | { ok: true; value: OrganizationApplicationInput }
  | { ok: false; errors: FieldErrorDto[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks the body of an organization application. Reports every bad field, not just the first. */
export function validateOrganizationApplication(body: unknown): ValidationResult {
  const input: Record<string, unknown> =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? Object.fromEntries(Object.entries(body)) : {};
  const errors: FieldErrorDto[] = [];
  const fail = (field: FieldErrorField, reason: FieldErrorReason) => errors.push({ field, reason });

  const text = (field: FieldErrorField): string => {
    const raw = input[field];
    if (raw === undefined || raw === null) {
      fail(field, 'REQUIRED');
      return '';
    }
    if (typeof raw !== 'string') {
      fail(field, 'INVALID');
      return '';
    }
    const value = raw.trim();
    if (value === '') fail(field, 'REQUIRED');
    return value;
  };

  const contactName = text('contactName');
  const contactEmail = text('contactEmail');
  if (contactEmail !== '' && !EMAIL.test(contactEmail)) fail('contactEmail', 'INVALID');
  const legalName = text('legalName');
  const taxId = text('taxId');

  let sellOnly = false;
  if (input.sellOnly !== undefined && input.sellOnly !== null) {
    if (typeof input.sellOnly === 'boolean') sellOnly = input.sellOnly;
    else fail('sellOnly', 'INVALID');
  }

  const plannedArtists: PlannedArtist[] = [];
  const rawArtists = input.plannedArtists;
  if (rawArtists !== undefined && rawArtists !== null) {
    if (!Array.isArray(rawArtists)) {
      fail('plannedArtists', 'INVALID');
    } else {
      let invalid = false;
      for (const item of rawArtists) {
        const name =
          typeof item === 'object' && item !== null && 'name' in item && typeof item.name === 'string'
            ? item.name.trim()
            : '';
        if (name === '') invalid = true;
        else plannedArtists.push({ name });
      }
      if (invalid) fail('plannedArtists', 'INVALID');
    }
  }
  if (!sellOnly && plannedArtists.length === 0 && !errors.some((e) => e.field === 'plannedArtists')) {
    fail('plannedArtists', 'REQUIRED');
  }

  const businessRegistrationAttachmentId = text('businessRegistrationAttachmentId');
  if (businessRegistrationAttachmentId !== '' && !UUID.test(businessRegistrationAttachmentId)) {
    fail('businessRegistrationAttachmentId', 'INVALID');
  }

  const otherAttachmentIds: string[] = [];
  const rawOthers = input.otherAttachmentIds;
  if (rawOthers !== undefined && rawOthers !== null) {
    if (!Array.isArray(rawOthers) || rawOthers.some((id) => typeof id !== 'string' || !UUID.test(id))) {
      fail('otherAttachmentIds', 'INVALID');
    } else {
      otherAttachmentIds.push(...(rawOthers as string[]));
    }
  }
  const allIds = [businessRegistrationAttachmentId, ...otherAttachmentIds].filter((id) => id !== '');
  if (new Set(allIds.map((id) => id.toLowerCase())).size !== allIds.length) {
    fail('otherAttachmentIds', 'INVALID');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      contactName,
      contactEmail,
      legalName,
      taxId,
      sellOnly,
      plannedArtists,
      businessRegistrationAttachmentId: businessRegistrationAttachmentId.toLowerCase(),
      otherAttachmentIds: otherAttachmentIds.map((id) => id.toLowerCase()),
    },
  };
}
