import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/** Hình thức (legalForm) values as the ticket gives them. Only 'tổ chức' is submitted through this ticket; 'cá nhân' belongs to another use case. */
export const LEGAL_FORMS = ['tổ chức', 'cá nhân'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

/** Statuses an application can be in. Other tickets own the transitions after SUBMITTED. */
export const APPLICATION_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PARTNER_STATUSES = ['PENDING_ACTIVATION', 'ACTIVE', 'TERMINATED'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const ATTACHMENT_KINDS = ['BUSINESS_REGISTRATION', 'OTHER'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const NOTIFICATION_KINDS = ['APPLICATION_RECEIVED', 'APPLICATION_NEW_FOR_ADMIN'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * AarHub account. Platform admin accounts belong to the shared login ticket (Q-PARTNER-ONBOARDING-144), not to BE-01.
 * This table is only the stand-in BE-01 reads so admins can be notified: who exists and who is a platform admin.
 * The login ticket replaces it; only PartnerApplicationsRepository.findPlatformAdmins reads it.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accounts_email_lower_idx').on(sql`lower(${t.email})`)],
);

/** Partner (ENT-PARTNER). Minimal columns for matching tax codes; nothing in the submit flow reads it (duplicates are accepted silently). */
export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name').notNull(),
    taxCode: text('tax_code').notNull(),
    status: text('status').$type<PartnerStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('partners_tax_code_idx').on(t.taxCode)],
);

/** ENT-PARTNER-APPLICATION. */
export const partnerApplications = pgTable(
  'partner_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalForm: text('legal_form').$type<LegalForm>().notNull(),
    status: text('status').$type<ApplicationStatus>().notNull(),
    applicantName: text('applicant_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    legalName: text('legal_name').notNull(),
    taxCode: text('tax_code').notNull(),
    /** "Chỉ bán hàng": no declared artists required. */
    salesOnly: boolean('sales_only').notNull().default(false),
    declaredArtists: jsonb('declared_artists').$type<string[]>().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('partner_applications_tax_code_idx').on(t.taxCode)],
);

/** Uploaded file. Starts unattached (upload step) and is attached to an application when it is submitted. */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    content: bytea('content').notNull(),
    applicationId: uuid('application_id').references(() => partnerApplications.id),
    kind: text('kind').$type<AttachmentKind>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachments_application_id_idx').on(t.applicationId)],
);

/** In-app notification for an account. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    kind: text('kind').$type<NotificationKind>().notNull(),
    message: text('message').notNull(),
    applicationId: uuid('application_id').references(() => partnerApplications.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_account_id_idx').on(t.accountId)],
);

/**
 * Emails waiting to be sent. Rows are written in the same transaction as the business change;
 * a mail sender delivers rows with `sentAt` null. BE-01 only queues; real sending is a separate infrastructure
 * ticket (Q-PARTNER-ONBOARDING-143).
 */
export const emailOutbox = pgTable('email_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  toEmail: text('to_email').notNull(),
  kind: text('kind').$type<NotificationKind>().notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  applicationId: uuid('application_id').references(() => partnerApplications.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});
