import {
  type ArgumentMetadata,
  Injectable,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import type { FieldError } from './problem.js';

type Issue = Parameters<NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>>[0][number];

const LOCATION: Record<ArgumentMetadata['type'], string> = {
  body: 'body',
  query: 'query',
  param: 'path',
  custom: 'custom',
};

/** Request input that failed its schema; ProblemFilter renders it as 400 VALIDATION_FAILED with per-field errors. */
export class RequestValidationError extends Error {
  constructor(readonly errors: FieldError[]) {
    super('Request validation failed');
  }
}

/**
 * Validates `@Body/@Query/@Param({ schema })` with the built-in Standard Schema pipe, and reports every issue with
 * a JSON Pointer that includes where the input came from (`/body/email`, `/query/page`, `/path/id`).
 */
@Injectable()
export class RequestValidationPipe extends StandardSchemaValidationPipe {
  override async transform<T = unknown>(value: T, metadata: ArgumentMetadata): Promise<T> {
    const schema = metadata.schema;
    if (!schema || !this.toValidate(metadata)) {
      return value;
    }
    this.stripProtoKeys(value);
    const result = await this.validate<T>(value, schema, this.validateOptions);
    if (result.issues) {
      // `@Param('id', { schema })` validates one value: its name is the first segment after the location.
      const base = [LOCATION[metadata.type], ...(metadata.data ? [metadata.data] : [])];
      throw new RequestValidationError(result.issues.flatMap((issue) => toFieldErrors(base, issue)));
    }
    return this.isTransformEnabled ? result.value : value;
  }
}

function toFieldErrors(base: PropertyKey[], issue: Issue): FieldError[] {
  const path = [...base, ...(issue.path ?? []).map((segment) => (typeof segment === 'object' ? segment.key : segment))];
  // Zod issues carry a `code` (and `keys` for unknown members); other Standard Schema libraries may not.
  const { code, keys } = issue as { code?: unknown; keys?: unknown };
  const reason = typeof code === 'string' ? code : 'invalid';
  if (reason === 'unrecognized_keys' && Array.isArray(keys)) {
    return keys.map((key) => ({
      pointer: pointer([...path, String(key)]),
      code: reason,
      detail: 'Unknown member',
    }));
  }
  return [{ pointer: pointer(path), code: reason, detail: issue.message }];
}

function pointer(path: PropertyKey[]): string {
  return path.map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}
