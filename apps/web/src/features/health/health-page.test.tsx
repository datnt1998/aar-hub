import { screen } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../../test/render';
import { http, server } from '../../test/server';

const healthy = http.get('/api/health', ({ response }) => response(200).json({ status: 'ok', uptimeSeconds: 5 }));
const unreachable = http.get('/api/health', ({ response }) => response.untyped(HttpResponse.error()));
const bodiless503 = http.get('/api/health', ({ response }) =>
  response.untyped(new HttpResponse(null, { status: 503 })),
);

describe('health page', () => {
  it('shows the API as up when /api/health answers ok', async () => {
    server.use(healthy);
    renderRoute('/');
    expect(await screen.findByText('API hoạt động')).toBeInTheDocument();
  });

  it('shows the API as down when the first check fails, and up again after a successful re-check', async () => {
    server.use(unreachable);
    const { user } = renderRoute('/');
    expect(await screen.findByText('API không phản hồi')).toBeInTheDocument();

    server.use(healthy);
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
    expect(await screen.findByText('API hoạt động')).toBeInTheDocument();
  });

  it('shows the API as down when a re-check fails after it was up', async () => {
    server.use(healthy);
    const { user } = renderRoute('/');
    await screen.findByText('API hoạt động');

    server.use(bodiless503);
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
    expect(await screen.findByText('API không phản hồi')).toBeInTheDocument();
  });
});
