import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { $api } from '../api/client';
import { http, server } from '../test/server';
import { createQueryClient } from './query-client';

async function attemptsUntilError(status: number): Promise<number> {
  let attempts = 0;
  server.use(
    http.get('/api/health', ({ response }) => {
      attempts += 1;
      return response.untyped(new HttpResponse(null, { status }));
    }),
  );
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } });
  await expect(queryClient.query($api.queryOptions('get', '/api/health'))).rejects.toMatchObject({ status });
  return attempts;
}

describe('query retry policy', () => {
  it('shows a 4xx at once and retries a 5xx twice', async () => {
    expect(await attemptsUntilError(404)).toBe(1);
    expect(await attemptsUntilError(503)).toBe(3);
  });
});
