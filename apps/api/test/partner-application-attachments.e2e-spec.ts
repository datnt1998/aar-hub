import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { attachments, partnerApplications } from '../src/db/schema.js';
import { MalwareScanner } from '../src/malware-scan/malware-scanner.js';
import { PartnerApplicationSchema } from '../src/partner-applications/partner-applications.schemas.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';
import { type FakeClamd, startFakeClamd } from './support/fake-clamd.js';

const PDF = Buffer.from('%PDF-1.4 giay dang ky kinh doanh');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('ho so khac')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('ho so khac')]);

describe('partner application attachments (open)', () => {
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
  });

  /**
   * An organization application submitted without logging in, with every file input used: one business registration
   * and two other documents, all scanned clean and stored. Returns the application and its stored files.
   */
  async function submittedOrganizationWithFiles() {
    const res = await t
      .http()
      .post('/api/partner-applications')
      .field('legalForm', 'tổ chức')
      .field('applicantName', 'Trần Thị Bích')
      .field('contactEmail', 'b@y.com')
      .field('legalName', 'Công ty TNHH Âm Nhạc Sao')
      .field('taxCode', '0312345678')
      .field('salesOnly', 'false')
      .field('declaredArtists', 'Nghệ sĩ Một')
      .attach('businessRegistration', PDF, { filename: 'gpkd.pdf' })
      .attach('otherDocuments', PNG, { filename: 'ho-so-1.png' })
      .attach('otherDocuments', JPG, { filename: 'ho-so-2.jpg' })
      .expect(201);
    const application = PartnerApplicationSchema.parse(res.body);
    const files = await t.db
      .select()
      .from(attachments)
      .where(eq(attachments.applicationId, application.id))
      .orderBy(asc(attachments.fileName));
    expect(files.map((f) => f.kind).sort()).toEqual(['BUSINESS_REGISTRATION', 'OTHER', 'OTHER']);
    return { application, files };
  }

  /** Everything opening a file could touch: the applications and their stored files, contents included. */
  async function state() {
    return {
      applications: await t.db.select().from(partnerApplications).orderBy(asc(partnerApplications.id)),
      files: await t.db.select().from(attachments).orderBy(asc(attachments.id)),
    };
  }

  const open = (applicationId: string, attachmentId: string) =>
    t.http().get(`/api/partner-applications/${applicationId}/attachments/${attachmentId}`);

  /** The caller was told they may not open the file, and got none of its content. */
  function expectForbidden(res: { status: number; headers: Record<string, string>; body: unknown; text: string }) {
    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ code: 'PARTNER_APPLICATION_ATTACHMENT_FORBIDDEN' });
    for (const content of [PDF, PNG, JPG]) {
      expect(res.text).not.toContain(content.toString('latin1'));
    }
  }

  it('AC-PARTNER-ONBOARDING-24-03 the applicant who submitted without logging in cannot open any stored file of the application, which stays unchanged', async () => {
    const { application, files } = await submittedOrganizationWithFiles();
    const before = await state();

    for (const stored of files) {
      expectForbidden(await open(application.id, stored.id));
    }

    expect(await state()).toEqual(before);
    expect(one(await t.db.select().from(partnerApplications)).status).toBe('SUBMITTED');
  });

  describe('file to open (fileChoice): required reference to a file of the application', () => {
    it('a file that is not stored, or belongs to another application, is refused the same way, without telling which', async () => {
      const first = await submittedOrganizationWithFiles();
      const before = await state();
      const stored = one(first.files);

      expectForbidden(await open(first.application.id, randomUUID()));
      expectForbidden(await open(randomUUID(), stored.id));
      expectForbidden(await open(randomUUID(), randomUUID()));

      expect(await state()).toEqual(before);
    });

    it('a file or application id that is not a UUID is refused at that id', async () => {
      const { application, files } = await submittedOrganizationWithFiles();
      const stored = one(files);

      const badFile = await open(application.id, 'gpkd.pdf').expect(400);
      expect(badFile.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ pointer: '/path/attachmentId', code: 'invalid_format' }],
      });

      const badApplication = await open('123', stored.id).expect(400);
      expect(badApplication.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ pointer: '/path/id', code: 'invalid_format' }],
      });
    });

    it('no file chosen: there is no such address', async () => {
      const { application } = await submittedOrganizationWithFiles();

      const res = await t.http().get(`/api/partner-applications/${application.id}/attachments/`).expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});

/** The first row of a query that must have returned at least one. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) {
    throw new Error('expected a row');
  }
  return row;
}
