import { eq } from 'drizzle-orm';
import { accounts, attachments, emailOutbox, notifications, partnerApplications, partners } from '../src/db/schema.js';
import { PartnerApplicationsService } from '../src/partner-applications/partner-applications.service.js';
import {
  AttachmentSchema,
  OrganizationApplicationCreateSchema,
  PartnerApplicationSchema,
} from '../src/partner-applications/partner-applications.schemas.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

/** The only row of a query that must have returned one. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) {
    throw new Error('expected a row');
  }
  return row;
}

describe('partner applications (organization)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.reset();
  });

  const http = () => t.http();
  const service = () => t.app.get(PartnerApplicationsService);

  async function upload(fileName = 'gpkd.pdf'): Promise<string> {
    const res = await http()
      .post('/api/partner-applications/attachments')
      .attach('file', Buffer.from('%PDF-1.4 demo'), { filename: fileName, contentType: 'application/pdf' })
      .expect(201);
    return AttachmentSchema.parse(res.body).id;
  }

  async function validBody(overrides: Record<string, unknown> = {}) {
    return {
      contactName: 'Trần Thị Bích',
      contactEmail: 'bich@example.com',
      legalName: 'Công ty TNHH Âm Nhạc Sao',
      taxId: '0312345678',
      plannedArtists: [{ name: 'Nghệ sĩ Một' }],
      businessRegistrationAttachmentId: await upload(),
      ...overrides,
    };
  }

  /** Body as the service receives it after the request schema has run (defaults filled in). */
  async function parsedBody(overrides: Record<string, unknown> = {}) {
    return OrganizationApplicationCreateSchema.parse(await validBody(overrides));
  }

  /** Asserts a 400 VALIDATION_FAILED that points at exactly these inputs. */
  function expectInvalid(
    res: { status: number; body: { code: string; errors: { pointer: string }[] } },
    ...fields: string[]
  ) {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e) => e.pointer).sort()).toEqual(fields.map((f) => `/body/${f}`).sort());
  }

  /** The application in a 201 response, checked against the published response schema. */
  const created = (res: { body: unknown }) => PartnerApplicationSchema.parse(res.body);

  const submit = (body: unknown) =>
    http()
      .post('/api/partner-applications/organization')
      .send(body as object);
  const countApplications = async () => (await t.db.select().from(partnerApplications)).length;

  describe('AC-PARTNER-ONBOARDING-01-01 submitted status', () => {
    it('AC-PARTNER-ONBOARDING-01-01 full organization application with artists is SUBMITTED', async () => {
      const res = await submit(await validBody()).expect(201);
      expect(res.body).toMatchObject({
        type: 'ORGANIZATION',
        status: 'SUBMITTED',
        contactEmail: 'bich@example.com',
        legalName: 'Công ty TNHH Âm Nhạc Sao',
        taxId: '0312345678',
        sellOnly: false,
        plannedArtists: [{ name: 'Nghệ sĩ Một' }],
        businessRegistration: { fileName: 'gpkd.pdf', contentType: 'application/pdf' },
        otherAttachments: [],
      });
      const row = one(
        await t.db
          .select()
          .from(partnerApplications)
          .where(eq(partnerApplications.id, created(res).id)),
      );
      expect(row.status).toBe('SUBMITTED');
      expect(res.body.submittedAt).toBe(t.clock.now().toISOString());
    });

    it('AC-PARTNER-ONBOARDING-01-01 sell-only application without artists is SUBMITTED', async () => {
      const res = await submit(await validBody({ sellOnly: true, plannedArtists: undefined })).expect(201);
      expect(res.body).toMatchObject({ status: 'SUBMITTED', sellOnly: true, plannedArtists: [] });
    });

    it('AC-PARTNER-ONBOARDING-01-01 optional documents are attached to the application', async () => {
      const other = await upload('phu-luc.pdf');
      const res = await submit(await validBody({ otherAttachmentIds: [other] })).expect(201);
      expect(res.body.status).toBe('SUBMITTED');
      expect(res.body.otherAttachments).toEqual([expect.objectContaining({ id: other, fileName: 'phu-luc.pdf' })]);
      const rows = await t.db
        .select()
        .from(attachments)
        .where(eq(attachments.applicationId, created(res).id));
      expect(rows.map((r) => r.kind).sort()).toEqual(['BUSINESS_REGISTRATION', 'OTHER']);
    });

    it('AC-PARTNER-ONBOARDING-01-01 tax id shared with an open application is still SUBMITTED', async () => {
      await submit(await validBody()).expect(201);
      const res = await submit(await validBody({ contactEmail: 'khac@example.com' })).expect(201);
      expect(res.body.status).toBe('SUBMITTED');
      expect(await countApplications()).toBe(2);
    });

    it('AC-PARTNER-ONBOARDING-01-01 tax id shared with an existing partner is still SUBMITTED', async () => {
      await t.db.insert(partners).values({ legalName: 'Đối tác cũ', taxId: '0312345678', status: 'ACTIVE' });
      const res = await submit(await validBody()).expect(201);
      expect(res.body.status).toBe('SUBMITTED');
    });
  });

  describe('required information', () => {
    it('AC-PARTNER-ONBOARDING-01-03 missing contact email points at the email and creates no application', async () => {
      const res = await submit(await validBody({ contactEmail: undefined }));
      expectInvalid(res, 'contactEmail');
      expect(await countApplications()).toBe(0);
      expect(await t.db.select().from(emailOutbox)).toHaveLength(0);
    });

    it('AC-PARTNER-ONBOARDING-01-03 blank contact email counts as missing', async () => {
      const res = await submit(await validBody({ contactEmail: '   ' }));
      expectInvalid(res, 'contactEmail');
    });

    it('every missing required field is listed together and leaves the uploaded file unattached', async () => {
      const res = await submit({ sellOnly: true });
      expectInvalid(res, 'contactName', 'contactEmail', 'legalName', 'taxId', 'businessRegistrationAttachmentId');
    });

    it('surrounding spaces are trimmed from text fields and the contact email before they are stored', async () => {
      const res = await submit(
        await validBody({ contactName: '  Trần Thị Bích ', contactEmail: ' bich@example.com ', taxId: ' 0312345678 ' }),
      ).expect(201);
      expect(res.body).toMatchObject({
        contactName: 'Trần Thị Bích',
        contactEmail: 'bich@example.com',
        taxId: '0312345678',
      });
    });

    it('a malformed contact email is rejected', async () => {
      const res = await submit(await validBody({ contactEmail: 'khong-phai-email' }));
      expectInvalid(res, 'contactEmail');
    });

    it('AC-PARTNER-ONBOARDING-01-08 not sell-only without artists requires at least one artist', async () => {
      const res = await submit(await validBody({ plannedArtists: [] }));
      expectInvalid(res, 'plannedArtists');
      expect(await countApplications()).toBe(0);
    });

    it('AC-PARTNER-ONBOARDING-01-08 omitting sellOnly and artists is refused', async () => {
      const res = await submit(await validBody({ plannedArtists: undefined, sellOnly: undefined }));
      expectInvalid(res, 'plannedArtists');
    });

    it('a missing or already-used business registration file creates no application and sends nothing', async () => {
      await t.db.insert(accounts).values({ email: 'admin@aar.vn', isPlatformAdmin: true });
      const first = await submit(await validBody()).expect(201);
      const used = first.body.businessRegistration.id;
      const before = {
        applications: await countApplications(),
        mails: (await t.db.select().from(emailOutbox)).length,
        notices: (await t.db.select().from(notifications)).length,
      };

      const reuse = await submit(await validBody({ businessRegistrationAttachmentId: used })).expect(422);
      expect(reuse.body.code).toBe('PARTNER_APPLICATION_BUSINESS_REGISTRATION_INVALID');
      const unknown = await submit(
        await validBody({ businessRegistrationAttachmentId: '00000000-0000-4000-8000-000000000000' }),
      ).expect(422);
      expect(unknown.body.code).toBe('PARTNER_APPLICATION_BUSINESS_REGISTRATION_INVALID');

      expect({
        applications: await countApplications(),
        mails: (await t.db.select().from(emailOutbox)).length,
        notices: (await t.db.select().from(notifications)).length,
      }).toEqual(before);
    });

    it('an unusable optional file rolls back the whole submission, including the claimed business registration', async () => {
      const br = await upload();
      const res = await submit(
        await validBody({
          businessRegistrationAttachmentId: br,
          otherAttachmentIds: ['00000000-0000-4000-8000-000000000000'],
        }),
      ).expect(422);
      expect(res.body.code).toBe('PARTNER_APPLICATION_OTHER_ATTACHMENT_INVALID');
      expect(await countApplications()).toBe(0);
      const row = one(await t.db.select().from(attachments).where(eq(attachments.id, br)));
      expect(row.applicationId).toBeNull();
    });

    it('three files in total (business registration plus two others) are accepted', async () => {
      const others = [await upload('a.pdf'), await upload('b.pdf')];
      const res = await submit(await validBody({ otherAttachmentIds: others })).expect(201);
      expect(res.body.otherAttachments).toHaveLength(2);
    });

    it('the same file listed twice is refused and creates no application', async () => {
      const br = await upload();
      const res = await submit(await validBody({ businessRegistrationAttachmentId: br, otherAttachmentIds: [br] }));
      expectInvalid(res, 'otherAttachmentIds');
      expect(await countApplications()).toBe(0);
    });

    it('a fourth file is refused, creates no application and leaves every upload unattached', async () => {
      const br = await upload();
      const others = [await upload('a.pdf'), await upload('b.pdf'), await upload('c.pdf')];
      const res = await submit(await validBody({ businessRegistrationAttachmentId: br, otherAttachmentIds: others }));
      expectInvalid(res, 'otherAttachmentIds');
      expect(res.body.errors[0].code).toBe('too_big');
      expect(await countApplications()).toBe(0);
      const rows = await t.db.select().from(attachments);
      expect(rows.every((r) => r.applicationId === null)).toBe(true);
    });
  });

  describe('notifications', () => {
    it('AC-PARTNER-ONBOARDING-01-09 applicant gets a confirmation email', async () => {
      const res = await submit(await validBody()).expect(201);
      const mails = await t.db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, 'bich@example.com'));
      expect(mails).toEqual([
        expect.objectContaining({
          kind: 'APPLICATION_RECEIVED',
          subject: 'Đơn tổ chức đã được nhận',
          applicationId: created(res).id,
          sentAt: null,
        }),
      ]);
    });

    it('AC-PARTNER-ONBOARDING-01-09 (service level, no API login yet) account-bound application: email goes to the contact email B, in-app notification to the account with email A', async () => {
      const accountA = one(await t.db.insert(accounts).values({ email: 'a@example.com' }).returning());
      const accountOfB = one(await t.db.insert(accounts).values({ email: 'b@example.com' }).returning());
      const result = await service().submitOrganization(
        await parsedBody({ contactEmail: 'b@example.com' }),
        accountA.id,
      );

      const row = one(await t.db.select().from(partnerApplications).where(eq(partnerApplications.id, result.id)));
      expect(row.applicantAccountId).toBe(accountA.id);
      const mails = await t.db.select().from(emailOutbox);
      expect(mails).toEqual([expect.objectContaining({ toEmail: 'b@example.com', kind: 'APPLICATION_RECEIVED' })]);
      const notices = await t.db.select().from(notifications);
      expect(notices).toEqual([
        expect.objectContaining({
          accountId: accountA.id,
          kind: 'APPLICATION_RECEIVED',
          message: 'Đơn tổ chức đã được nhận',
          applicationId: result.id,
        }),
      ]);
      expect(notices.some((n) => n.accountId === accountOfB.id)).toBe(false);
    });

    it('AC-PARTNER-ONBOARDING-01-09 (service level, no API login yet) account-bound application that keeps email A gets the email and the in-app notification', async () => {
      const accountA = one(await t.db.insert(accounts).values({ email: 'a@example.com' }).returning());
      await service().submitOrganization(await parsedBody({ contactEmail: 'a@example.com' }), accountA.id);
      expect((await t.db.select().from(emailOutbox)).map((m) => m.toEmail)).toEqual(['a@example.com']);
      expect((await t.db.select().from(notifications)).map((n) => n.accountId)).toEqual([accountA.id]);
    });

    it('AC-PARTNER-ONBOARDING-01-10 (service level, no API login yet) applicant who is also an admin gets both the received and the new-application notifications', async () => {
      const admin = one(
        await t.db.insert(accounts).values({ email: 'admin@aar.vn', isPlatformAdmin: true }).returning(),
      );
      await service().submitOrganization(await parsedBody({ contactEmail: 'admin@aar.vn' }), admin.id);
      expect((await t.db.select().from(notifications)).map((n) => n.kind).sort()).toEqual([
        'APPLICATION_NEW_FOR_ADMIN',
        'APPLICATION_RECEIVED',
      ]);
      expect((await t.db.select().from(emailOutbox)).map((m) => m.kind).sort()).toEqual([
        'APPLICATION_NEW_FOR_ADMIN',
        'APPLICATION_RECEIVED',
      ]);
    });

    it('AC-PARTNER-ONBOARDING-01-09 applicant without an account gets the email only', async () => {
      await submit(await validBody()).expect(201);
      expect(await t.db.select().from(notifications)).toHaveLength(0);
      expect(await t.db.select().from(emailOutbox)).toHaveLength(1);
    });

    it('AC-PARTNER-ONBOARDING-01-10 every platform admin gets an email and an in-app notification', async () => {
      const admins = await t.db
        .insert(accounts)
        .values([
          { email: 'admin1@aar.vn', isPlatformAdmin: true },
          { email: 'admin2@aar.vn', isPlatformAdmin: true },
        ])
        .returning();
      const bystander = one(await t.db.insert(accounts).values({ email: 'user@aar.vn' }).returning());
      const res = await submit(await validBody()).expect(201);

      const adminMails = (await t.db.select().from(emailOutbox)).filter((m) => m.kind === 'APPLICATION_NEW_FOR_ADMIN');
      expect(adminMails.map((m) => m.toEmail).sort()).toEqual(['admin1@aar.vn', 'admin2@aar.vn']);
      expect(
        adminMails.every((m) => m.subject === 'Có đơn tổ chức mới cần nhận' && m.applicationId === created(res).id),
      ).toBe(true);

      const adminNotices = (await t.db.select().from(notifications)).filter(
        (n) => n.kind === 'APPLICATION_NEW_FOR_ADMIN',
      );
      expect(adminNotices.map((n) => n.accountId).sort()).toEqual(admins.map((a) => a.id).sort());
      expect(adminNotices.every((n) => n.message === 'Có đơn tổ chức mới cần nhận')).toBe(true);
      expect((await t.db.select().from(notifications)).some((n) => n.accountId === bystander.id)).toBe(false);
    });
  });

  // The HTTP layer has no way to identify a logged-in applicant until the auth work lands, so these call the service
  // with the account id the auth layer will supply.
  describe('logged-in applicant', () => {
    it('AC-PARTNER-ONBOARDING-01-06 (service level, no API login yet) application is bound to the account when the applicant keeps email A', async () => {
      const accountA = one(await t.db.insert(accounts).values({ email: 'a@example.com' }).returning());
      const result = await service().submitOrganization(
        await parsedBody({ contactEmail: 'a@example.com' }),
        accountA.id,
      );
      expect(result).toMatchObject({ status: 'SUBMITTED', contactEmail: 'a@example.com' });
      const row = one(await t.db.select().from(partnerApplications).where(eq(partnerApplications.id, result.id)));
      expect(row.applicantAccountId).toBe(accountA.id);
    });

    it('AC-PARTNER-ONBOARDING-01-06 (service level, no API login yet) application is bound to the account when the applicant changes the contact email to B', async () => {
      const accountA = one(await t.db.insert(accounts).values({ email: 'a@example.com' }).returning());
      const result = await service().submitOrganization(
        await parsedBody({ contactEmail: 'b@example.com' }),
        accountA.id,
      );
      expect(result).toMatchObject({ status: 'SUBMITTED', contactEmail: 'b@example.com' });
      const row = one(await t.db.select().from(partnerApplications).where(eq(partnerApplications.id, result.id)));
      expect(row.applicantAccountId).toBe(accountA.id);
    });

    it('AC-PARTNER-ONBOARDING-01-12 (service level, no API login yet) a contact email edited from A to B is accepted and stored as B', async () => {
      const accountA = one(await t.db.insert(accounts).values({ email: 'a@example.com' }).returning());
      const result = await service().submitOrganization(
        await parsedBody({ contactEmail: 'b@example.com' }),
        accountA.id,
      );
      const row = one(await t.db.select().from(partnerApplications).where(eq(partnerApplications.id, result.id)));
      expect(row.contactEmail).toBe('b@example.com');
      expect(row.contactEmail).not.toBe(accountA.email);
    });

    it('an anonymous application is not bound to any account', async () => {
      const res = await submit(await validBody()).expect(201);
      const row = one(
        await t.db
          .select()
          .from(partnerApplications)
          .where(eq(partnerApplications.id, created(res).id)),
      );
      expect(row.applicantAccountId).toBeNull();
    });
  });

  describe('duplicate tax id', () => {
    it('AC-PARTNER-ONBOARDING-01-11 applicant sees no duplicate warning for an ACTIVE partner with the same tax id', async () => {
      await t.db
        .insert(partners)
        .values({ legalName: 'Đối tác đang hoạt động', taxId: '0312345678', status: 'ACTIVE' });
      const res = await submit(await validBody()).expect(201);
      expect(Object.keys(res.body as Record<string, unknown>).sort()).toEqual(
        [
          'businessRegistration',
          'contactEmail',
          'contactName',
          'id',
          'legalName',
          'otherAttachments',
          'plannedArtists',
          'sellOnly',
          'status',
          'submittedAt',
          'taxId',
          'type',
        ].sort(),
      );
      expect(JSON.stringify(res.body)).not.toContain('Đối tác đang hoạt động');
    });
  });

  describe('attachment upload', () => {
    it('keeps a Vietnamese file name intact', async () => {
      const id = await upload('Giấy đăng ký kinh doanh.pdf');
      const row = one(await t.db.select().from(attachments).where(eq(attachments.id, id)));
      expect(row.fileName).toBe('Giấy đăng ký kinh doanh.pdf');
      expect(Buffer.from(row.content).toString()).toBe('%PDF-1.4 demo');
    });

    it('rejects an empty file and a request without a file', async () => {
      const empty = await http()
        .post('/api/partner-applications/attachments')
        .attach('file', Buffer.alloc(0), { filename: 'rong.pdf' })
        .expect(400);
      expect(empty.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/file' }] });
      const none = await http().post('/api/partner-applications/attachments').expect(400);
      expect(none.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/file' }] });
    });

    it('rejects an unknown form field next to the file and stores nothing', async () => {
      const res = await http()
        .post('/api/partner-applications/attachments')
        .field('note', 'x')
        .attach('file', Buffer.from('%PDF-1.4 demo'), { filename: 'gpkd.pdf', contentType: 'application/pdf' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/note' }] });
      expect(await t.db.select().from(attachments)).toHaveLength(0);
    });

    it('rejects a text field named file sent next to the real file', async () => {
      const res = await http()
        .post('/api/partner-applications/attachments')
        .field('file', 'x')
        .attach('file', Buffer.from('%PDF-1.4 demo'), { filename: 'gpkd.pdf', contentType: 'application/pdf' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/file' }] });
      expect(await t.db.select().from(attachments)).toHaveLength(0);
    });

    it('accepts a file of exactly 10 MB', async () => {
      const res = await http()
        .post('/api/partner-applications/attachments')
        .attach('file', Buffer.alloc(10 * 1024 * 1024, 1), {
          filename: 'bang-10mb.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      expect(res.body.sizeBytes).toBe(10 * 1024 * 1024);
    });

    it('rejects a file one byte over 10 MB with 413 and stores nothing', async () => {
      const res = await http()
        .post('/api/partner-applications/attachments')
        .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 1), {
          filename: 'qua-10mb.pdf',
          contentType: 'application/pdf',
        })
        .expect(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(await t.db.select().from(attachments)).toHaveLength(0);
    });
  });
});
