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
import { MalwareScanner } from '../src/malware-scan/malware-scanner.js';
import { RESUBMIT_WINDOW_MS } from '../src/partner-applications/partner-applications.js';
import { PartnerApplicationSchema } from '../src/partner-applications/partner-applications.schemas.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';
import { EICAR, type FakeClamd, startFakeClamd } from './support/fake-clamd.js';

const MB = 1024 * 1024;
const PDF = Buffer.from('%PDF-1.4 demo');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('demo')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('demo')]);
const GIF = Buffer.from('GIF89a demo');
/** A .docx is a zip archive. */
const DOCX = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('[Content_Types].xml word/document.xml'),
]);
/** A Windows program starts with MZ. */
const EXE = Buffer.from('MZ\x90\x00 This program cannot be run in DOS mode.');

/** `content` padded to exactly `size` bytes. */
const ofSize = (content: Buffer, size: number) => Buffer.concat([content, Buffer.alloc(size - content.length, 1)]);

interface Upload {
  filename: string;
  content: Buffer;
}
const file = (filename: string, content: Buffer = PDF): Upload => ({ filename, content });

/** A form value: text, repeated text, a boolean sent as "true"/"false", or files. `undefined` leaves the field out. */
type FormValue = string | string[] | boolean | Upload | Upload[] | undefined;

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
  let clamd: FakeClamd;

  beforeAll(async () => {
    clamd = await startFakeClamd();
    t = await createTestApp({
      override: (builder) =>
        builder
          .overrideProvider(MalwareScanner)
          .useValue(new MalwareScanner({ host: '127.0.0.1', port: clamd.port, timeoutMs: 1000 })),
    });
  });
  afterAll(async () => {
    await t.close();
    await clamd.close();
  });
  beforeEach(async () => {
    await t.reset();
    clamd.mode = 'scan';
    clamd.scanned = [];
  });

  /** A complete application; pass `undefined` to leave a field out. */
  const validForm = (overrides: Record<string, FormValue> = {}): Record<string, FormValue> => ({
    legalForm: 'tổ chức',
    applicantName: 'Trần Thị Bích',
    contactEmail: 'b@y.com',
    legalName: 'Công ty TNHH Âm Nhạc Sao',
    taxCode: '0312345678',
    businessRegistration: file('gpkd.pdf'),
    salesOnly: false,
    declaredArtists: ['Nghệ sĩ Một'],
    ...overrides,
  });

  /** Awaits a response and checks its status; returns it for further assertions. */
  async function expectStatus<T extends { status: number }>(status: number, response: PromiseLike<T>): Promise<T> {
    const res = await response;
    expect(res.status).toBe(status);
    return res;
  }

  /** Sends the form as multipart/form-data, in one request with its files. */
  const post = (form: Record<string, FormValue>) => {
    let req = t.http().post('/api/partner-applications');
    for (const [name, value] of Object.entries(form)) {
      for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        req =
          typeof part === 'object'
            ? req.attach(name, part.content, { filename: part.filename })
            : req.field(name, String(part));
      }
    }
    return req;
  };
  const submit = (overrides: Record<string, FormValue> = {}) => post(validForm(overrides));

  /** The application in a 201 response, checked against the published response schema. */
  const created = (res: { body: unknown }) => PartnerApplicationSchema.parse(res.body);

  /** Everything a submission may leave behind. */
  async function state() {
    return {
      applications: await t.db.select().from(partnerApplications),
      emails: await t.db.select().from(emailOutbox),
      notifications: await t.db.select().from(notifications),
      files: await t.db.select().from(attachments),
    };
  }

  /** The request was refused and nothing was stored or sent: no application, no file. */
  async function expectNothingCreated() {
    const now = await state();
    expect(now.applications).toHaveLength(0);
    expect(now.emails).toHaveLength(0);
    expect(now.notifications).toHaveLength(0);
    expect(now.files).toHaveLength(0);
  }

  type Errors = { pointer: string; code: string }[];

  /** A 400 VALIDATION_FAILED that points at exactly these inputs (JSON pointers below `/body`). */
  function expectInvalid(res: { status: number; body: { code: string; errors: Errors } }, ...fields: string[]) {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((error) => error.pointer).sort()).toEqual(
      fields.map((field) => `/body/${field}`).sort(),
    );
  }

  /** Errors of a response as `pointer code` lines, sorted, for exact comparison. */
  const errorsOf = (res: { body: { errors: Errors } }) =>
    res.body.errors.map((error) => `${error.pointer} ${error.code}`).sort();

  const filesOf = (applicationId: string) =>
    t.db.select().from(attachments).where(eq(attachments.applicationId, applicationId));

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
      const res = await expectStatus(201, submit({ declaredArtists: ['Nghệ sĩ Một'], otherDocuments: undefined }));
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
      expect((await filesOf(created(res).id)).map((stored) => stored.kind)).toEqual(['BUSINESS_REGISTRATION']);
    });

    it('AC-PARTNER-ONBOARDING-01-01 example 2: two declared artists, one optional document, new legal entity', async () => {
      const res = await expectStatus(
        201,
        submit({ declaredArtists: ['Nghệ sĩ Một', 'Nghệ sĩ Hai'], otherDocuments: [file('phu-luc.pdf')] }),
      );
      expect(created(res)).toMatchObject({ status: 'SUBMITTED', declaredArtists: ['Nghệ sĩ Một', 'Nghệ sĩ Hai'] });
      const stored = await filesOf(created(res).id);
      expect(stored.map((row) => `${row.kind} ${row.fileName}`).sort()).toEqual([
        'BUSINESS_REGISTRATION gpkd.pdf',
        'OTHER phu-luc.pdf',
      ]);
    });

    it('AC-PARTNER-ONBOARDING-01-01 example 3: sales only without artists, tax code shared with an ACTIVE partner', async () => {
      await t.db.insert(partners).values({ legalName: 'Đối tác cũ', taxCode: '0312345678', status: 'ACTIVE' });
      const res = await expectStatus(201, submit({ salesOnly: true, declaredArtists: undefined }));
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
    const missing = (field: string, value?: FormValue) =>
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
      // No file part, or an empty text field in its place: both are "no file".
      await expectNotEntered('businessRegistration', 'invalid_type');
      expect(clamd.scanned).toHaveLength(0);
    });

    it('a missing declared artist list and another wrong input are reported together', async () => {
      const res = await submit({ applicantName: undefined, salesOnly: false, declaredArtists: undefined });
      expectInvalid(res, 'applicantName', 'declaredArtists');
      await expectNothingCreated();

      expectInvalid(
        await submit({ legalName: '', otherDocuments: [file('a.txt', Buffer.from('text'))] }),
        'legalName',
        'otherDocuments/0',
      );
      expectInvalid(await submit({ salesOnly: 'no', declaredArtists: undefined }), 'salesOnly');
      expectInvalid(await submit({ declaredArtists: ['  '] }), 'declaredArtists/0');
    });

    it('a request without a form body is refused with 400, not a server error', async () => {
      const none = await t.http().post('/api/partner-applications');
      expect(none.status).toBe(400);
      expect(none.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      for (const body of [null, 'text', [1], 5, { applicantName: 'JSON' }]) {
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
      clamd.mode = 'error';
      await expectStatus(503, submit());
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
    /**
     * Posts one input value and expects the application to be accepted; returns it. Each call comes after the resubmit
     * window, so it is a new application rather than a repeat of the previous one.
     */
    async function accepted(field: string, value: FormValue, others: Record<string, FormValue> = {}) {
      t.clock.advance(RESUBMIT_WINDOW_MS + 1);
      const res = await submit({ [field]: value, ...others });
      expect(res.status, `${field} = ${JSON.stringify(value)?.slice(0, 40)} should be accepted`).toBe(201);
      return created(res);
    }

    /** Posts one input value and expects a 400 on exactly that input; returns the first error code. */
    async function refused(field: string, value: FormValue, pointer = field, others: Record<string, FormValue> = {}) {
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
      await refused('legalForm', ['tổ chức', 'tổ chức']);
    });

    it('applicantName is 1 to 255 characters, not only spaces, counted in Unicode NFC after trimming', async () => {
      expect((await accepted('applicantName', 'A')).applicantName).toBe('A');
      expect((await accepted('applicantName', 'a'.repeat(255))).applicantName).toHaveLength(255);
      expect(await refused('applicantName', 'a'.repeat(256))).toBe('too_big');
      expect(await refused('applicantName', '')).toBe('too_small');
      expect(await refused('applicantName', '   \t ')).toBe('too_small');
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
      // Surrounding whitespace is dropped before the check and is not stored.
      expect((await accepted('taxCode', ' 0312345678 ')).taxCode).toBe('0312345678');
      expect((await accepted('taxCode', '0312345678123\t')).taxCode).toBe('0312345678123');
      await refused('taxCode', ' ');
    });

    it('salesOnly is "true" or "false" and defaults to false', async () => {
      expect((await accepted('salesOnly', true, { declaredArtists: undefined })).salesOnly).toBe(true);
      expect((await accepted('salesOnly', false)).salesOnly).toBe(false);
      expect((await accepted('salesOnly', undefined)).salesOnly).toBe(false);
      await refused('salesOnly', 'yes');
      await refused('salesOnly', '1');
      await refused('salesOnly', '');
    });

    it('declaredArtists holds 1 to 20 names of 1 to 255 characters each', async () => {
      const names = (count: number) => Array.from({ length: count }, (_, index) => `Nghệ sĩ ${index + 1}`);
      await accepted('declaredArtists', names(1));
      expect((await accepted('declaredArtists', names(20))).declaredArtists).toHaveLength(20);
      expect(await refused('declaredArtists', names(21))).toBe('too_big');
      expect(await refused('declaredArtists', names(21), 'declaredArtists', { salesOnly: true })).toBe('too_big');
      expect(await refused('declaredArtists', [])).toBe('too_small');
      // One form part is a list of one name.
      expect((await accepted('declaredArtists', 'A')).declaredArtists).toEqual(['A']);
      await accepted('declaredArtists', ['n'.repeat(255)]);
      expect(await refused('declaredArtists', ['n'.repeat(256)], 'declaredArtists/0')).toBe('too_big');
      expect(await refused('declaredArtists', ['Hợp lệ', ''], 'declaredArtists/1')).toBe('too_small');
      expect(await refused('declaredArtists', ['   '], 'declaredArtists/0')).toBe('too_small');
      expect((await accepted('declaredArtists', ['  Nghệ sĩ Một  '])).declaredArtists).toEqual(['Nghệ sĩ Một']);
    });

    it('a member the ticket does not list is refused', async () => {
      await refused('plannedArtists', ['Nghệ sĩ Một']);
      await refused('applicantAccountId', '00000000-0000-4000-8000-000000000000');
      await refused('passport', file('ho-chieu.pdf'));
    });
  });

  describe('attached files', () => {
    /** Every refusal of a file leaves nothing behind: no application, no file, no email, no notification. */
    async function expectRefusedWith(
      res: { status: number; body: { code: string; errors: Errors } },
      ...errors: string[]
    ) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(errorsOf(res)).toEqual(errors.sort());
      await expectNothingCreated();
    }

    it('AC-PARTNER-ONBOARDING-22-01 example 1: a 2 MB pdf registration, a 1 MB jpg and a 1 MB png are all stored', async () => {
      const registration = ofSize(PDF, 2 * MB);
      const jpg = ofSize(JPG, MB);
      const png = ofSize(PNG, MB);
      const res = await expectStatus(
        201,
        submit({
          businessRegistration: file('gpkd.pdf', registration),
          otherDocuments: [file('anh.jpg', jpg), file('anh.png', png)],
        }),
      );
      expect(created(res).status).toBe('SUBMITTED');
      const stored = await filesOf(created(res).id);
      expect(stored.map((row) => [row.fileName, row.contentType, row.sizeBytes]).sort()).toEqual(
        [
          ['anh.jpg', 'image/jpeg', MB],
          ['anh.png', 'image/png', MB],
          ['gpkd.pdf', 'application/pdf', 2 * MB],
        ].sort(),
      );
      expect(Buffer.from(one(stored.filter((row) => row.fileName === 'gpkd.pdf')).content).equals(registration)).toBe(
        true,
      );
      expect(clamd.scanned).toHaveLength(3);
    });

    it('AC-PARTNER-ONBOARDING-22-01 example 2: a registration of exactly 10 MB, a 1 MB jpg and a 1 MB png are all stored', async () => {
      const registration = ofSize(PDF, 10 * MB);
      const res = await expectStatus(
        201,
        submit({
          businessRegistration: file('gpkd.pdf', registration),
          otherDocuments: [file('anh.jpg', ofSize(JPG, MB)), file('anh.png', ofSize(PNG, MB))],
        }),
      );
      expect(created(res).status).toBe('SUBMITTED');
      const stored = await filesOf(created(res).id);
      expect(stored).toHaveLength(3);
      const storedRegistration = one(stored.filter((row) => row.kind === 'BUSINESS_REGISTRATION'));
      expect(storedRegistration.sizeBytes).toBe(10 * MB);
      expect(Buffer.from(storedRegistration.content).equals(registration)).toBe(true);
    }, 30_000);

    it('AC-PARTNER-ONBOARDING-22-02 four valid clean pdf files, registration included, are refused for the file count', async () => {
      const res = await submit({
        businessRegistration: file('gpkd.pdf'),
        otherDocuments: [file('a.pdf'), file('b.pdf'), file('c.pdf')],
      });
      await expectRefusedWith(res, '/body/otherDocuments too_big');
      expect(clamd.scanned).toHaveLength(0);
    });

    it('AC-PARTNER-ONBOARDING-22-03 example 1: a Word file named .docx is refused for its format', async () => {
      const res = await submit({ otherDocuments: [file('hop-dong.docx', DOCX)] });
      await expectRefusedWith(res, '/body/otherDocuments/0 invalid_format');
    });

    it('AC-PARTNER-ONBOARDING-22-03 example 2: a Word file renamed to .pdf is refused for its format', async () => {
      const res = await submit({ otherDocuments: [file('hop-dong.pdf', DOCX)] });
      await expectRefusedWith(res, '/body/otherDocuments/0 invalid_format');
    });

    it('AC-PARTNER-ONBOARDING-22-03 example 3: a program renamed from .exe to .pdf is refused for its format', async () => {
      const res = await submit({ businessRegistration: file('gpkd.pdf', EXE) });
      await expectRefusedWith(res, '/body/businessRegistration/0 invalid_format');
    });

    describe('malware scan', () => {
      async function expectScanRefusal(
        res: { status: number; body: { code: string; errors: Errors } },
        status: number,
        code: string,
        ...errors: string[]
      ) {
        expect(res.status).toBe(status);
        expect(res.body.code).toBe(code);
        expect(errorsOf(res)).toEqual(errors.sort());
        await expectNothingCreated();
      }

      it('AC-PARTNER-ONBOARDING-22-06 example 1: an infected pdf is refused as infected and nothing is stored', async () => {
        const infected = Buffer.concat([PDF, Buffer.from(EICAR)]);
        const res = await submit({ otherDocuments: [file('sach.pdf'), file('nhiem.pdf', infected)] });
        await expectScanRefusal(res, 422, 'PARTNER_APPLICATION_FILE_INFECTED', '/body/otherDocuments/1 infected');
        expect(clamd.scanned).toHaveLength(3);
      });

      it('AC-PARTNER-ONBOARDING-22-06 example 2: a scan that fails is refused as not scanned, to retry later', async () => {
        clamd.mode = 'error';
        const res = await submit();
        await expectScanRefusal(
          res,
          503,
          'PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE',
          '/body/businessRegistration/0 not_scanned',
        );
      });

      it('AC-PARTNER-ONBOARDING-22-06 example 3: a scan without reply is refused as not scanned, to retry later', async () => {
        clamd.mode = 'silent';
        const res = await submit({ otherDocuments: [file('phu-luc.png', PNG)] });
        await expectScanRefusal(
          res,
          503,
          'PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE',
          '/body/businessRegistration/0 not_scanned',
          '/body/otherDocuments/0 not_scanned',
        );
      });

      it('a scanner that drops the connection or cannot be reached gives no verdict, so nothing is accepted', async () => {
        clamd.mode = 'hangup';
        const dropped = await submit();
        expect(dropped.status).toBe(503);
        expect(dropped.body.code).toBe('PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE');
        await expectNothingCreated();

        const unreachable = await createTestApp({
          override: (builder) =>
            builder
              .overrideProvider(MalwareScanner)
              .useValue(new MalwareScanner({ host: '127.0.0.1', port: 1, timeoutMs: 1000 })),
        });
        try {
          const res = await unreachable
            .http()
            .post('/api/partner-applications')
            .field('legalForm', 'tổ chức')
            .field('applicantName', 'A')
            .field('contactEmail', 'a@b.c')
            .field('legalName', 'C')
            .field('taxCode', '0312345678')
            .field('salesOnly', 'true')
            .attach('businessRegistration', PDF, { filename: 'gpkd.pdf' });
          expect(res.status).toBe(503);
          expect(res.body.code).toBe('PARTNER_APPLICATION_FILE_SCAN_UNAVAILABLE');
          expect(await unreachable.db.select().from(partnerApplications)).toHaveLength(0);
        } finally {
          await unreachable.close();
        }
      });
    });

    it('AC-PARTNER-ONBOARDING-22-08 any clean png as business registration is stored like every other file, unclassified', async () => {
      const photo = ofSize(PNG, 2048);
      const res = await expectStatus(
        201,
        submit({
          businessRegistration: file('anh-phong-canh.png', photo),
          otherDocuments: [file('anh-phong-canh.png', photo)],
        }),
      );
      const stored = await filesOf(created(res).id);
      // The two copies differ only by the input the applicant put them in; nothing tells what the picture shows.
      const [asRegistration, asOther] = [
        one(stored.filter((row) => row.kind === 'BUSINESS_REGISTRATION')),
        one(stored.filter((row) => row.kind === 'OTHER')),
      ];
      const sameApartFromInput = (row: typeof asRegistration) => ({ ...row, id: undefined, kind: undefined });
      expect(sameApartFromInput(asRegistration)).toEqual(sameApartFromInput(asOther));
      expect(asRegistration).toMatchObject({
        fileName: 'anh-phong-canh.png',
        contentType: 'image/png',
        sizeBytes: 2048,
      });
      expect(Buffer.from(asRegistration.content).equals(photo)).toBe(true);
    });

    it('AC-PARTNER-ONBOARDING-22-09 a clean pdf one byte over 10 MB is refused for its size', async () => {
      const res = await submit({ businessRegistration: file('gpkd.pdf', ofSize(PDF, 10 * MB + 1)) });
      await expectRefusedWith(res, '/body/businessRegistration/0 too_big');
      expect(clamd.scanned).toHaveLength(0);
    }, 30_000);

    it('AC-PARTNER-ONBOARDING-22-10 four files with a 15 MB gif report too many files, its format and its size at once', async () => {
      const res = await submit({
        businessRegistration: file('gpkd.pdf'),
        otherDocuments: [file('a.pdf'), file('b.pdf'), file('anh-dong.gif', ofSize(GIF, 15 * MB))],
      });
      await expectRefusedWith(
        res,
        '/body/otherDocuments too_big',
        '/body/otherDocuments/2 invalid_format',
        '/body/otherDocuments/2 too_big',
      );
    }, 30_000);

    it('file errors and other wrong inputs are reported together', async () => {
      const res = await submit({
        taxCode: '123',
        businessRegistration: [file('a.pdf'), file('b.pdf')],
        otherDocuments: [file('anh.gif', GIF)],
      });
      await expectRefusedWith(
        res,
        '/body/taxCode invalid_format',
        '/body/businessRegistration too_big',
        '/body/otherDocuments/0 invalid_format',
      );
    });

    it('businessRegistration is exactly one pdf, jpg or png file of at most 10 MB', async () => {
      for (const [name, content] of [
        ['gpkd.pdf', PDF],
        ['gpkd.jpg', JPG],
        ['gpkd.jpeg', JPG],
        ['GPKD.PNG', PNG],
      ] as const) {
        expect((await submit({ businessRegistration: file(name, content) })).status, name).toBe(201);
      }
      await t.reset();
      await expectRefusedWith(
        await submit({ businessRegistration: [file('a.pdf'), file('b.pdf')] }),
        '/body/businessRegistration too_big',
      );
      await expectRefusedWith(
        await submit({ businessRegistration: file('gpkd.txt', Buffer.from('plain text')) }),
        '/body/businessRegistration/0 invalid_format',
      );
      await expectRefusedWith(
        await submit({ businessRegistration: file('gpkd.gif', GIF) }),
        '/body/businessRegistration/0 invalid_format',
      );
      // An empty file has no content of an accepted type.
      await expectRefusedWith(
        await submit({ businessRegistration: file('rong.pdf', Buffer.alloc(0)) }),
        '/body/businessRegistration/0 invalid_format',
      );
      // Text in place of the file.
      await expectRefusedWith(
        await submit({ businessRegistration: 'gpkd.pdf' }),
        '/body/businessRegistration invalid_type',
      );
      // A body that is not a form can still carry an empty list where the file belongs.
      await expectRefusedWith(
        await t.http().post('/api/partner-applications').send({
          legalForm: 'tổ chức',
          applicantName: 'Nguyễn Văn A',
          contactEmail: 'a@x.com',
          legalName: 'Công ty TNHH ABC',
          taxCode: '0312345678',
          salesOnly: 'true',
          businessRegistration: [],
        }),
        '/body/businessRegistration too_small',
      );
    });

    it('otherDocuments takes none, one or two files of at most 10 MB each and refuses a third', async () => {
      expect((await submit({ otherDocuments: undefined })).status).toBe(201);
      expect((await submit({ otherDocuments: [file('a.pdf')] })).status).toBe(201);
      t.clock.advance(RESUBMIT_WINDOW_MS + 1);
      const two = await expectStatus(
        201,
        submit({ otherDocuments: [file('a.pdf', ofSize(PDF, 10 * MB)), file('b.png', PNG)] }),
      );
      expect((await filesOf(created(two).id)).map((row) => row.sizeBytes).sort((a, b) => a - b)).toEqual([
        PNG.length,
        PDF.length,
        10 * MB,
      ]);
      await t.reset();

      await expectRefusedWith(
        await submit({ otherDocuments: [file('a.pdf'), file('b.pdf'), file('c.pdf')] }),
        '/body/otherDocuments too_big',
      );
      await expectRefusedWith(
        await submit({ otherDocuments: [file('a.pdf'), file('b.pdf', ofSize(PDF, 10 * MB + 1))] }),
        '/body/otherDocuments/1 too_big',
      );
      await expectRefusedWith(
        await submit({ otherDocuments: [file('a.exe', EXE)] }),
        '/body/otherDocuments/0 invalid_format',
      );
      await expectRefusedWith(await submit({ otherDocuments: 'a.pdf' }), '/body/otherDocuments invalid_type');
    }, 30_000);

    it('takes the type from the content whatever the name, and keeps a Vietnamese file name intact', async () => {
      const res = await expectStatus(
        201,
        submit({ businessRegistration: file('Giấy đăng ký kinh doanh.png', PDF), otherDocuments: [file('anh', JPG)] }),
      );
      const stored = await filesOf(created(res).id);
      expect(stored.map((row) => [row.fileName, row.contentType]).sort()).toEqual(
        [
          ['Giấy đăng ký kinh doanh.png', 'application/pdf'],
          ['anh', 'image/jpeg'],
        ].sort(),
      );
      expect(Buffer.from(one(stored.filter((row) => row.fileName === 'anh')).content).equals(JPG)).toBe(true);
    });

    it('a form with far more files than any application has is cut off with 400', async () => {
      const res = await submit({ otherDocuments: Array.from({ length: 11 }, (_, index) => file(`${index}.pdf`)) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
      await expectNothingCreated();
    });
  });
});
