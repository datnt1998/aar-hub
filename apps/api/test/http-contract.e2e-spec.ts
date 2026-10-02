import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Module,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import { Returns } from '../src/common/http/decorators.js';
import { DomainError } from '../src/common/errors/domain-error.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

/** Shared HTTP behavior every feature inherits: validation, Problem Details, response serialization, routing. */

class ProbeClosedError extends DomainError {
  readonly code = 'PROBE_CLOSED';
  readonly kind = 'conflict';
  constructor() {
    super('The probe is closed');
  }
}

const CreateProbe = z.strictObject({ email: z.email(), seats: z.int().min(1) });
const Probe = z.object({ id: z.string(), email: z.string() });

@Controller('probes')
class ProbeController {
  @Post()
  @Returns(HttpStatus.CREATED, Probe)
  create(@Body({ schema: CreateProbe }) body: z.infer<typeof CreateProbe>) {
    return { id: 'p1', email: body.email, passwordHash: 'secret' };
  }

  @Get('page')
  @Returns(HttpStatus.OK, z.object({ page: z.int() }))
  page(@Query({ schema: z.object({ page: z.coerce.number().int().min(1).default(1) }) }) query: { page: number }) {
    return query;
  }

  @Get('closed')
  closed(): never {
    throw new ProbeClosedError();
  }

  @Get('http-code')
  httpCode(): never {
    throw new UnprocessableEntityException('Seats exceed the plan', { errorCode: 'PROBE_SEATS_EXCEEDED' });
  }

  @Get('crash')
  crash(): never {
    throw new Error('db password=hunter2');
  }

  @Get('crash-value')
  crashValue(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test: a thrown non-Error.
    throw 'token=hunter2';
  }

  @Get('drift')
  @Returns(HttpStatus.OK, Probe)
  drift() {
    return { id: 1 };
  }

  @Get('nothing')
  @Returns(HttpStatus.OK, Probe)
  nothing() {
    return null;
  }

  @Get(':id')
  @Returns(HttpStatus.OK, Probe)
  one(@Param('id', { schema: z.uuid() }) id: string) {
    return { id, email: 'a@b.co' };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('HTTP contract', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ imports: [ProbeModule] });
  });

  afterAll(async () => {
    await t.close();
  });

  it('rejects invalid input with 400 VALIDATION_FAILED and a pointer per field', async () => {
    const res = await t.http().post('/api/probes').send({ email: 'nope', extra: 1 }).expect(400);

    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Request validation failed',
      instance: '/api/probes',
      errors: expect.arrayContaining([
        { pointer: '/body/email', code: 'invalid_format', detail: expect.any(String) },
        { pointer: '/body/seats', code: 'invalid_type', detail: expect.any(String) },
        { pointer: '/body/extra', code: 'unrecognized_keys', detail: expect.any(String) },
      ]),
    });
  });

  it('validates path and query parameters with their location in the pointer', async () => {
    const path = await t.http().get('/api/probes/not-a-uuid').expect(400);
    expect(path.body.errors).toEqual([{ pointer: '/path/id', code: 'invalid_format', detail: expect.any(String) }]);

    const query = await t.http().get('/api/probes/page?page=0').expect(400);
    expect(query.body.errors).toEqual([{ pointer: '/query/page', code: 'too_small', detail: expect.any(String) }]);

    await t.http().get('/api/probes/page?page=3').expect(200, { page: 3 });
  });

  it('maps a DomainError to its status by kind, code and message', async () => {
    const res = await t.http().get('/api/probes/closed').expect(409);
    expect(res.body).toMatchObject({ status: 409, code: 'PROBE_CLOSED', detail: 'The probe is closed' });
  });

  it('keeps the errorCode of an HttpException, and derives a code from the status otherwise', async () => {
    const coded = await t.http().get('/api/probes/http-code').expect(422);
    expect(coded.body).toMatchObject({ code: 'PROBE_SEATS_EXCEEDED', detail: 'Seats exceed the plan' });

    const missing = await t.http().get('/api/nothing-here?token=abc').expect(404);
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND', instance: '/api/nothing-here' });
    expect(JSON.stringify(missing.body)).not.toContain('token=abc');
  });

  it('keeps client errors raised before routing: malformed JSON and oversized bodies', async () => {
    const malformed = await t.http().post('/api/probes').set('content-type', 'application/json').send('{"email":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('BAD_REQUEST');

    const huge = await t
      .http()
      .post('/api/probes')
      .send({ email: 'a@b.co', seats: 1, note: 'x'.repeat(200_000) });
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers unexpected errors with 500 and never leaks their message', async () => {
    const res = await t.http().get('/api/probes/crash').expect(500);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      instance: '/api/probes/crash',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');

    const thrownValue = await t.http().get('/api/probes/crash-value').expect(500);
    expect(thrownValue.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(thrownValue.body)).not.toContain('hunter2');
  });

  it('strips fields the response schema does not declare, and fails closed when the result does not match', async () => {
    const created = await t.http().post('/api/probes').send({ email: 'a@b.co', seats: 2 }).expect(201);
    expect(created.body).toEqual({ id: 'p1', email: 'a@b.co' });

    const drift = await t.http().get('/api/probes/drift').expect(500);
    expect(drift.body.code).toBe('INTERNAL_SERVER_ERROR');

    const nothing = await t.http().get('/api/probes/nothing').expect(500);
    expect(nothing.body.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('sends security headers and hides the framework', async () => {
    const res = await t.http().get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Routing', () => {
  it('sends a literal path to its own route even when a parameter route is declared first', async () => {
    @Controller('invites')
    class InvitesController {
      @Get(':id')
      one(@Param('id') id: string) {
        return { route: 'one', id };
      }

      @Get('pending')
      pending() {
        return { route: 'pending' };
      }
    }

    @Module({ controllers: [InvitesController] })
    class InvitesModule {}

    const t = await createTestApp({ imports: [InvitesModule] });
    try {
      await t.http().get('/api/invites/pending').expect(200, { route: 'pending' });
      await t.http().get('/api/invites/42').expect(200, { route: 'one', id: '42' });
    } finally {
      await t.close();
    }
  });

  it('refuses to start when two handlers declare the same route', async () => {
    @Controller('twice')
    class TwiceController {
      @Get()
      first() {
        return {};
      }

      @Get()
      second() {
        return {};
      }
    }

    @Module({ controllers: [TwiceController] })
    class TwiceModule {}

    await expect(createTestApp({ imports: [TwiceModule] })).rejects.toThrow(/Conflicting HTTP routes/);
  });
});
