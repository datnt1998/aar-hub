import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DOMAIN_ERROR_STATUS, DomainError } from '../errors/domain-error.js';
import { defaultCode, problem, PROBLEM_CONTENT_TYPE, type Problem } from './problem.js';
import { RequestValidationError } from './validation.pipe.js';

/**
 * Renders every error as RFC 9457 Problem Details with a required `code`.
 *
 * - Request schema failures → 400 VALIDATION_FAILED with `errors[]`.
 * - DomainError → status by `kind`, its `code`, message and the inputs it names (`errors[]`), if any.
 * - HttpException → its status, `errorCode` or a code derived from the status.
 * - Errors from the HTTP stack that carry a client status (body too large, malformed JSON) keep that status.
 * - Anything else → 500 INTERNAL_SERVER_ERROR; the error is logged and its message never reaches the client.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const [instance = ''] = req.originalUrl.split('?');

    const body = this.toProblem(exception, instance);
    // The query string may carry tokens; `instance` is path-only, and so is any echo of the URL in `detail`.
    if (body.detail !== undefined && instance !== req.originalUrl) {
      body.detail = body.detail.replaceAll(req.originalUrl, instance);
    }
    if (body.status >= 500) {
      this.logger.error(
        `${req.method} ${instance} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (res.headersSent) {
      // Part of a response is already out; it cannot become a Problem, so close it rather than leave it hanging.
      res.end();
      return;
    }
    res.status(body.status).type(PROBLEM_CONTENT_TYPE).json(body);
  }

  private toProblem(exception: unknown, instance: string): Problem {
    if (exception instanceof RequestValidationError) {
      return problem(400, 'VALIDATION_FAILED', instance, { detail: exception.message, errors: exception.errors });
    }
    if (exception instanceof DomainError) {
      return problem(DOMAIN_ERROR_STATUS[exception.kind], exception.code, instance, {
        detail: exception.message,
        errors: exception.errors,
      });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return problem(status, exception.errorCode ?? defaultCode(status), instance, {
        detail: status < 500 ? exception.message : undefined,
      });
    }
    const clientStatus = exposedClientStatus(exception);
    if (clientStatus !== undefined) {
      return problem(clientStatus, defaultCode(clientStatus), instance, { detail: (exception as Error).message });
    }
    return problem(500, defaultCode(500), instance);
  }
}

/** Status of an `http-errors` style error (body-parser) that is safe to expose, e.g. 413 or 400 for bad JSON. */
function exposedClientStatus(exception: unknown): number | undefined {
  if (!(exception instanceof Error)) {
    return undefined;
  }
  const { status, expose } = exception as Error & { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}
