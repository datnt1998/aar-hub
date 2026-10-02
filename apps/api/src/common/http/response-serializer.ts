import { Injectable, StandardSchemaSerializerInterceptor, StreamableFile } from '@nestjs/common';

type Serialize = StandardSchemaSerializerInterceptor['serialize'];
type ResponseSchema = NonNullable<Parameters<Serialize>[1]>;

/**
 * Validates the whole result of a route that declares a response schema (`@Returns`) and sends the parsed value,
 * so undeclared fields are dropped and a result that does not match fails with 500.
 * Nest's interceptor lets `null`, scalars and arrays through (it validates objects only, arrays item by item),
 * which would publish a body the generated client types say cannot happen.
 */
@Injectable()
export class ResponseSerializerInterceptor extends StandardSchemaSerializerInterceptor {
  override serialize(...[response, schema, validateOptions]: Parameters<Serialize>): ReturnType<Serialize> {
    if (schema === undefined || response instanceof StreamableFile) {
      return response;
    }
    return validate(response, schema, validateOptions);
  }
}

async function validate(
  response: unknown,
  schema: ResponseSchema,
  validateOptions: Parameters<Serialize>[2],
): Promise<Awaited<ReturnType<Serialize>>> {
  const result = await schema['~standard'].validate(response, validateOptions);
  if (result.issues) {
    throw new Error(`Serialization failed: ${result.issues.map((issue) => issue.message).join(', ')}`);
  }
  return result.value as Awaited<ReturnType<Serialize>>;
}
