import { setupServer } from 'msw/node';
import { createOpenApiHttp } from 'openapi-msw';
import type { paths } from '../api/schema.gen';

/** Intercepts every request the app makes in component tests; an unhandled request fails the test. */
export const server = setupServer();

/**
 * Handlers typed against the API schema: `server.use(http.get('/api/health', ({ response }) =>
 * response(200).json({ ... })))`. A fixture that no longer matches the API fails `pnpm typecheck`.
 */
export const http = createOpenApiHttp<paths>({ baseUrl: window.location.origin });
