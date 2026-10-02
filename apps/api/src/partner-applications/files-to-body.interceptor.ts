import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';

/**
 * Runs after AnyFilesInterceptor and puts the uploaded files into the body, grouped by form field name
 * (`body.otherDocuments = [file, file]`), so one Zod schema on `@Body` validates the whole multipart form (text
 * fields and files), reports every error together and documents it in OpenAPI. A file under a name the schema does not
 * know shows up as an unknown member. A text field with the same name as a file field is left in place, so the schema
 * rejects it instead of the files hiding it.
 */
@Injectable()
export class FilesToBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ body?: Record<string, unknown>; files?: unknown }>();
    if (Array.isArray(request.files) && request.files.length > 0) {
      // Multer sets files only for multipart requests, and then the body is its own null-prototype object.
      const body = request.body ?? (Object.create(null) as Record<string, unknown>);
      const textFields = new Set(Object.keys(body));
      for (const file of request.files as { fieldname: string }[]) {
        if (!textFields.has(file.fieldname)) {
          const group = (body[file.fieldname] ??= []) as unknown[];
          group.push(file);
        }
      }
      request.body = body;
    }
    return next.handle();
  }
}
