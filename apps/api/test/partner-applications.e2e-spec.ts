import { eq } from 'drizzle-orm';
import request from 'supertest';
import { accounts, attachments, emailOutbox, notifications, partnerApplications, partners } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './support/test-app.js';

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

  const http = () => request(t.app.getHttpServer());

  async function upload(fileName = 'gpkd.pdf'): Promise<string> {
    const res = await http()
      .post('/api/partner-applications/attachments')
      .attach('file', Buffer.from('%PDF-1.4 demo'), { filename: fileName, contentType: 'application/pdf' })
      .expect(201);
    return res.body.id;
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

  const submit = (body: unknown) => http().post('/api/partner-applications/organization').send(body as object);
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
      const [row] = await t.db.select().from(partnerApplications).where(eq(partnerApplications.id, res.body.id));
      expect(row.status).toBe('SUBMITTED');
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
      const rows = await t.db.select().from(attachments).where(eq(attachments.applicationId, res.body.id));
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
      const res = await submit(await validBody({ contactEmail: undefined })).expect(400);
      expect(res.body.errors).toEqual([{ field: 'contactEmail', reason: 'REQUIRED' }]);
      expect(await countApplications()).toBe(0);
      expect(await t.db.select().from(emailOutbox)).toHaveLength(0);
    });

    it('AC-PARTNER-ONBOARDING-01-03 blank contact email counts as missing', async () => {
      const res = await submit(await validBody({ contactEmail: '   ' })).expect(400);
      expect(res.body.errors).toEqual([{ field: 'contactEmail', reason: 'REQUIRED' }]);
    });

    it('every missing required field is listed together and leaves the uploaded file unattached', async () => {
      const res = await submit({ sellOnly: true }).expect(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: 'contactName', reason: 'REQUIRED' },
          { field: 'contactEmail', reason: 'REQUIRED' },
          { field: 'legalName', reason: 'REQUIRED' },
          { field: 'taxId', reason: 'REQUIRED' },
          { field: 'businessRegistrationAttachmentId', reason: 'REQUIRED' },
        ]),
      );
      expect(res.body.errors).toHaveLength(5);
    });

    it('a malformed contact email is rejected', async () => {
      const res = await submit(await validBody({ contactEmail: 'khong-phai-email' })).expect(400);
      expect(res.body.errors).toEqual([{ field: 'contactEmail', reason: 'INVALID' }]);
    });

    it('AC-PARTNER-ONBOARDING-01-08 not sell-only without artists requires at least one artist', async () => {
      const res = await submit(await validBody({ plannedArtists: [] })).expect(400);
      expect(res.body.errors).toEqual([{ field: 'plannedArtists', reason: 'REQUIRED' }]);
      expect(await countApplications()).toBe(0);
    });

    it('AC-PARTNER-ONBOARDING-01-08 omitting sellOnly and artists is refused', async () => {
      const res = await submit(await validBody({ plannedArtists: undefined, sellOnly: undefined })).expect(400);
      expect(res.body.errors).toEqual([{ field: 'plannedArtists', reason: 'REQUIRED' }]);
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

      const reuse = await submit(await validBody({ businessRegistrationAttachmentId: used })).expect(400);
      expect(reuse.body.errors).toEqual([{ field: 'businessRegistrationAttachmentId', reason: 'INVALID' }]);
      const unknown = await submit(
        await validBody({ businessRegistrationAttachmentId: '00000000-0000-4000-8000-000000000000' }),
      ).expect(400);
      expect(unknown.body.errors).toEqual([{ field: 'businessRegistrationAttachmentId', reason: 'INVALID' }]);

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
      ).expect(400);
      expect(res.body.errors).toEqual([{ field: 'otherAttachmentIds', reason: 'INVALID' }]);
      expect(await countApplications()).toBe(0);
      const [row] = await t.db.select().from(attachments).where(eq(attachments.id, br));
      expect(row.applicationId).toBeNull();
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
          applicationId: res.body.id,
          sentAt: null,
        }),
      ]);
    });

    it('AC-PARTNER-ONBOARDING-01-09 applicant with an AarHub account also gets an in-app notification', async () => {
      const [account] = await t.db.insert(accounts).values({ email: 'Bich@Example.com' }).returning();
      const res = await submit(await validBody()).expect(201);
      const notices = await t.db.select().from(notifications).where(eq(notifications.accountId, account.id));
      expect(notices).toEqual([
        expect.objectContaining({
          kind: 'APPLICATION_RECEIVED',
          message: 'Đơn tổ chức đã được nhận',
          applicationId: res.body.id,
        }),
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
      const [bystander] = await t.db.insert(accounts).values({ email: 'user@aar.vn' }).returning();
      const res = await submit(await validBody()).expect(201);

      const adminMails = (await t.db.select().from(emailOutbox)).filter((m) => m.kind === 'APPLICATION_NEW_FOR_ADMIN');
      expect(adminMails.map((m) => m.toEmail).sort()).toEqual(['admin1@aar.vn', 'admin2@aar.vn']);
      expect(adminMails.every((m) => m.subject === 'Có đơn tổ chức mới cần nhận' && m.applicationId === res.body.id)).toBe(
        true,
      );

      const adminNotices = (await t.db.select().from(notifications)).filter((n) => n.kind === 'APPLICATION_NEW_FOR_ADMIN');
      expect(adminNotices.map((n) => n.accountId).sort()).toEqual(admins.map((a) => a.id).sort());
      expect(adminNotices.every((n) => n.message === 'Có đơn tổ chức mới cần nhận')).toBe(true);
      expect((await t.db.select().from(notifications)).some((n) => n.accountId === bystander.id)).toBe(false);
    });
  });

  describe('duplicate tax id', () => {
    it('AC-PARTNER-ONBOARDING-01-11 applicant sees no duplicate warning for an ACTIVE partner with the same tax id', async () => {
      await t.db.insert(partners).values({ legalName: 'Đối tác đang hoạt động', taxId: '0312345678', status: 'ACTIVE' });
      const res = await submit(await validBody()).expect(201);
      expect(Object.keys(res.body).sort()).toEqual(
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
      const [row] = await t.db.select().from(attachments).where(eq(attachments.id, id));
      expect(row.fileName).toBe('Giấy đăng ký kinh doanh.pdf');
      expect(Buffer.from(row.content).toString()).toBe('%PDF-1.4 demo');
    });

    it('rejects an empty file and a request without a file', async () => {
      await http()
        .post('/api/partner-applications/attachments')
        .attach('file', Buffer.alloc(0), { filename: 'rong.pdf' })
        .expect(400);
      await http().post('/api/partner-applications/attachments').expect(400);
    });
  });
});
