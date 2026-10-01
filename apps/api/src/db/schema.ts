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

export const APPLICATION_TYPES = ['ORGANIZATION'] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];

export const APPLICATION_STATUSES = ['SUBMITTED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PARTNER_STATUSES = ['PENDING_ACTIVATION', 'ACTIVE', 'TERMINATED'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const ATTACHMENT_KINDS = ['BUSINESS_REGISTRATION', 'OTHER'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const NOTIFICATION_KINDS = ['APPLICATION_RECEIVED', 'APPLICATION_NEW_FOR_ADMIN'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** AarHub account. Owned by the account/auth work; here only what notifications need: who exists and who is a platform admin. */
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

/** Partner (ENT-PARTNER). Minimal columns for matching tax ids; nothing in the submit flow reads it yet (duplicates are accepted silently). */
export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name').notNull(),
    taxId: text('tax_id').notNull(),
    status: text('status').$type<PartnerStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('partners_tax_id_idx').on(t.taxId)],
);

export type PlannedArtist = { name: string };

/** ENT-PARTNER-APPLICATION. */
export const partnerApplications = pgTable(
  'partner_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').$type<ApplicationType>().notNull(),
    status: text('status').$type<ApplicationStatus>().notNull(),
    /** Account the applicant was logged in with; null for an anonymous applicant. */
    applicantAccountId: uuid('applicant_account_id').references(() => accounts.id),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    legalName: text('legal_name').notNull(),
    taxId: text('tax_id').notNull(),
    /** "Chỉ bán hàng": no planned artists required. */
    sellOnly: boolean('sell_only').notNull().default(false),
    plannedArtists: jsonb('planned_artists').$type<PlannedArtist[]>().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('partner_applications_tax_id_idx').on(t.taxId)],
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
 * a mail sender (not chosen yet) delivers rows with `sentAt` null.
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
