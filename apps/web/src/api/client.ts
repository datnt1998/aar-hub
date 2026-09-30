import createClient from 'openapi-fetch';
import type { paths } from './schema.gen';

/**
 * Typed client for apps/api. Paths and bodies come from schema.gen.ts, which is generated
 * from apps/api/openapi.json by `pnpm openapi`. Requests go to the same origin; Vite proxies /api to the API.
 */
export const api = createClient<paths>({ baseUrl: window.location.origin });
