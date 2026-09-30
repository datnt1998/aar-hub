import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

// openapi-fetch captures globalThis.fetch when the client module loads; vi.hoisted runs before the imports above.
const fetchMock = vi.hoisted(() => {
  const fn = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fn);
  return fn;
});

describe('App', () => {
  afterEach(() => fetchMock.mockReset());

  it('shows the API as up when /api/health answers ok', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'ok', uptimeSeconds: 5 }));
    render(<App />);
    expect(await screen.findByText('API hoạt động')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toHaveProperty('url', `${window.location.origin}/api/health`);
  });

  it('shows the API as down when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    render(<App />);
    expect(await screen.findByText('API không phản hồi')).toBeInTheDocument();
  });
});
