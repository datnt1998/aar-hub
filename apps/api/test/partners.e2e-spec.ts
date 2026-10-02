import { count, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema.js';
import { type ApplicationStatus, partnerApplications, partners, type PartnerStatus } from '../src/db/schema.js';
import { PartnerDuplicateCheckSchema } from '../src/partners/partners.schemas.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const TAX_CODE = '0312345678';
const CITIZEN_ID = '079123456789';

/** 09:00 on 2 October 2026 in Vietnam. */
const NOW = new Date('2026-10-02T02:00:00.000Z');

describe('preparing a direct partner creation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.reset();
    t.clock.set(NOW);
  });

  const organization = (overrides: Record<string, unknown> = {}) => ({
    legalForm: 'tổ chức',
    taxCode: TAX_CODE,
    legalName: 'Công ty TNHH Âm Nhạc Sao',
    contractNumber: 'HĐ-2026/015',
    contractDate: '2026-09-30',
    invitedEmail: 'owner@sao.vn',
    ...overrides,
  });

  const individual = (overrides: Record<string, unknown> = {}) => ({
    legalForm: 'cá nhân',
    citizenId: CITIZEN_ID,
    legalName: 'Nguyễn Văn An',
    contractNumber: 'HĐ-2026/016',
    contractDate: '2026-09-30',
    invitedEmail: 'an@example.com',
    ...overrides,
  });

  const checkDraft = (body: unknown) =>
    t
      .http()
      .post('/api/partners/direct-creation-checks')
      .send(body as object);
  const checkIdentity = (body: unknown) =>
    t
      .http()
      .post('/api/partners/duplicate-checks')
      .send(body as object);

  /** The duplicate warning in a 200 response, checked against the published response schema. */
  function warning(res: { status: number; body: unknown }) {
    expect(res.status).toBe(200);
    return PartnerDuplicateCheckSchema.parse(res.body);
  }

  async function seedPartner(status: PartnerStatus, identity: { taxCode?: string; citizenId?: string }) {
    const [row] = await t.db
      .insert(partners)
      .values({ legalName: 'Đối tác có sẵn', status, ...identity })
      .returning({ id: partners.id });
    return row?.id;
  }

  async function seedApplication(status: ApplicationStatus, identity: { taxCode: string; citizenId?: string }) {
    const [row] = await t.db
      .insert(partnerApplications)
      .values({
        legalForm: identity.citizenId ? 'cá nhân' : 'tổ chức',
        status,
        applicantName: 'Người nộp đơn',
        contactEmail: 'nop@example.com',
        legalName: 'Pháp nhân đã nộp đơn',
        salesOnly: true,
        declaredArtists: [],
        ...identity,
      })
      .returning({ id: partnerApplications.id });
    return row?.id;
  }

  /** Row count of every table in the schema: what a request may have stored anywhere. */
  async function rowCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const exports: unknown[] = Object.values(schema);
    for (const table of exports.filter((value): value is PgTable => is(value, PgTable))) {
      const [row] = await t.db.select({ rows: count() }).from(table);
      counts[getTableName(table)] = row?.rows ?? -1;
    }
    return counts;
  }

  it('AC-PARTNER-ONBOARDING-15-02 admin sees the duplicate warning for an ACTIVE partner, cancels, and no partner or Owner invitation is created', async () => {
    const active = await seedPartner('ACTIVE', { taxCode: TAX_CODE });
    const before = await rowCounts();

    // The admin types tax code X, then fills the rest of the screen: both checks warn and forbid confirming.
    const early = warning(await checkIdentity({ legalForm: 'tổ chức', taxCode: TAX_CODE }));
    expect(early).toEqual({ partners: [{ id: active, status: 'ACTIVE' }], applications: [], canConfirm: false });
    expect(warning(await checkDraft(organization()))).toEqual(early);

    // Cancelling calls nothing more. Nothing was stored by the checks: no partner, no Owner invitation, no email.
    const after = await rowCounts();
    expect(after).toEqual(before);
    expect(after.partners).toBe(1);
    expect(after.email_outbox).toBe(0);
    expect(after.notifications).toBe(0);
  });

  describe('duplicate legal entity (BR-PARTNER-ONBOARDING-019)', () => {
    it('no partner or application with the identity: no warning, creation can be confirmed', async () => {
      await seedPartner('ACTIVE', { taxCode: '0399999999' });
      await seedApplication('SUBMITTED', { taxCode: '0399999999' });
      const expected = { partners: [], applications: [], canConfirm: true };
      expect(warning(await checkDraft(organization()))).toEqual(expected);
      expect(warning(await checkDraft(individual()))).toEqual(expected);
    });

    it('a partner that is not terminated blocks confirming, whatever its status', async () => {
      for (const status of ['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED'] as const) {
        await t.reset();
        const id = await seedPartner(status, { taxCode: TAX_CODE });
        expect(warning(await checkDraft(organization())), status).toEqual({
          partners: [{ id, status }],
          applications: [],
          canConfirm: false,
        });
      }
    });

    it('an open application blocks confirming; a decided one is no duplicate', async () => {
      for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'] as const) {
        await t.reset();
        const id = await seedApplication(status, { taxCode: TAX_CODE });
        expect(warning(await checkDraft(organization())), status).toEqual({
          partners: [],
          applications: [{ id, status }],
          canConfirm: false,
        });
      }
      for (const status of ['APPROVED', 'REJECTED'] as const) {
        await t.reset();
        await seedApplication(status, { taxCode: TAX_CODE });
        expect(warning(await checkDraft(organization())), status).toEqual({
          partners: [],
          applications: [],
          canConfirm: true,
        });
      }
    });

    it('a TERMINATED partner only is a warning with its old status that still lets the admin confirm', async () => {
      const first = await seedPartner('TERMINATED', { taxCode: TAX_CODE });
      const second = await seedPartner('TERMINATED', { taxCode: TAX_CODE });
      const result = warning(await checkDraft(organization()));
      expect(result.partners).toHaveLength(2);
      expect(result.partners).toEqual(
        expect.arrayContaining([
          { id: first, status: 'TERMINATED' },
          { id: second, status: 'TERMINATED' },
        ]),
      );
      expect(result).toMatchObject({ applications: [], canConfirm: true });
    });

    it('a TERMINATED partner next to a live one or an open application still blocks, and every match is listed', async () => {
      await seedPartner('TERMINATED', { taxCode: TAX_CODE });
      await seedPartner('ACTIVE', { taxCode: TAX_CODE });
      await seedApplication('UNDER_REVIEW', { taxCode: TAX_CODE });
      const result = warning(await checkDraft(organization()));
      expect(result.partners.map((partner) => partner.status).sort()).toEqual(['ACTIVE', 'TERMINATED']);
      expect(result.applications.map((application) => application.status)).toEqual(['UNDER_REVIEW']);
      expect(result.canConfirm).toBe(false);
    });

    it('an individual is matched on the citizen id of partners and open applications', async () => {
      const partner = await seedPartner('SUSPENDED', { citizenId: CITIZEN_ID });
      const application = await seedApplication('NEEDS_INFO', { taxCode: '0388888888', citizenId: CITIZEN_ID });
      await seedPartner('ACTIVE', { citizenId: '079000000000' });
      expect(warning(await checkDraft(individual()))).toEqual({
        partners: [{ id: partner, status: 'SUSPENDED' }],
        applications: [{ id: application, status: 'NEEDS_INFO' }],
        canConfirm: false,
      });
      // The organization check reads tax codes only: the same partners are no duplicate of a tax code.
      expect(warning(await checkDraft(organization({ taxCode: '0388888888' })))).toMatchObject({
        partners: [],
        canConfirm: false,
      });
    });

    it('the identity is matched after surrounding spaces are dropped', async () => {
      await seedPartner('ACTIVE', { taxCode: TAX_CODE });
      await seedPartner('ACTIVE', { citizenId: CITIZEN_ID });
      expect(warning(await checkIdentity({ legalForm: 'tổ chức', taxCode: ` ${TAX_CODE}\t` })).canConfirm).toBe(false);
      expect(warning(await checkIdentity({ legalForm: 'cá nhân', citizenId: ` ${CITIZEN_ID} ` })).canConfirm).toBe(
        false,
      );
    });

    it('the identity check gives the same answer as the full check', async () => {
      await seedPartner('TERMINATED', { citizenId: CITIZEN_ID });
      await seedApplication('SUBMITTED', { taxCode: TAX_CODE });
      expect(warning(await checkIdentity({ legalForm: 'cá nhân', citizenId: CITIZEN_ID }))).toEqual(
        warning(await checkDraft(individual())),
      );
      expect(warning(await checkIdentity({ legalForm: 'tổ chức', taxCode: TAX_CODE }))).toEqual(
        warning(await checkDraft(organization())),
      );
    });
  });

  describe('input limits', () => {
    type Errors = { status: number; body: { code: string; errors: { pointer: string; code: string }[] } };

    /** A 400 VALIDATION_FAILED on exactly these inputs; returns the code of the first error. */
    function expectInvalid(res: Errors, ...fields: string[]) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors.map((error) => error.pointer).sort()).toEqual(
        fields.map((field) => `/body/${field}`).sort(),
      );
      return res.body.errors[0]?.code;
    }

    const draftOf = (form: 'tổ chức' | 'cá nhân', field: string, value: unknown) =>
      form === 'tổ chức' ? organization({ [field]: value }) : individual({ [field]: value });

    async function accepted(field: string, value: unknown, form: 'tổ chức' | 'cá nhân' = 'tổ chức') {
      const res = await checkDraft(draftOf(form, field, value));
      expect(res.status, `${field} = ${JSON.stringify(value)?.slice(0, 40)} should be accepted`).toBe(200);
    }

    async function refused(field: string, value: unknown, form: 'tổ chức' | 'cá nhân' = 'tổ chức') {
      const res = (await checkDraft(draftOf(form, field, value))) as unknown as Errors;
      expect(res.status, `${field} = ${JSON.stringify(value)?.slice(0, 40)} should be refused`).toBe(400);
      return expectInvalid(res, field);
    }

    it('legalForm is required and is tổ chức or cá nhân', async () => {
      await accepted('legalForm', 'tổ chức');
      expect((await checkDraft(individual())).status).toBe(200);
      for (const bad of [undefined, '', 'ORGANIZATION', 'to chuc', 'Tổ chức', 1]) {
        await refused('legalForm', bad);
      }
      expectInvalid(await checkIdentity({ taxCode: TAX_CODE }), 'legalForm');
    });

    it('legalName is 1 to 255 characters, not only spaces, counted in Unicode NFC after trimming', async () => {
      for (const form of ['tổ chức', 'cá nhân'] as const) {
        await accepted('legalName', 'A', form);
        await accepted('legalName', 'a'.repeat(255), form);
        expect(await refused('legalName', 'a'.repeat(256), form)).toBe('too_big');
        expect(await refused('legalName', '', form)).toBe('too_small');
        expect(await refused('legalName', '  \t ', form)).toBe('too_small');
        expect(await refused('legalName', undefined, form)).toBe('invalid_type');
      }
      await accepted('legalName', 'e\u0301'.repeat(255));
      await refused('legalName', 'e\u0301'.repeat(256));
      await accepted('legalName', '😀'.repeat(255));
      await refused('legalName', '😀'.repeat(256));
      await accepted('legalName', `  ${'b'.repeat(255)}  `);
    });

    it('taxCode is required for tổ chức: exactly 10 or 13 digits, no hyphen, no space', async () => {
      await accepted('taxCode', '0312345678');
      await accepted('taxCode', '0312345678123');
      await accepted('taxCode', ' 0312345678 ');
      for (const bad of ['031234567', '03123456781', '031234567812']) {
        expect(await refused('taxCode', bad), bad).toBe('invalid_format');
      }
      expect(await refused('taxCode', '03123456781234')).toBe('too_big');
      expect(await refused('taxCode', '')).toBe('too_small');
      expect(await refused('taxCode', undefined)).toBe('invalid_type');
      for (const bad of ['031-2345678', '0312 345678', '03123456AB', '０３１２３４５６７８']) {
        expect(await refused('taxCode', bad), bad).toBe('invalid_format');
      }
      await refused('taxCode', 312345678);
      // The same rules hold on the early identity check.
      expect(expectInvalid((await checkIdentity({ legalForm: 'tổ chức' })) as unknown as Errors, 'taxCode')).toBe(
        'invalid_type',
      );
      expectInvalid(await checkIdentity({ legalForm: 'tổ chức', taxCode: '031234567' }), 'taxCode');
    });

    it('citizenId is required for cá nhân: exactly 12 digits', async () => {
      await accepted('citizenId', '079123456789', 'cá nhân');
      await accepted('citizenId', ' 079123456789 ', 'cá nhân');
      expect(await refused('citizenId', '07912345678', 'cá nhân')).toBe('too_small');
      expect(await refused('citizenId', '0791234567890', 'cá nhân')).toBe('too_big');
      expect(await refused('citizenId', '', 'cá nhân')).toBe('too_small');
      expect(await refused('citizenId', undefined, 'cá nhân')).toBe('invalid_type');
      for (const bad of ['07912345678A', '079-12345678', '079 12345678', '０７９１２３４５６７８９']) {
        expect(await refused('citizenId', bad, 'cá nhân'), bad).toBe('invalid_format');
      }
      await refused('citizenId', 79123456789, 'cá nhân');
      expect(expectInvalid((await checkIdentity({ legalForm: 'cá nhân' })) as unknown as Errors, 'citizenId')).toBe(
        'invalid_type',
      );
    });

    it('each legal form takes only its own identity field', async () => {
      expect(await refused('citizenId', CITIZEN_ID, 'tổ chức')).toBe('unrecognized_keys');
      expect(await refused('taxCode', TAX_CODE, 'cá nhân')).toBe('unrecognized_keys');
      expectInvalid(
        await checkIdentity({ legalForm: 'tổ chức', taxCode: TAX_CODE, citizenId: CITIZEN_ID }),
        'citizenId',
      );
    });

    it('contractNumber is 1 to 255 characters', async () => {
      for (const form of ['tổ chức', 'cá nhân'] as const) {
        await accepted('contractNumber', '1', form);
        await accepted('contractNumber', 'H'.repeat(255), form);
        expect(await refused('contractNumber', 'H'.repeat(256), form)).toBe('too_big');
        expect(await refused('contractNumber', '', form)).toBe('too_small');
        expect(await refused('contractNumber', '   ', form)).toBe('too_small');
        expect(await refused('contractNumber', undefined, form)).toBe('invalid_type');
      }
      await accepted('contractNumber', 'Ư'.repeat(255));
      await refused('contractNumber', 'Ư'.repeat(256));
    });

    it('contractDate is a calendar date with no lower limit, up to and including today in Vietnam', async () => {
      await accepted('contractDate', '2026-10-02');
      await accepted('contractDate', '1900-01-01');
      await accepted('contractDate', '2024-02-29');
      for (const form of ['tổ chức', 'cá nhân'] as const) {
        const tomorrow = await checkDraft(draftOf(form, 'contractDate', '2026-10-03'));
        expect(tomorrow.status).toBe(422);
        expect(tomorrow.body.code).toBe('PARTNER_CONTRACT_DATE_IN_FUTURE');
        expect(await refused('contractDate', undefined, form)).toBe('invalid_type');
      }
      for (const bad of [
        '',
        '2023-02-29',
        '2026-13-01',
        '2026-09-31',
        '02/10/2026',
        '2026-10-2',
        '2026-10-02T00:00:00Z',
      ]) {
        expect(await refused('contractDate', bad), bad).toBe('invalid_format');
      }
      await refused('contractDate', 20261002);
    });

    it('"today" for contractDate turns at midnight in Vietnam (UTC+7)', async () => {
      t.clock.set(new Date('2026-10-01T16:59:59.999Z'));
      expect((await checkDraft(organization({ contractDate: '2026-10-01' }))).status).toBe(200);
      expect((await checkDraft(organization({ contractDate: '2026-10-02' }))).status).toBe(422);
      t.clock.set(new Date('2026-10-01T17:00:00.000Z'));
      expect((await checkDraft(organization({ contractDate: '2026-10-02' }))).status).toBe(200);
      expect((await checkDraft(organization({ contractDate: '2026-10-03' }))).status).toBe(422);
    });

    it('invitedEmail is at most 254 characters: one @, something before it, an inner dot after it, no spaces', async () => {
      for (const form of ['tổ chức', 'cá nhân'] as const) {
        await accepted('invitedEmail', 'a@b.c', form);
        expect(await refused('invitedEmail', undefined, form)).toBe('invalid_type');
      }
      await accepted('invitedEmail', 'a.b+c@mail.example.co');
      await accepted('invitedEmail', ' Owner@Sao.VN ');
      const longest = `${'a'.repeat(254 - '@example.com'.length)}@example.com`;
      expect(longest).toHaveLength(254);
      await accepted('invitedEmail', longest);
      expect(await refused('invitedEmail', `a${longest}`)).toBe('too_big');
      expect(await refused('invitedEmail', '')).toBe('too_small');
      expect(await refused('invitedEmail', '   ')).toBe('too_small');
      for (const bad of [
        'b.y.com',
        'b@@y.com',
        'b@y@z.com',
        'b@y',
        'b y@z.com',
        '@y.com',
        'a@.com',
        'a@com.',
        'a@b.',
      ]) {
        expect(await refused('invitedEmail', bad), bad).toBe('invalid_format');
      }
      await refused('invitedEmail', 7);
    });

    it('a member the screen does not have is refused', async () => {
      await refused('status', 'ACTIVE');
      await refused('ownerName', 'Chủ sở hữu');
      expectInvalid(await checkIdentity({ legalForm: 'tổ chức', taxCode: TAX_CODE, legalName: 'X' }), 'legalName');
    });

    it('a refused draft stores nothing either', async () => {
      const before = await rowCounts();
      await refused('taxCode', '');
      expect((await checkDraft(organization({ contractDate: '2026-12-31' }))).status).toBe(422);
      expect(await rowCounts()).toEqual(before);
    });
  });
});
