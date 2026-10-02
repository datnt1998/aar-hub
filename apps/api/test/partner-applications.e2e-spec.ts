import { eq } from 'drizzle-orm';
import {
  accounts,
  type ApplicationStatus,
  attachments,
  emailOutbox,
  notifications,
  partnerApplications,
  partners,
} from '../src/db/schema.js';
import {
  AttachmentSchema,
  PartnerApplicationSchema,
} from '../src/partner-applications/partner-applications.schemas.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const MB = 1024 * 1024;
const PDF = Buffer.from('%PDF-1.4 demo');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('demo')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('demo')]);

/** A pdf of exactly `size` bytes. */
const pdfOfSize = (size: number) => Buffer.concat([PDF, Buffer.alloc(size - PDF.length, 1)]);

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

  async function upload(fileName = 'gpkd.pdf', content: Buffer = PDF): Promise<string> {
    const res = await t
      .http()
      .post('/api/partner-applications/attachments')
      .attach('file', content, { filename: fileName })
      .expect(201);
    return AttachmentSchema.parse(res.body).id;
  }

  /** A complete application body; pass `undefined` to leave a field out. */
  async function validBody(overrides: Record<string, unknown> = {}) {
    return {
      legalForm: 'tổ chức',
      applicantName: 'Trần Thị Bích',
      contactEmail: 'b@y.com',
      legalName: 'Công ty TNHH Âm Nhạc Sao',
      taxCode: '0312345678',
      businessRegistration: await upload(),
      salesOnly: false,
      declaredArtists: ['Nghệ sĩ Một'],
      ...overrides,
    };
  }

  /** Awaits a response and checks its status; returns it for further assertions. */
  async function expectStatus<T extends { status: number }>(status: number, response: PromiseLike<T>): Promise<T> {
    const res = await response;
    expect(res.status).toBe(status);
    return res;
  }

  const post = (body: unknown) =>
    t
      .http()
      .post('/api/partner-applications')
      .send(body as object);
  const submit = async (overrides: Record<string, unknown> = {}) => post(await validBody(overrides));

  /** The application in a 201 response, checked against the published response schema. */
  const created = (res: { body: unknown }) => PartnerApplicationSchema.parse(res.body);

  /** Everything a submission may leave behind. */
  async function state() {
    return {
      applications: await t.db.select().from(partnerApplications),
      emails: await t.db.select().from(emailOutbox),
      notifications: await t.db.select().from(notifications),
      attachedFiles: (await t.db.select().from(attachments)).filter((file) => file.applicationId !== null),
    };
  }

  /** The request was refused and nothing was stored, sent or attached. */
  async function expectNothingCreated() {
    const now = await state();
    expect(now.applications).toHaveLength(0);
    expect(now.emails).toHaveLength(0);
    expect(now.notifications).toHaveLength(0);
    expect(now.attachedFiles).toHaveLength(0);
  }

  /** A 400 VALIDATION_FAILED that points at exactly these inputs (JSON pointers below `/body`). */
  function expectInvalid(
    res: { status: number; body: { code: string; errors: { pointer: string; code: string }[] } },
    ...fields: string[]
  ) {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((error) => error.pointer).sort()).toEqual(
      fields.map((field) => `/body/${field}`).sort(),
    );
  }

  async function seedApplication(status: ApplicationStatus, taxCode: string) {
    await t.db.insert(partnerApplications).values({
      legalForm: 'tổ chức',
      status,
      applicantName: 'Người nộp cũ',
      contactEmail: 'cu@example.com',
      legalName: 'Pháp nhân đã nộp đơn',
      taxCode,
      salesOnly: true,
      declaredArtists: [],
    });
  }

  describe('submitted status', () => {
    it('AC-PARTNER-ONBOARDING-01-01 example 1: one declared artist, no optional document, new legal entity', async () => {
      const res = await expectStatus(201, submit({ declaredArtists: ['Nghệ sĩ Một'], otherDocuments: [] }));
      expect(created(res)).toMatchObject({
        legalForm: 'tổ chức',
        status: 'SUBMITTED',
        applicantName: 'Trần Thị Bích',
        contactEmail: 'b@y.com',
        legalName: 'Công ty TNHH Âm Nhạc Sao',
        taxCode: '0312345678',
        salesOnly: false,
        declaredArtists: ['Nghệ sĩ Một'],
        submittedAt: t.clock.now().toISOString(),
      });
      const row = one(
        await t.db
          .select()
          .from(partnerApplications)
          .where(eq(partnerApplications.id, created(res).id)),
      );
      expect(row.status).toBe('SUBMITTED');
      expect(await t.db.select().from(partnerApplications)).toHaveLength(1);
    });

    it('AC-PARTNER-ONBOARDING-01-01 example 2: two declared artists, one optional document, new legal entity', async () => {
      const other = await upload('phu-luc.pdf');
      const res = await expectStatus(
        201,
        submit({ declaredArtists: ['Nghệ sĩ Một', 'Nghệ sĩ Hai'], otherDocuments: [other] }),
      );
      expect(created(res)).toMatchObject({ status: 'SUBMITTED', declaredArtists: ['Nghệ sĩ Một', 'Nghệ sĩ Hai'] });
      const files = await t.db
        .select()
        .from(attachments)
        .where(eq(attachments.applicationId, created(res).id));
      expect(files.map((file) => file.kind).sort()).toEqual(['BUSINESS_REGISTRATION', 'OTHER']);
      expect(files.find((file) => file.kind === 'OTHER')?.id).toBe(other);
    });

    it('AC-PARTNER-ONBOARDING-01-01 example 3: sales only without artists, tax code shared with an ACTIVE partner', async () => {
      await t.db.insert(partners).values({ legalName: 'Đối tác cũ', taxCode: '0312345678', status: 'ACTIVE' });
      const res = await expectStatus(201, submit({ salesOnly: true, declaredArtists: undefined, otherDocuments: [] }));
      expect(created(res)).toMatchObject({ status: 'SUBMITTED', salesOnly: true, declaredArtists: [] });
      const row = one(
        await t.db
          .select()
          .from(partnerApplications)
          .where(eq(partnerApplications.id, created(res).id)),
      );
      expect(row.status).toBe('SUBMITTED');
    });
  });

  describe('required information', () => {
    const missing = (field: string, value?: unknown) =>
      submit({ salesOnly: true, declaredArtists: undefined, [field]: value });

    /**
     * The field left out, then sent empty: both are "not entered" for the user. Returns the error codes for the UI
     * contract: a left-out input is `invalid_type`; an empty one is `emptyCode`.
     */
    async function expectNotEntered(field: string, emptyCode: string) {
      const omitted = await missing(field);
      expectInvalid(omitted, field);
      expect(omitted.body.errors[0]?.code).toBe('invalid_type');
      const empty = await missing(field, '');
      expectInvalid(empty, field);
      expect(empty.body.errors[0]?.code).toBe(emptyCode);
      await expectNothingCreated();
    }

    it('AC-PARTNER-ONBOARDING-01-03 example 1: missing applicant name is refused and nothing is created', async () => {
      await expectNotEntered('applicantName', 'too_small');
    });

    it('AC-PARTNER-ONBOARDING-01-03 example 2: missing contact email is refused and nothing is created', async () => {
      await expectNotEntered('contactEmail', 'too_small');
    });

    it('AC-PARTNER-ONBOARDING-01-03 example 3: missing legal name is refused and nothing is created', async () => {
      await expectNotEntered('legalName', 'too_small');
    });

    it('AC-PARTNER-ONBOARDING-01-03 example 4: missing tax code is refused and nothing is created', async () => {
      await expectNotEntered('taxCode', 'too_small');
    });

    it('AC-PARTNER-ONBOARDING-01-03 example 5: missing business registration is refused and nothing is created', async () => {
      const spareUpload = await upload('khong-dung.pdf');
      await expectNotEntered('businessRegistration', 'invalid_format');
      const file = one(await t.db.select().from(attachments).where(eq(attachments.id, spareUpload)));
      expect(file.applicationId).toBeNull();
    });

    it('a missing declared artist list and another wrong input are reported together', async () => {
      const res = await submit({ applicantName: undefined, salesOnly: false, declaredArtists: undefined });
      expectInvalid(res, 'applicantName', 'declaredArtists');
      await expectNothingCreated();

      const duplicate = await upload('trung.pdf');
      const both = await submit({ legalName: '', businessRegistration: duplicate, otherDocuments: [duplicate] });
      expectInvalid(both, 'legalName', 'otherDocuments');
      expectInvalid(await submit({ salesOnly: 'false', declaredArtists: [] }), 'salesOnly');
      expectInvalid(await submit({ declaredArtists: ['  '] }), 'declaredArtists/0');
    });

    it('a request without an object body is refused with 400, not a server error', async () => {
      const none = await t.http().post('/api/partner-applications');
      expect(none.status).toBe(400);
      expect(none.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      for (const body of [null, 'text', [1], 5]) {
        const res = await t
          .http()
          .post('/api/partner-applications')
          .send(JSON.stringify(body))
          .set('Content-Type', 'application/json');
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      await expectNothingCreated();
    });

    it('every missing required input is listed together', async () => {
      const res = await post({ salesOnly: true });
      expectInvalid(res, 'legalForm', 'applicantName', 'contactEmail', 'legalName', 'taxCode', 'businessRegistration');
      await expectNothingCreated();
    });

    it('AC-PARTNER-ONBOARDING-01-08 not sales only without declared artists is refused with the artists named', async () => {
      const res = await submit({ salesOnly: false, declaredArtists: undefined });
      expectInvalid(res, 'declaredArtists');
      expect(res.body.errors[0]?.code).toBe('too_small');
      await expectNothingCreated();
    });

    it('AC-PARTNER-ONBOARDING-01-08 not sales only with an empty artist list, or sales only left out, is refused the same way', async () => {
      expectInvalid(await submit({ salesOnly: false, declaredArtists: [] }), 'declaredArtists');
      expectInvalid(await submit({ salesOnly: undefined, declaredArtists: [] }), 'declaredArtists');
      await expectNothingCreated();
    });
  });

  describe('notifications', () => {
    it('AC-PARTNER-ONBOARDING-01-09 anonymous applicant: confirmation email to b@y.com and no in-app notification for the applicant', async () => {
      await t.db.insert(accounts).values([{ email: 'b@y.com' }, { email: 'admin@aar.vn', isPlatformAdmin: true }]);
      const res = await expectStatus(201, submit({ contactEmail: 'b@y.com' }));

      const { emails, notifications: inApp } = await state();
      expect(emails.filter((mail) => mail.kind === 'APPLICATION_RECEIVED')).toEqual([
        expect.objectContaining({
          toEmail: 'b@y.com',
          subject: 'Đơn tổ chức đã được nhận',
          applicationId: created(res).id,
          sentAt: null,
        }),
      ]);
      expect(inApp.filter((notice) => notice.kind === 'APPLICATION_RECEIVED')).toEqual([]);
      const applicantAccount = one(await t.db.select().from(accounts).where(eq(accounts.email, 'b@y.com')));
      expect(inApp.some((notice) => notice.accountId === applicantAccount.id)).toBe(false);
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
      const res = await expectStatus(201, submit());

      const { emails, notifications: inApp } = await state();
      const adminMails = emails.filter((mail) => mail.kind === 'APPLICATION_NEW_FOR_ADMIN');
      expect(adminMails.map((mail) => mail.toEmail).sort()).toEqual(['admin1@aar.vn', 'admin2@aar.vn']);
      expect(
        adminMails.every(
          (mail) => mail.subject === 'Có đơn tổ chức mới cần nhận' && mail.applicationId === created(res).id,
        ),
      ).toBe(true);

      expect(inApp.map((notice) => notice.accountId).sort()).toEqual(admins.map((admin) => admin.id).sort());
      expect(
        inApp.every(
          (notice) =>
            notice.kind === 'APPLICATION_NEW_FOR_ADMIN' &&
            notice.message === 'Có đơn tổ chức mới cần nhận' &&
            notice.applicationId === created(res).id,
        ),
      ).toBe(true);
      expect(inApp.some((notice) => notice.accountId === bystander.id)).toBe(false);
    });

    it('an application is accepted when there is no admin to tell', async () => {
      await expectStatus(201, submit());
      const { emails, notifications: inApp } = await state();
      expect(emails.map((mail) => mail.kind)).toEqual(['APPLICATION_RECEIVED']);
      expect(inApp).toEqual([]);
    });

    it('a refused application sends nothing to anyone', async () => {
      await t.db.insert(accounts).values({ email: 'admin@aar.vn', isPlatformAdmin: true });
      await expectStatus(400, submit({ taxCode: undefined }));
      await expectNothingCreated();
    });
  });

  describe('duplicate tax code', () => {
    /** The applicant's view of a duplicate: a plain 201 with the application only. */
    async function expectAcceptedWithoutWarning(taxCode: string, existingName: string) {
      const res = await expectStatus(201, submit({ taxCode }));
      expect(created(res)).toMatchObject({ status: 'SUBMITTED', taxCode });
      expect(Object.keys(res.body as Record<string, unknown>).sort()).toEqual(
        [
          'applicantName',
          'contactEmail',
          'declaredArtists',
          'id',
          'legalForm',
          'legalName',
          'salesOnly',
          'status',
          'submittedAt',
          'taxCode',
        ].sort(),
      );
      expect(JSON.stringify(res.body)).not.toContain(existingName);
    }

    it('AC-PARTNER-ONBOARDING-01-11 example 1: an ACTIVE partner has tax code X', async () => {
      await t.db
        .insert(partners)
        .values({ legalName: 'Đối tác đang hoạt động', taxCode: '0312345678', status: 'ACTIVE' });
      await expectAcceptedWithoutWarning('0312345678', 'Đối tác đang hoạt động');
    });

    it('AC-PARTNER-ONBOARDING-01-11 example 2: a SUBMITTED application has tax code X', async () => {
      await seedApplication('SUBMITTED', '0312345678');
      await expectAcceptedWithoutWarning('0312345678', 'Pháp nhân đã nộp đơn');
      expect(await t.db.select().from(partnerApplications)).toHaveLength(2);
    });

    it('AC-PARTNER-ONBOARDING-01-11 example 3: an UNDER_REVIEW application has tax code X', async () => {
      await seedApplication('UNDER_REVIEW', '0312345678');
      await expectAcceptedWithoutWarning('0312345678', 'Pháp nhân đã nộp đơn');
    });

    it('AC-PARTNER-ONBOARDING-01-11 example 4: a NEEDS_INFO application has tax code X', async () => {
      await seedApplication('NEEDS_INFO', '0312345678');
      await expectAcceptedWithoutWarning('0312345678', 'Pháp nhân đã nộp đơn');
    });
  });

  describe('input limits', () => {
    /** Posts one input value and expects the application to be accepted; returns it. */
    async function accepted(field: string, value: unknown, others: Record<string, unknown> = {}) {
      const res = await submit({ [field]: value, ...others });
      expect(res.status, `${field} = ${JSON.stringify(value)?.slice(0, 40)} should be accepted`).toBe(201);
      return created(res);
    }

    /** Posts one input value and expects a 400 on exactly that input; returns the first error code. */
    async function refused(field: string, value: unknown, pointer = field, others: Record<string, unknown> = {}) {
      const res = await submit({ [field]: value, ...others });
      expect(res.status, `${field} = ${JSON.stringify(value)?.slice(0, 40)} should be refused`).toBe(400);
      expectInvalid(res, pointer);
      return (res.body as { errors: { code: string }[] }).errors[0]?.code;
    }

    it('legalForm is required; this ticket takes tổ chức and refuses cá nhân and anything else', async () => {
      await accepted('legalForm', 'tổ chức');
      await refused('legalForm', undefined);
      await refused('legalForm', 'cá nhân');
      await refused('legalForm', 'ORGANIZATION');
    });

    it('applicantName is 1 to 255 characters, not only spaces, counted in Unicode NFC after trimming', async () => {
      expect((await accepted('applicantName', 'A')).applicantName).toBe('A');
      expect((await accepted('applicantName', 'a'.repeat(255))).applicantName).toHaveLength(255);
      expect(await refused('applicantName', 'a'.repeat(256))).toBe('too_big');
      expect(await refused('applicantName', '')).toBe('too_small');
      expect(await refused('applicantName', '   \t ')).toBe('too_small');
      await refused('applicantName', 42);
      // 255 decomposed letters are 255 characters in NFC, stored composed.
      expect((await accepted('applicantName', 'e\u0301'.repeat(255))).applicantName).toBe('\u00e9'.repeat(255));
      await refused('applicantName', 'e\u0301'.repeat(256));
      // An emoji is one character although it takes two UTF-16 units.
      await accepted('applicantName', '😀'.repeat(255));
      await refused('applicantName', '😀'.repeat(256));
      expect((await accepted('applicantName', `  ${'b'.repeat(255)}  `)).applicantName).toHaveLength(255);
    });

    it('legalName is 1 to 255 characters and not only spaces', async () => {
      await accepted('legalName', 'C');
      await accepted('legalName', 'c'.repeat(255));
      expect(await refused('legalName', 'c'.repeat(256))).toBe('too_big');
      expect(await refused('legalName', '')).toBe('too_small');
      expect(await refused('legalName', '    ')).toBe('too_small');
    });

    it('contactEmail is at most 254 characters: one @, something before it, an inner dot after it, no spaces', async () => {
      await accepted('contactEmail', 'a@b.c');
      await accepted('contactEmail', 'a.b+c@mail.example.co');
      const longest = `${'a'.repeat(254 - '@example.com'.length)}@example.com`;
      expect(longest).toHaveLength(254);
      await accepted('contactEmail', longest);
      expect(await refused('contactEmail', `a${longest}`)).toBe('too_big');
      expect(await refused('contactEmail', '')).toBe('too_small');
      expect(await refused('contactEmail', '   ')).toBe('too_small');
      for (const bad of [
        'b.y.com',
        'b@@y.com',
        'b@y@z.com',
        'b@y',
        'b@com',
        'b y@z.com',
        'b@y .com',
        '@y.com',
        '@.',
        'a@.',
        'a@.com',
        'a@com.',
        'a@b.',
      ]) {
        expect(await refused('contactEmail', bad), bad).toBe('invalid_format');
      }
      await refused('contactEmail', 7);
      // Matching ignores case, so the address is kept as typed; surrounding spaces are dropped.
      expect((await accepted('contactEmail', ' B@Y.COM ')).contactEmail).toBe('B@Y.COM');
    });

    it('taxCode is exactly 10 or 13 ASCII digits, with no hyphen and no space', async () => {
      await accepted('taxCode', '0312345678');
      await accepted('taxCode', '0312345678123');
      for (const bad of ['031234567', '03123456781', '031234567812', '03123456781234']) {
        await refused('taxCode', bad);
      }
      await refused('taxCode', '');
      for (const bad of ['031-2345678', '0312 345678', '03123456AB', '０３１２３４５６７８', '٠٣١٢٣٤٥٦٧٨']) {
        expect(await refused('taxCode', bad), bad).toBe('invalid_format');
      }
      await refused('taxCode', 312345678);
    });

    it('salesOnly is a boolean that defaults to false', async () => {
      expect((await accepted('salesOnly', true, { declaredArtists: undefined })).salesOnly).toBe(true);
      expect((await accepted('salesOnly', false)).salesOnly).toBe(false);
      expect((await accepted('salesOnly', undefined)).salesOnly).toBe(false);
      await refused('salesOnly', 'true');
      await refused('salesOnly', 1);
      await refused('salesOnly', null);
    });

    it('declaredArtists holds 1 to 20 names of 1 to 255 characters each', async () => {
      const names = (count: number) => Array.from({ length: count }, (_, index) => `Nghệ sĩ ${index + 1}`);
      await accepted('declaredArtists', names(1));
      expect((await accepted('declaredArtists', names(20))).declaredArtists).toHaveLength(20);
      expect(await refused('declaredArtists', names(21))).toBe('too_big');
      expect(await refused('declaredArtists', names(21), 'declaredArtists', { salesOnly: true })).toBe('too_big');
      expect(await refused('declaredArtists', [])).toBe('too_small');
      expect((await accepted('declaredArtists', ['A'])).declaredArtists).toEqual(['A']);
      await accepted('declaredArtists', ['n'.repeat(255)]);
      expect(await refused('declaredArtists', ['n'.repeat(256)], 'declaredArtists/0')).toBe('too_big');
      expect(await refused('declaredArtists', ['Hợp lệ', ''], 'declaredArtists/1')).toBe('too_small');
      expect(await refused('declaredArtists', ['   '], 'declaredArtists/0')).toBe('too_small');
      await refused('declaredArtists', 'Nghệ sĩ Một');
      await refused('declaredArtists', [{ name: 'Nghệ sĩ Một' }], 'declaredArtists/0');
      expect((await accepted('declaredArtists', ['  Nghệ sĩ Một  '])).declaredArtists).toEqual(['Nghệ sĩ Một']);
    });

    it('a member the ticket does not list is refused', async () => {
      await refused('plannedArtists', ['Nghệ sĩ Một']);
      await refused('applicantAccountId', '00000000-0000-4000-8000-000000000000');
    });
  });

  describe('files', () => {
    it('businessRegistration takes pdf, jpg or png', async () => {
      for (const [name, content] of [
        ['gpkd.pdf', PDF],
        ['gpkd.jpg', JPG],
        ['gpkd.jpeg', JPG],
        ['GPKD.PNG', PNG],
      ] as const) {
        const res = await submit({ businessRegistration: await upload(name, content) });
        expect(res.status, name).toBe(201);
      }
    });

    it('a file of another type is refused when uploaded, and nothing is stored', async () => {
      const refusedUpload = async (name: string, content: Buffer) => {
        const res = await t
          .http()
          .post('/api/partner-applications/attachments')
          .attach('file', content, { filename: name })
          .expect(422);
        expect(res.body.code).toBe('PARTNER_APPLICATION_FILE_TYPE_NOT_ALLOWED');
      };
      await refusedUpload('gpkd.txt', Buffer.from('plain text'));
      await refusedUpload('gpkd.exe', Buffer.from('MZ program'));
      await refusedUpload('gpkd.docx', Buffer.from('PK zip'));
      // The name says pdf but the content is a png, and the other way round.
      await refusedUpload('gpkd.pdf', PNG);
      await refusedUpload('gpkd.png', PDF);
      await refusedUpload('gpkd', PDF);
      expect(await t.db.select().from(attachments)).toHaveLength(0);
    });

    it('a file of exactly 10 MB is accepted and one byte more is refused with 413', async () => {
      const ok = await t
        .http()
        .post('/api/partner-applications/attachments')
        .attach('file', pdfOfSize(10 * MB), { filename: 'bang-10mb.pdf' })
        .expect(201);
      expect(AttachmentSchema.parse(ok.body).sizeBytes).toBe(10 * MB);

      const tooBig = await t
        .http()
        .post('/api/partner-applications/attachments')
        .attach('file', pdfOfSize(10 * MB + 1), { filename: 'qua-10mb.pdf' })
        .expect(413);
      expect(tooBig.body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(await t.db.select().from(attachments)).toHaveLength(1);
    }, 30_000);

    it('businessRegistration is exactly one file', async () => {
      const [first, second] = [await upload('a.pdf'), await upload('b.pdf')];
      expectInvalid(await submit({ businessRegistration: [first, second] }), 'businessRegistration');
      expectInvalid(await submit({ businessRegistration: 'khong-phai-id' }), 'businessRegistration');
      await expectNothingCreated();
    });

    it('otherDocuments takes none, one or two files and refuses a third', async () => {
      expect((await submit({ otherDocuments: [] })).status).toBe(201);
      expect((await submit({ otherDocuments: [await upload('a.pdf')] })).status).toBe(201);
      const two = await submit({ otherDocuments: [await upload('a.pdf'), await upload('b.png', PNG)] });
      expect(two.status).toBe(201);
      const attachedBefore = (await state()).attachedFiles.length;

      const three = [await upload('a.pdf'), await upload('b.pdf'), await upload('c.pdf')];
      const res = await submit({ otherDocuments: three });
      expectInvalid(res, 'otherDocuments');
      expect((await state()).attachedFiles).toHaveLength(attachedBefore);
      const notAList = await submit({ otherDocuments: 'a.pdf' });
      expectInvalid(notAList, 'otherDocuments');
    });

    it('a file listed twice is refused', async () => {
      const registration = await upload();
      expectInvalid(
        await submit({ businessRegistration: registration, otherDocuments: [registration] }),
        'otherDocuments',
      );
      const other = await upload('b.pdf');
      expectInvalid(await submit({ otherDocuments: [other, other] }), 'otherDocuments');
      await expectNothingCreated();
    });

    it('a file that does not exist or belongs to another application is refused and nothing is attached', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      const first = await expectStatus(201, submit());
      const usedRegistration = one(
        await t.db
          .select()
          .from(attachments)
          .where(eq(attachments.applicationId, created(first).id)),
      ).id;
      const before = await state();

      const reusedRegistration = await expectStatus(422, submit({ businessRegistration: usedRegistration }));
      expect(reusedRegistration.body.code).toBe('PARTNER_APPLICATION_BUSINESS_REGISTRATION_INVALID');
      const unknownRegistration = await expectStatus(422, submit({ businessRegistration: unknown }));
      expect(unknownRegistration.body.code).toBe('PARTNER_APPLICATION_BUSINESS_REGISTRATION_INVALID');

      const unusable = await upload('c.pdf');
      const badOther = await expectStatus(422, submit({ businessRegistration: unusable, otherDocuments: [unknown] }));
      expect(badOther.body.code).toBe('PARTNER_APPLICATION_OTHER_DOCUMENTS_INVALID');
      const stillFree = one(await t.db.select().from(attachments).where(eq(attachments.id, unusable)));
      expect(stillFree.applicationId).toBeNull();

      const after = await state();
      expect(after.applications).toHaveLength(before.applications.length);
      expect(after.emails).toHaveLength(before.emails.length);
      expect(after.notifications).toHaveLength(before.notifications.length);
      expect(after.attachedFiles).toHaveLength(before.attachedFiles.length);
    });

    it('keeps a Vietnamese file name intact and takes the content type from the content', async () => {
      const res = await t
        .http()
        .post('/api/partner-applications/attachments')
        .attach('file', PDF, { filename: 'Giấy đăng ký kinh doanh.pdf', contentType: 'text/plain' })
        .expect(201);
      expect(AttachmentSchema.parse(res.body)).toMatchObject({
        fileName: 'Giấy đăng ký kinh doanh.pdf',
        contentType: 'application/pdf',
        sizeBytes: PDF.length,
      });
      const row = one(await t.db.select().from(attachments));
      expect(Buffer.from(row.content).toString()).toBe('%PDF-1.4 demo');
    });

    it('refuses an empty file, a request without a file and any other form field', async () => {
      const empty = await t
        .http()
        .post('/api/partner-applications/attachments')
        .attach('file', Buffer.alloc(0), { filename: 'rong.pdf' })
        .expect(400);
      expect(empty.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/file' }] });
      const none = await t.http().post('/api/partner-applications/attachments').expect(400);
      expect(none.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/file' }] });
      const extra = await t
        .http()
        .post('/api/partner-applications/attachments')
        .field('note', 'x')
        .attach('file', PDF, { filename: 'gpkd.pdf' })
        .expect(400);
      expect(extra.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/note' }] });
      const textFile = await t
        .http()
        .post('/api/partner-applications/attachments')
        .field('file', 'x')
        .attach('file', PDF, { filename: 'gpkd.pdf' })
        .expect(400);
      expect(textFile.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ pointer: '/body/file' }] });
      expect(await t.db.select().from(attachments)).toHaveLength(0);
    });
  });
});
