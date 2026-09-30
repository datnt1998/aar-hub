import type { INestApplication } from '@nestjs/common';

/** Global route prefix. The web app proxies this path to the API. */
export const API_PREFIX = 'api';

/** Settings shared by the server, the tests and the OpenAPI export, so all three see the same routes. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX);
  return app;
}
