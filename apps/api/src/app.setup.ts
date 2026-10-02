import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { RequestValidationPipe } from './common/http/validation.pipe.js';

/** Global route prefix. The web app proxies this path to the API. */
export const API_PREFIX = 'api';

/** Options for NestFactory.create / createNestApplication, shared by the server, the tests and the OpenAPI export. */
export const APP_OPTIONS = {
  // `/invitations/pending` wins over `/invitations/:id` whatever the declaration order.
  routeResolutionStrategy: 'specificity',
  // Two handlers for the same method and path fail at startup instead of one silently never running.
  routeConflictPolicy: { duplicate: 'error' },
} as const satisfies NestApplicationOptions;

/** Settings shared by the server, the tests and the OpenAPI export, so all three see the same routes. */
export function configureApp<T extends INestApplication>(app: T): T {
  app.useSecurityHeaders();
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new RequestValidationPipe());
  return app;
}
