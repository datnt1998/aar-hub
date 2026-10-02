import { accounts, attachments, emailOutbox, notifications, partnerApplications } from '../src/db/schema.js';
import { MalwareScanner } from '../src/malware-scan/malware-scanner.js';
import { RESUBMIT_WINDOW_MS } from '../src/partner-applications/partner-applications.js';
import {
  IndividualPartnerApplicationSchema,
  PartnerApplicationSchema,
} from '../src/partner-applications/partner-applications.schemas.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';
import { type FakeClamd, startFakeClamd } from './support/fake-clamd.js';

const PDF = Buffer.from('%PDF-1.4 demo');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('demo')]);
const SECONDS = 1000;

/** A form value: text, repeated text, a boolean sent as "true"/"false", or a file. */
type FormValue = string | string[] | boolean | { filename: string; content: Buffer };

describe('partner applications: resubmitting within 1 minute', () => {
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

  /** Sends the form as multipart/form-data, in one request with its files. */
  const post = (path: string, form: Record<string, FormValue>) => {
    let req = t.http().post(path);
    for (const [name, value] of Object.entries(form)) {
      for (const part of Array.isArray(value) ? value : [value]) {
        req =
          typeof part === 'object'
            ? req.attach(name, part.content, { filename: part.filename })
            : req.field(name, String(part));
      }
    }
    return req;
  };

  const submitOrganization = (overrides: Record<string, FormValue> = {}) =>
    post('/api/partner-applications', {
      legalForm: 'tổ chức',
      applicantName: 'Trần Thị Bích',
      contactEmail: 'b@y.com',
      legalName: 'Công ty A',
      taxCode: '0312345678',
      businessRegistration: { filename: 'gpkd.pdf', content: PDF },
      salesOnly: false,
      declaredArtists: ['Nghệ sĩ Một'],
      ...overrides,
    });

  const submitIndividual = (overrides: Record<string, FormValue> = {}) =>
    post('/api/partner-applications/individual', {
      legalForm: 'cá nhân',
      applicantName: 'Trần Thị Bích',
      contactEmail: 'b@y.com',
      legalName: 'Nguyễn Văn An',
      citizenId: '079123456789',
      citizenIdImage: { filename: 'cccd.jpg', content: JPG },
      salesOnly: false,
      declaredArtists: ['Nghệ sĩ Một'],
      ...overrides,
    });

  /** Awaits a response and checks it is 201; returns its body. */
  async function accepted(response: PromiseLike<{ status: number; body: unknown }>): Promise<unknown> {
    const res = await response;
    expect(res.status).toBe(201);
    return res.body;
  }

  const submittedApplications = async () =>
    (await t.db.select().from(partnerApplications)).filter((row) => row.status === 'SUBMITTED');

  const confirmationEmails = async () =>
    (await t.db.select().from(emailOutbox)).filter((email) => email.kind === 'APPLICATION_RECEIVED');

  it('AC-PARTNER-ONBOARDING-26-01 an organization application sent again 20 seconds later creates nothing and shows the application received', async () => {
    const first = PartnerApplicationSchema.parse(await accepted(submitOrganization()));
    t.clock.advance(20 * SECONDS);

    const second = PartnerApplicationSchema.parse(await accepted(submitOrganization()));

    expect(second).toEqual(first);
    expect(second.status).toBe('SUBMITTED');
    expect((await submittedApplications()).map((row) => row.id)).toEqual([first.id]);
  });

  it('AC-PARTNER-ONBOARDING-26-02 an individual application sent again 20 seconds later creates nothing and shows the application received', async () => {
    const first = IndividualPartnerApplicationSchema.parse(await accepted(submitIndividual()));
    t.clock.advance(20 * SECONDS);

    const second = IndividualPartnerApplicationSchema.parse(await accepted(submitIndividual()));

    expect(second).toEqual(first);
    expect(second.status).toBe('SUBMITTED');
    expect((await submittedApplications()).map((row) => row.id)).toEqual([first.id]);
  });

  it('AC-PARTNER-ONBOARDING-26-03 an application sent again 20 seconds later sends no further confirmation email', async () => {
    await t.db.insert(accounts).values({ email: 'admin@aar.vn', isPlatformAdmin: true });
    await accepted(submitOrganization());
    expect((await confirmationEmails()).map((email) => email.toEmail)).toEqual(['b@y.com']);
    const emailsAfterFirst = await t.db.select().from(emailOutbox);
    const notificationsAfterFirst = await t.db.select().from(notifications);
    t.clock.advance(20 * SECONDS);

    await accepted(submitOrganization());

    expect((await confirmationEmails()).map((email) => email.toEmail)).toEqual(['b@y.com']);
    expect(await t.db.select().from(emailOutbox)).toEqual(emailsAfterFirst);
    expect(await t.db.select().from(notifications)).toEqual(notificationsAfterFirst);
  });

  // The duplicate warning to admins that AC-PARTNER-ONBOARDING-26-04 also asks for has no defined channel or content
  // yet (open question to docs), so this test covers the rest of that AC and does not carry its code.
  it('the same organization application 2 minutes later is a new SUBMITTED application, announced to admins like any other', async () => {
    const [admin] = await t.db
      .insert(accounts)
      .values({ email: 'admin@aar.vn', isPlatformAdmin: true })
      .returning({ id: accounts.id });
    const first = PartnerApplicationSchema.parse(await accepted(submitOrganization()));
    t.clock.advance(2 * 60 * SECONDS);

    const second = PartnerApplicationSchema.parse(await accepted(submitOrganization()));

    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({
      status: 'SUBMITTED',
      taxCode: '0312345678',
      submittedAt: t.clock.now().toISOString(),
    });
    const submitted = await submittedApplications();
    expect(submitted.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
    expect(submitted.map((row) => row.taxCode)).toEqual(['0312345678', '0312345678']);
    // The admin gets the usual new-application notification for the second application, nothing more.
    const forAdmin = (await t.db.select().from(notifications)).filter((row) => row.applicationId === second.id);
    expect(forAdmin.map((row) => [row.accountId, row.kind])).toEqual([[admin?.id, 'APPLICATION_NEW_FOR_ADMIN']]);
    expect((await confirmationEmails()).map((email) => email.applicationId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it('AC-PARTNER-ONBOARDING-26-05 the same tax code with another contact email 20 seconds later is a separate application', async () => {
    const first = PartnerApplicationSchema.parse(await accepted(submitOrganization()));
    t.clock.advance(20 * SECONDS);

    const second = PartnerApplicationSchema.parse(await accepted(submitOrganization({ contactEmail: 'c@y.com' })));

    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ status: 'SUBMITTED', contactEmail: 'c@y.com', taxCode: '0312345678' });
    expect((await submittedApplications()).map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
    expect((await confirmationEmails()).map((email) => email.toEmail).sort()).toEqual(['b@y.com', 'c@y.com']);
  });

  it('AC-PARTNER-ONBOARDING-26-06 two identical organization applications arriving together, the second before the first is stored, make one application and one confirmation email', async () => {
    const server = t.app.getHttpServer();
    let arrived = 0;
    const countRequest = () => {
      arrived += 1;
    };
    server.on('request', countRequest);
    try {
      clamd.mode = 'hold';
      const first = Promise.resolve(submitOrganization());
      await vi.waitFor(() => expect(clamd.scanned).toHaveLength(1));
      const second = Promise.resolve(submitOrganization());
      await vi.waitFor(() => expect(arrived).toBe(2));
      // From here a scan of the second submission would fail: it must take the first one's outcome instead.
      clamd.mode = 'error';
      clamd.release();

      const [firstBody, secondBody] = await Promise.all([accepted(first), accepted(second)]);

      const application = PartnerApplicationSchema.parse(firstBody);
      expect(PartnerApplicationSchema.parse(secondBody)).toEqual(application);
      expect(application.status).toBe('SUBMITTED');
      expect(clamd.scanned).toHaveLength(1);
      expect((await submittedApplications()).map((row) => row.id)).toEqual([application.id]);
      expect((await confirmationEmails()).map((email) => [email.toEmail, email.applicationId])).toEqual([
        ['b@y.com', application.id],
      ]);
    } finally {
      server.off('request', countRequest);
    }
  });

  it('AC-PARTNER-ONBOARDING-26-07 the same tax code and email with another legal name 20 seconds later is a repeat that keeps the first legal name', async () => {
    const first = PartnerApplicationSchema.parse(await accepted(submitOrganization({ legalName: 'Công ty A' })));
    t.clock.advance(20 * SECONDS);

    const second = PartnerApplicationSchema.parse(
      await accepted(submitOrganization({ legalName: 'Công ty A Việt Nam' })),
    );

    expect(second).toEqual(first);
    expect(second.legalName).toBe('Công ty A');
    const submitted = await submittedApplications();
    expect(submitted.map((row) => [row.id, row.legalName])).toEqual([[first.id, 'Công ty A']]);
  });

  it('the window is 1 minute counted from the first acceptance, bounds included', async () => {
    const first = PartnerApplicationSchema.parse(await accepted(submitOrganization()));
    t.clock.advance(RESUBMIT_WINDOW_MS);
    expect(PartnerApplicationSchema.parse(await accepted(submitOrganization())).id).toBe(first.id);

    t.clock.advance(1);
    const later = PartnerApplicationSchema.parse(await accepted(submitOrganization()));
    expect(later.id).not.toBe(first.id);

    // A repeat of the newer application is counted from that one.
    t.clock.advance(RESUBMIT_WINDOW_MS);
    expect(PartnerApplicationSchema.parse(await accepted(submitOrganization())).id).toBe(later.id);
    expect(await submittedApplications()).toHaveLength(2);
  });

  it('the contact email matches regardless of case and shows the email of the first submission', async () => {
    const first = PartnerApplicationSchema.parse(await accepted(submitOrganization({ contactEmail: 'b@y.com' })));
    t.clock.advance(20 * SECONDS);

    const second = PartnerApplicationSchema.parse(await accepted(submitOrganization({ contactEmail: 'B@Y.com' })));

    expect(second).toEqual(first);
    expect(await submittedApplications()).toHaveLength(1);
  });

  it('a repeat needs the same legal form and identifier: another tax code or an individual application is separate', async () => {
    const first = PartnerApplicationSchema.parse(await accepted(submitOrganization()));
    t.clock.advance(20 * SECONDS);

    const otherTaxCode = PartnerApplicationSchema.parse(await accepted(submitOrganization({ taxCode: '0312345679' })));
    const individual = IndividualPartnerApplicationSchema.parse(await accepted(submitIndividual()));

    expect(new Set([first.id, otherTaxCode.id, individual.id]).size).toBe(3);
    expect(await submittedApplications()).toHaveLength(3);
  });

  it('a repeat is not scanned and stores no file, even when its files differ', async () => {
    await accepted(submitOrganization());
    t.clock.advance(20 * SECONDS);
    clamd.scanned = [];
    clamd.mode = 'error';

    await accepted(submitOrganization({ businessRegistration: { filename: 'khac.pdf', content: PDF } }));
    expect((await t.db.select().from(attachments)).map((row) => row.fileName)).toEqual(['gpkd.pdf']);

    expect(clamd.scanned).toHaveLength(0);
  });

  it('a refused first submission does not count: the identical valid one right after is a new application', async () => {
    clamd.mode = 'error';
    expect((await submitOrganization()).status).toBe(503);
    clamd.mode = 'scan';

    const application = PartnerApplicationSchema.parse(await accepted(submitOrganization()));

    expect((await submittedApplications()).map((row) => row.id)).toEqual([application.id]);
  });
});
