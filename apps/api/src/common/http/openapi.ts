import type { OpenAPIObject } from '@nestjs/swagger';
import { PROBLEM_CONTENT_TYPE, ProblemSchema } from './problem.js';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

/**
 * Adds the Problem schemas to the document and a `default` Problem response to every operation, so every
 * non-2xx response of the API is typed for clients, including the ones a route does not list with ApiProblem.
 */
export function withProblemResponses(document: OpenAPIObject): OpenAPIObject {
  // A schema with `.meta({ id })` converts to `{ $ref, definitions: { Problem, FieldError } }`.
  const converted = ProblemSchema['~standard'].jsonSchema.output({ target: 'openapi-3.0' }) as {
    definitions?: Record<string, object>;
    $defs?: Record<string, object>;
  };
  const definitions = converted.definitions ?? converted.$defs;
  if (!definitions?.Problem) {
    throw new Error('ProblemSchema must convert to a named `Problem` definition');
  }
  const components = (document.components ??= {});
  const schemas = (components.schemas ??= {});
  for (const [name, schema] of Object.entries(rewriteRefs(definitions))) {
    if (name in schemas) {
      throw new Error(`Schema id "${name}" is reserved for error responses; rename the .meta({ id }) that uses it`);
    }
    schemas[name] = schema;
  }

  for (const path of Object.values(document.paths)) {
    for (const method of METHODS) {
      const responses = path[method]?.responses;
      if (responses) {
        responses.default ??= {
          description: 'Error (Problem Details)',
          content: { [PROBLEM_CONTENT_TYPE]: { schema: { $ref: '#/components/schemas/Problem' } } },
        };
      }
    }
  }
  return document;
}

function rewriteRefs<T>(value: T): T {
  const json = JSON.stringify(value).replaceAll('"#/definitions/', '"#/components/schemas/');
  return JSON.parse(json.replaceAll('"#/$defs/', '"#/components/schemas/')) as T;
}
