import createClient, { type Middleware } from 'openapi-fetch';
import createQueryHooks from 'openapi-react-query';
import { isProblem, type Problem } from './problem';
import type { paths } from './schema.gen';

/**
 * Every non-2xx response reaches callers as a Problem that carries the HTTP status. The API always sends one;
 * anything else (an empty body, a proxy or gateway page) becomes `UNEXPECTED_RESPONSE` with the real status,
 * so an error is never mistaken for success and the status is never lost. HEAD requests are not covered
 * (openapi-fetch reports no error for them); the API declares no HEAD operations.
 */
const problemResponses: Middleware = {
  async onResponse({ request, response }) {
    if (response.ok) {
      return undefined;
    }
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    if (isProblem(body)) {
      return undefined;
    }
    const problem: Problem = {
      type: 'about:blank',
      title: response.statusText || 'Error',
      status: response.status,
      code: 'UNEXPECTED_RESPONSE',
      instance: new URL(request.url).pathname,
    };
    return Response.json(problem, {
      status: response.status,
      headers: { 'content-type': 'application/problem+json' },
    });
  },
};

/**
 * Typed client for apps/api. Paths, params, bodies, responses and errors come from schema.gen.ts, generated from
 * apps/api/openapi.json by `pnpm openapi`. Requests go to the same origin; Vite proxies /api to the API.
 * `fetch` is resolved per request so test interceptors work regardless of import order.
 */
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  fetch: (request) => globalThis.fetch(request),
});
api.use(problemResponses);

/** TanStack Query hooks and query options over `api`: `$api.queryOptions`, `$api.useMutation`. */
export const $api = createQueryHooks(api);
