import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';

/**
 * Runs after FileInterceptor and copies the uploaded file into `body.file`, so one Zod schema on `@Body` validates
 * the whole multipart form (file and text fields) and documents it in OpenAPI.
 */
@Injectable()
export class FileToBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ body?: object; file?: unknown }>();
    request.body = { ...request.body, file: request.file };
    return next.handle();
  }
}
