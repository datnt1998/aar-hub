import { applyDecorators, HttpCode, type HttpStatus, SerializeOptions } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { z } from 'zod';
import { PROBLEM_CONTENT_TYPE } from './problem.js';

/**
 * Declares the success response of a route from one Zod object schema: status code, OpenAPI response, and response
 * serialization. The global serializer validates the handler result against the schema and strips undeclared
 * fields; a result that does not match fails with 500 instead of leaking or drifting.
 *
 * Responses are objects; return lists as `{ items: [...] }`.
 */
export function Returns(status: HttpStatus, schema: z.ZodObject): MethodDecorator {
  return applyDecorators(
    HttpCode(status),
    ApiResponse({ status, standardSchema: schema }),
    SerializeOptions({ schema }),
  );
}

/**
 * Documents an error response of a route with the codes it can return, so the typed web client sees
 * `error.code` as a union of exactly these codes. Every route also gets a generic `default` Problem response
 * from the OpenAPI export.
 */
export function ApiProblem(status: number, ...codes: [string, ...string[]]): MethodDecorator {
  return ApiResponse({
    status,
    description: codes.join(', '),
    content: {
      [PROBLEM_CONTENT_TYPE]: {
        schema: {
          allOf: [
            { $ref: '#/components/schemas/Problem' },
            { type: 'object', required: ['code'], properties: { code: { type: 'string', enum: codes } } },
          ],
        },
      },
    },
  });
}
