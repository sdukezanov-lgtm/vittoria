import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.buildBody(exception, status);
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? randomUUID();

    if (status >= 500) {
      this.logger.error(
        { request_id: requestId, path: request.url, error: body },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({ error: body, request_id: requestId });
  }

  private buildBody(exception: unknown, status: number): ErrorBody {
    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        return { code: this.codeFromStatus(status), message: resp };
      }
      if (typeof resp === 'object' && resp !== null) {
        const obj = resp as Record<string, unknown>;
        const code =
          typeof obj.code === 'string' ? obj.code : this.codeFromStatus(status);
        const message =
          typeof obj.message === 'string'
            ? obj.message
            : Array.isArray(obj.message)
              ? (obj.message as string[]).join('; ')
              : exception.message;
        const details =
          typeof obj.details === 'object' && obj.details !== null
            ? (obj.details as Record<string, unknown>)
            : undefined;
        return { code, message, ...(details ? { details } : {}) };
      }
      return { code: this.codeFromStatus(status), message: exception.message };
    }
    return { code: 'INTERNAL_ERROR', message: 'internal server error' };
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_FAILED';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
