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
  IndividualPartnerApplicationSchema,
  PartnerApplicationSchema,
} from '../src/partner-applications/partner-applications.schemas.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const MB = 1024 * 1024;
const PDF = Buffer.from('%PDF-1.4 demo');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('demo')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('demo')]);
const CITIZEN_ID = '079123456789';

/** A jpg of exactly `size` bytes. */
const jpgOfSize = (size: number) => Buffer.concat([JPG, Buffer.alloc(size - JPG.length, 1)]);

/** The only row of a query that must have returned one. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) {
    throw new Error('expected a row');
  }
  return row;
}

describe('partner applications (individual)', () => {
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

  async function upload(fileName = 'cccd.jpg', content: Buffer = JPG): Promise<string> {
    const res = await t
      .http()
      .post('/api/partner-applications/attachments')
      .attach('file', content, { filename: fileName })
      .expect(201);
    return AttachmentSchema.parse(res.body).id;
  }

  /** A complete individual application body; pass `undefined` to leave a field out. */
  async function validBody(overrides: Record<string, unknown> = {}) {
    return {
      legalForm: 'cá nhân',
      applicantName: 'Trần Thị Bích',
      contactEmail: 'b@y.com',
      legalName: 'Nguyễn Văn An',
      citizenId: CITIZEN_ID,
      citizenIdImage: await upload(),
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

  const post = (body: object) => t.http().post('/api/partner-applications/individual').send(body);
  const submit = async (overrides: Record<string, unknown> = {}) => post(await validBody(overrides));

  /** The application in a 201 response, checked against the published response schema. */
  const created = (res: { body: unknown }) => IndividualPartnerApplicationSchema.parse(res.body);

  const storedRow = async (id: string) =>
    one(await t.db.select().from(partnerApplications).where(eq(partnerApplications.id, id)));

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

  /** A 400 VALIDATION_FAILED that points at exactly these inputs (JSON pointers below `/body`); returns its errors. */
  function expectInvalid(
    res: { status: number; body: { code: string; errors: { pointer: string; code: string }[] } },
    ...fields: string[]
  ) {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((error) => error.pointer).sort()).toEqual(
      fields.map((field) => `/body/${field}`).sort(),
    );
    return res.body.errors;
  }

  /** The applicant's view: exactly the fields of the published response, with no duplicate warning. */
  function expectNoWarning(res: { body: object }, existingName: string) {
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'applicantName',
        'citizenId',
        'contactEmail',
        'declaredArtists',
        'id',
        'legalForm',
        'legalName',
        'salesOnly',
        'status',
        'submittedAt',
      ].sort(),
    );
    expect(JSON.stringify(res.body)).not.toContain(existingName);
  }

  describe('submitted status', () => {
    it('AC-PARTNER-ONBOARDING-14-01 example 1: one declared artist, no optional document, new legal entity', async () => {
      const res = await expectStatus(201, submit({ declaredArtists: ['Nghệ sĩ Một'], otherDocuments: [] }));
      expect(created(res)).toMatchObject({
        legalForm: 'cá nhân',
        status: 'SUBMITTED',
        applicantName: 'Trần Thị Bích',
        contactEmail: 'b@y.com',
        legalName: 'Nguyễn Văn An',
        citizenId: CITIZEN_ID,
        salesOnly: false,
        declaredArtists: ['Nghệ sĩ Một'],
        submittedAt: t.clock.now().toISOString(),
      });
      const row = await storedRow(created(res).id);
      expect(row).toMatchObject({ status: 'SUBMITTED', legalForm: 'cá nhân', citizenId: CITIZEN_ID, taxCode: null });
      expect(await t.db.select().from(partnerApplications)).toHaveLength(1);
      const files = await t.db
        .select()
        .from(attachments)
        .where(eq(attachments.applicationId, created(res).id));
      expect(files.map((file) => file.kind)).toEqual(['CITIZEN_ID_IMAGE']);
    });

    it('AC-PARTNER-ONBOARDING-14-01 example 2: two declared artists, one optional document, new legal entity', async () => {
      const other = await upload('ho-so.pdf', PDF);
      const res = await expectStatus(
        201,
        submit({ declaredArtists: ['Nghệ sĩ Một', 'Nghệ sĩ Hai'], otherDocuments: [other] }),
      );
      expect(created(res)).toMatchObject({ status: 'SUBMITTED', declaredArtists: ['Nghệ sĩ Một', 'Nghệ sĩ Hai'] });
      expect((await storedRow(created(res).id)).status).toBe('SUBMITTED');
      const files = await t.db
        .select()
        .from(attachments)
        .where(eq(attachments.applicationId, created(res).id));
      expect(files.map((file) => file.kind).sort()).toEqual(['CITIZEN_ID_IMAGE', 'OTHER']);
      expect(files.find((file) => file.kind === 'OTHER')?.id).toBe(other);
    });

    it('AC-PARTNER-ONBOARDING-14-01 example 3: sales only without artists, citizen ID shared with an ACTIVE partner', async () => {
      await t.db
        .insert(partners)
        .values({ legalName: 'Đối tác đang hoạt động', citizenId: CITIZEN_ID, status: 'ACTIVE' });
      const res = await expectStatus(201, submit({ salesOnly: true, declaredArtists: undefined, otherDocuments: [] }));
      expect(created(res)).toMatchObject({
        status: 'SUBMITTED',
        salesOnly: true,
        declaredArtists: [],
        citizenId: CITIZEN_ID,
      });
      expect((await storedRow(created(res).id)).status).toBe('SUBMITTED');
      expectNoWarning(res, 'Đối tác đang hoạt động');
    });
  });

  describe('required information', () => {
    const missing = (field: string, value?: unknown) =>
      submit({ salesOnly: true, declaredArtists: undefined, [field]: value });

    /**
     * The field left out, then sent empty: both are "not entered" for the user, and the error points at that field
     * so the screen can show its message. A left-out input is `invalid_type`; an empty one is `emptyCode`.
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

    it('AC-PARTNER-ONBOARDING-14-08 example 1: missing legal name of the individual is refused and nothing is created', async () => {
      await expectNotEntered('legalName', 'too_small');
    });

    it('AC-PARTNER-ONBOARDING-14-08 example 2: missing citizen ID number is refused and nothing is created', async () => {
      await expectNotEntered('citizenId', 'too_small');
    });

    it('AC-PARTNER-ONBOARDING-14-08 example 3: missing citizen ID image is refused and nothing is created', async () => {
      const spareUpload = await upload('khong-dung.jpg');
      await expectNotEntered('citizenIdImage', 'invalid_format');
      const file = one(await t.db.select().from(attachments).where(eq(attachments.id, spareUpload)));
      expect(file.applicationId).toBeNull();
    });

    it('AC-PARTNER-ONBOARDING-14-08 example 4: missing applicant name is refused and nothing is created', async () => {
      await expectNotEntered('applicantName', 'too_small');
    });

    it('AC-PARTNER-ONBOARDING-14-08 example 5: missing contact email is refused and nothing is created', async () => {
      await expectNotEntered('contactEmail', 'too_small');
    });

    it('every missing required input is listed together', async () => {
      const res = await post({ salesOnly: true });
      expectInvalid(res, 'legalForm', 'applicantName', 'contactEmail', 'legalName', 'citizenId', 'citizenIdImage');
      await expectNothingCreated();
    });

    it('AC-PARTNER-ONBOARDING-14-07 not sales only without declared artists is refused with the artists named', async () => {
      const res = await submit({ salesOnly: false, declaredArtists: undefined });
      expectInvalid(res, 'declaredArtists');
      expect(res.body.errors[0]?.code).toBe('too_small');
      await expectNothingCreated();
    });

    it('AC-PARTNER-ONBOARDING-14-07 not sales only with an empty artist list, or sales only left out, is refused the same way', async () => {
      const empty = await submit({ salesOnly: false, declaredArtists: [] });
      expectInvalid(empty, 'declaredArtists');
      expect(empty.body.errors[0]?.code).toBe('too_small');
      expectInvalid(await submit({ salesOnly: undefined, declaredArtists: [] }), 'declaredArtists');
      await expectNothingCreated();
    });

    it('a request without an object body is refused with 400, not a server error', async () => {
      const none = await t.http().post('/api/partner-applications/individual');
      expect(none.status).toBe(400);
      expect(none.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      for (const body of [null, 'text', [1], 5]) {
        const res = await t
          .http()
          .post('/api/partner-applications/individual')
          .send(JSON.stringify(body))
          .set('Content-Type', 'application/json');
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      await expectNothingCreated();
    });
  });

  describe('notifications', () => {
    it('AC-PARTNER-ONBOARDING-14-02 anonymous applicant: confirmation email to b@y.com and no in-app notification for the applicant', async () => {
      await t.db.insert(accounts).values([{ email: 'b@y.com' }, { email: 'admin@aar.vn', isPlatformAdmin: true }]);
      const res = await expectStatus(201, submit({ contactEmail: 'b@y.com' }));

      const { emails, notifications: inApp } = await state();
      expect(emails.filter((mail) => mail.kind === 'APPLICATION_RECEIVED')).toEqual([
        expect.objectContaining({
          toEmail: 'b@y.com',
          subject: 'Đơn cá nhân đã được nhận',
          body: 'Đơn cá nhân đã được nhận',
          applicationId: created(res).id,
          sentAt: null,
        }),
      ]);
      expect(inApp.filter((notice) => notice.kind === 'APPLICATION_RECEIVED')).toEqual([]);
      const applicantAccount = one(await t.db.select().from(accounts).where(eq(accounts.email, 'b@y.com')));
      expect(inApp.some((notice) => notice.accountId === applicantAccount.id)).toBe(false);
    });

    it('AC-PARTNER-ONBOARDING-14-03 every platform admin gets an email and an in-app notification', async () => {
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
      for (const mail of adminMails) {
        expect(mail).toMatchObject({
          subject: 'Có đơn cá nhân mới cần nhận',
          body: 'Có đơn cá nhân mới cần nhận',
          applicationId: created(res).id,
        });
      }

      expect(inApp.map((notice) => notice.accountId).sort()).toEqual(admins.map((admin) => admin.id).sort());
      for (const notice of inApp) {
        expect(notice).toMatchObject({
          kind: 'APPLICATION_NEW_FOR_ADMIN',
          message: 'Có đơn cá nhân mới cần nhận',
          applicationId: created(res).id,
        });
      }
      expect(inApp.some((notice) => notice.accountId === bystander.id)).toBe(false);
    });

    it('a refused application sends nothing to anyone', async () => {
      await t.db.insert(accounts).values({ email: 'admin@aar.vn', isPlatformAdmin: true });
      await expectStatus(400, submit({ citizenId: undefined }));
      await expectNothingCreated();
    });
  });

  describe('duplicate citizen ID', () => {
    async function seedApplication(status: ApplicationStatus, citizenId: string) {
      await t.db.insert(partnerApplications).values({
        legalForm: 'cá nhân',
        status,
        applicantName: 'Người nộp cũ',
        contactEmail: 'cu@example.com',
        legalName: 'Pháp nhân đã nộp đơn',
        citizenId,
        salesOnly: true,
        declaredArtists: [],
      });
    }

    it('AC-PARTNER-ONBOARDING-14-04 a NEEDS_INFO application has citizen ID Y: accepted and the applicant sees no duplicate warning', async () => {
      await seedApplication('NEEDS_INFO', CITIZEN_ID);
      const res = await expectStatus(201, submit({ citizenId: CITIZEN_ID }));
      expect(created(res)).toMatchObject({ status: 'SUBMITTED', citizenId: CITIZEN_ID });
      expectNoWarning(res, 'Pháp nhân đã nộp đơn');
      expect(await t.db.select().from(partnerApplications)).toHaveLength(2);
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
      return expectInvalid(res, pointer)[0]?.code;
    }

    it('legalForm is required; this endpoint takes cá nhân and refuses tổ chức and anything else', async () => {
      await accepted('legalForm', 'cá nhân');
      await refused('legalForm', undefined);
      await refused('legalForm', 'tổ chức');
      await refused('legalForm', 'INDIVIDUAL');
    });

    it('legalName is 1 to 255 characters, not only spaces, counted in Unicode NFC after trimming', async () => {
      expect((await accepted('legalName', 'A')).legalName).toBe('A');
      expect((await accepted('legalName', 'a'.repeat(255))).legalName).toHaveLength(255);
      expect(await refused('legalName', 'a'.repeat(256))).toBe('too_big');
      expect(await refused('legalName', '')).toBe('too_small');
      expect(await refused('legalName', '   \t ')).toBe('too_small');
      await refused('legalName', 42);
      expect((await accepted('legalName', 'e\u0301'.repeat(255))).legalName).toBe('\u00e9'.repeat(255));
      await refused('legalName', 'e\u0301'.repeat(256));
      await accepted('legalName', '😀'.repeat(255));
      await refused('legalName', '😀'.repeat(256));
      expect((await accepted('legalName', `  ${'b'.repeat(255)}  `)).legalName).toHaveLength(255);
    });

    it('citizenId is exactly 12 ASCII digits and nothing else', async () => {
      expect((await accepted('citizenId', '000000000000')).citizenId).toBe('000000000000');
      expect((await accepted('citizenId', '999999999999')).citizenId).toBe('999999999999');
      expect(await refused('citizenId', '07912345678')).toBe('invalid_format');
      expect(await refused('citizenId', '0791234567890')).toBe('too_big');
      expect(await refused('citizenId', '')).toBe('too_small');
      expect(await refused('citizenId', '   ')).toBe('too_small');
      for (const bad of ['07912345678A', '079-12345678', '079 12345678', '０７９１２３４５６７８９', '٠٧٩١٢٣٤٥٦٧٨٩']) {
        expect(await refused('citizenId', bad), bad).toBe('invalid_format');
      }
      await refused('citizenId', 79123456789);
      // Surrounding whitespace is dropped before the check and is not stored.
      const trimmed = await accepted('citizenId', ` ${CITIZEN_ID}\t`);
      expect(trimmed.citizenId).toBe(CITIZEN_ID);
      expect((await storedRow(trimmed.id)).citizenId).toBe(CITIZEN_ID);
    });

    it('applicantName is 1 to 255 characters, not only spaces, counted in Unicode NFC after trimming', async () => {
      expect((await accepted('applicantName', 'A')).applicantName).toBe('A');
      expect((await accepted('applicantName', 'a'.repeat(255))).applicantName).toHaveLength(255);
      expect(await refused('applicantName', 'a'.repeat(256))).toBe('too_big');
      expect(await refused('applicantName', '')).toBe('too_small');
      expect(await refused('applicantName', '    ')).toBe('too_small');
      expect((await accepted('applicantName', 'e\u0301'.repeat(255))).applicantName).toBe('\u00e9'.repeat(255));
      await refused('applicantName', '😀'.repeat(256));
    });

    it('contactEmail is at most 254 characters: one @, something before it, an inner dot after it, no spaces', async () => {
      await accepted('contactEmail', 'a@b.c');
      const longest = `${'a'.repeat(254 - '@example.com'.length)}@example.com`;
      expect(longest).toHaveLength(254);
      await accepted('contactEmail', longest);
      expect(await refused('contactEmail', `a${longest}`)).toBe('too_big');
      expect(await refused('contactEmail', '')).toBe('too_small');
      expect(await refused('contactEmail', '   ')).toBe('too_small');
      for (const bad of ['b.y.com', 'b@@y.com', 'b@y@z.com', 'b@y', 'b y@z.com', '@y.com', 'a@.com', 'a@com.']) {
        expect(await refused('contactEmail', bad), bad).toBe('invalid_format');
      }
      expect((await accepted('contactEmail', ' B@Y.COM ')).contactEmail).toBe('B@Y.COM');
    });

    it('salesOnly is a boolean that defaults to false', async () => {
      expect((await accepted('salesOnly', true, { declaredArtists: undefined })).salesOnly).toBe(true);
      expect((await accepted('salesOnly', false)).salesOnly).toBe(false);
      expect((await accepted('salesOnly', undefined)).salesOnly).toBe(false);
      await refused('salesOnly', 'true');
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
    });

    it('a member the ticket does not list is refused, including the organization identifiers', async () => {
      await refused('taxCode', '0312345678');
      await refused('businessRegistration', await upload('gpkd.pdf', PDF));
      await refused('applicantAccountId', '00000000-0000-4000-8000-000000000000');
      await refused('duplicateWarning', true);
    });
  });

  describe('files', () => {
    it('citizenIdImage takes pdf, jpg or png', async () => {
      for (const [name, content] of [
        ['cccd.pdf', PDF],
        ['cccd.jpg', JPG],
        ['cccd.jpeg', JPG],
        ['CCCD.PNG', PNG],
      ] as const) {
        const res = await submit({ citizenIdImage: await upload(name, content) });
        expect(res.status, name).toBe(201);
      }
    });

    it('a citizen ID image of another type is refused when uploaded, and nothing is stored', async () => {
      for (const [name, content] of [
        ['cccd.gif', Buffer.from('GIF89a demo')],
        ['cccd.heic', Buffer.from('ftypheic')],
        ['cccd.jpg', PDF],
      ] as const) {
        const res = await t
          .http()
          .post('/api/partner-applications/attachments')
          .attach('file', content, { filename: name })
          .expect(422);
        expect(res.body.code, name).toBe('PARTNER_APPLICATION_FILE_TYPE_NOT_ALLOWED');
      }
      expect(await t.db.select().from(attachments)).toHaveLength(0);
    });

    it('a citizen ID image of exactly 10 MB is accepted and one byte more is refused with 413', async () => {
      const ok = await t
        .http()
        .post('/api/partner-applications/attachments')
        .attach('file', jpgOfSize(10 * MB), { filename: 'cccd-10mb.jpg' })
        .expect(201);
      const image = AttachmentSchema.parse(ok.body);
      expect(image.sizeBytes).toBe(10 * MB);
      await expectStatus(201, submit({ citizenIdImage: image.id }));

      const tooBig = await t
        .http()
        .post('/api/partner-applications/attachments')
        .attach('file', jpgOfSize(10 * MB + 1), { filename: 'cccd-qua-10mb.jpg' })
        .expect(413);
      expect(tooBig.body.code).toBe('PAYLOAD_TOO_LARGE');
    }, 30_000);

    it('citizenIdImage is exactly one file', async () => {
      const [first, second] = [await upload('a.jpg'), await upload('b.jpg')];
      expectInvalid(await submit({ citizenIdImage: [first, second] }), 'citizenIdImage');
      expectInvalid(await submit({ citizenIdImage: [first] }), 'citizenIdImage');
      expectInvalid(await submit({ citizenIdImage: 'khong-phai-id' }), 'citizenIdImage');
      await expectNothingCreated();
    });

    it('otherDocuments takes none, one or two files and refuses a third: three files per application', async () => {
      expect((await submit({ otherDocuments: [] })).status).toBe(201);
      expect((await submit({ otherDocuments: [await upload('a.pdf', PDF)] })).status).toBe(201);
      const two = await submit({ otherDocuments: [await upload('a.pdf', PDF), await upload('b.png', PNG)] });
      expect(two.status).toBe(201);
      expect(
        (
          await t.db
            .select()
            .from(attachments)
            .where(eq(attachments.applicationId, created(two).id))
        ).length,
      ).toBe(3);
      const attachedBefore = (await state()).attachedFiles.length;

      const three = [await upload('a.pdf', PDF), await upload('b.pdf', PDF), await upload('c.pdf', PDF)];
      expectInvalid(await submit({ otherDocuments: three }), 'otherDocuments');
      expect((await state()).attachedFiles).toHaveLength(attachedBefore);
    });

    it('a file listed twice is refused', async () => {
      const image = await upload();
      expectInvalid(await submit({ citizenIdImage: image, otherDocuments: [image] }), 'otherDocuments');
      const other = await upload('b.pdf', PDF);
      expectInvalid(await submit({ otherDocuments: [other, other] }), 'otherDocuments');
      await expectNothingCreated();
    });

    it('a citizen ID image that does not exist or belongs to another application is refused and nothing is attached', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      const first = await expectStatus(201, submit());
      const usedImage = one(
        await t.db
          .select()
          .from(attachments)
          .where(eq(attachments.applicationId, created(first).id)),
      ).id;
      const organization = await expectStatus(
        201,
        t
          .http()
          .post('/api/partner-applications')
          .send({
            legalForm: 'tổ chức',
            applicantName: 'Trần Thị Bích',
            contactEmail: 'b@y.com',
            legalName: 'Công ty TNHH Âm Nhạc Sao',
            taxCode: '0312345678',
            businessRegistration: await upload('gpkd.pdf', PDF),
            salesOnly: true,
          }),
      );
      const usedRegistration = one(
        await t.db
          .select()
          .from(attachments)
          .where(eq(attachments.applicationId, PartnerApplicationSchema.parse(organization.body).id)),
      ).id;
      const before = await state();

      for (const image of [usedImage, usedRegistration, unknown]) {
        const res = await expectStatus(422, submit({ citizenIdImage: image }));
        expect(res.body.code).toBe('PARTNER_APPLICATION_CITIZEN_ID_IMAGE_INVALID');
      }

      const unusable = await upload('c.jpg');
      const badOther = await expectStatus(422, submit({ citizenIdImage: unusable, otherDocuments: [unknown] }));
      expect(badOther.body.code).toBe('PARTNER_APPLICATION_OTHER_DOCUMENTS_INVALID');
      expect(one(await t.db.select().from(attachments).where(eq(attachments.id, unusable))).applicationId).toBeNull();

      const after = await state();
      expect(after.applications).toHaveLength(before.applications.length);
      expect(after.emails).toHaveLength(before.emails.length);
      expect(after.notifications).toHaveLength(before.notifications.length);
      expect(after.attachedFiles).toHaveLength(before.attachedFiles.length);
    });
  });
});
