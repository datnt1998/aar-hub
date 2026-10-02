import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { http, server } from '../test/server';
import { api } from './client';

describe('api client errors', () => {
  it('turns an error response without a Problem body into a Problem that keeps the status', async () => {
    server.use(http.get('/api/health', ({ response }) => response.untyped(new HttpResponse(null, { status: 502 }))));
    const { data, error } = await api.GET('/api/health');
    expect(data).toBeUndefined();
    expect(error).toMatchObject({ status: 502, code: 'UNEXPECTED_RESPONSE', instance: '/api/health' });
  });

  it('passes a Problem from the API through unchanged', async () => {
    const problem = { type: 'about:blank', title: 'Conflict', status: 409, code: 'X_TAKEN', instance: '/api/health' };
    server.use(
      http.get('/api/health', ({ response }) =>
        response.untyped(
          HttpResponse.json(problem, { status: 409, headers: { 'content-type': 'application/problem+json' } }),
        ),
      ),
    );
    const { error } = await api.GET('/api/health');
    expect(error).toEqual(problem);
  });
});
