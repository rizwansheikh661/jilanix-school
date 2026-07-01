/**
 * GlobalExceptionFilter — last line of defence for HTTP responses.
 *
 * Responsibilities (per BACKEND_ARCHITECTURE §12.1, API_STANDARDS §6/§7/§22):
 *
 *   1. Map every thrown value to a `DomainError`:
 *        - `DomainError` itself — pass through.
 *        - Prisma + infra errors — via `mapPrismaError`.
 *        - `HttpException` (Nest built-ins, e.g. ValidationPipe) — coerced
 *          to a domain code based on status.
 *        - Anything else — `INTERNAL_ERROR` with the original on `cause`.
 *
 *   2. Serialise to the canonical error envelope:
 *        `{ error: { code, message, details?, requestId } }`.
 *
 *   3. Skip the envelope on probe paths (`/health`, `/ready`, `/version`).
 *      Their bodies are consumed by orchestrators in raw form.
 *
 *   4. Echo the request id on every error response and emit a single
 *      structured log line (warn for 4xx, error for 5xx).
 *
 * What we explicitly do NOT do:
 *   - Trust `error.message` for client display when the source is
 *     untyped — generic 500s show a fixed string. Internal details land
 *     in logs only.
 *   - Forward Prisma `meta.target` columns to clients verbatim — the
 *     mapper has already redacted them.
 */
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { ErrorEnvelope, ErrorPayload } from '../../contracts/api';
import { ERROR_CODES } from '../../contracts/api';
import {
  DomainError,
  ERROR_CODE_HTTP_STATUS,
  InternalError,
  ValidationFailedError,
  isDomainError,
  mapPrismaError,
} from '../errors';
import { REQUEST_ID_HEADER_OUT } from '../logger/correlation';
import { AppLogger } from '../logger/logger.service';
import { RequestContextRegistry } from '../request-context/request-context.service';
import { isEnvelopeExemptPath } from './envelope-exempt';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('GlobalExceptionFilter');
  }

  public catch(exception: unknown, host: ArgumentsHost): void {
    const httpHost = host.switchToHttp();
    const req = httpHost.getRequest<Request>();
    const res = httpHost.getResponse<Response>();
    const requestId = RequestContextRegistry.peek()?.requestId ?? 'unknown';

    if (!res.headersSent && requestId !== 'unknown') {
      res.setHeader(REQUEST_ID_HEADER_OUT, requestId);
    }

    if (isEnvelopeExemptPath(req.path)) {
      this.respondRawForExemptPath(exception, res);
      return;
    }

    const { status, payload, logLevel, originalForLog } = this.resolve(exception, requestId);

    this.emitLog(logLevel, payload, status, req, originalForLog);

    if (res.headersSent) {
      return;
    }

    const envelope: ErrorEnvelope = { error: payload };
    res.status(status).json(envelope);
  }

  private resolve(
    exception: unknown,
    requestId: string,
  ): {
    status: number;
    payload: ErrorPayload;
    logLevel: 'warn' | 'error';
    originalForLog: unknown;
  } {
    // 1. Domain errors (including those returned by the Prisma mapper).
    const mapped = mapPrismaError(exception);
    if (mapped !== undefined) {
      return this.fromDomain(mapped, requestId);
    }
    if (isDomainError(exception)) {
      return this.fromDomain(exception, requestId);
    }

    // 2. Nest's built-in HttpException (e.g. ValidationPipe BadRequest).
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, requestId);
    }

    // 3. Genuine unknowns — hide details, log everything.
    const fallback = new InternalError('Internal server error', exception);
    return this.fromDomain(fallback, requestId, exception);
  }

  private fromDomain(
    error: DomainError,
    requestId: string,
    originalForLog: unknown = error,
  ): {
    status: number;
    payload: ErrorPayload;
    logLevel: 'warn' | 'error';
    originalForLog: unknown;
  } {
    const status = ERROR_CODE_HTTP_STATUS[error.code];
    const payload: ErrorPayload = {
      code: error.code,
      message: error.message,
      requestId,
    };
    if (error.details !== undefined) {
      payload.details = error.details;
    }
    return {
      status,
      payload,
      logLevel: status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'error' : 'warn',
      originalForLog,
    };
  }

  private fromHttpException(
    exception: HttpException,
    requestId: string,
  ): {
    status: number;
    payload: ErrorPayload;
    logLevel: 'warn' | 'error';
    originalForLog: unknown;
  } {
    const status = exception.getStatus();
    const response = exception.getResponse();

    // class-validator messages arrive as `response.message: string[]`.
    if (status === HttpStatus.BAD_REQUEST && hasValidationMessages(response)) {
      const fields = response.message.map((m) => ({
        path: extractPath(m) ?? 'unknown',
        code: 'VALIDATION_ERROR',
        message: m,
      }));
      const validation = new ValidationFailedError(fields);
      return this.fromDomain(validation, requestId, exception);
    }

    const payload: ErrorPayload = {
      code: statusToErrorCode(status),
      message: extractMessage(response, exception.message),
      requestId,
    };
    return {
      status,
      payload,
      logLevel: status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'error' : 'warn',
      originalForLog: exception,
    };
  }

  private respondRawForExemptPath(exception: unknown, res: Response): void {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (!res.headersSent) {
        res.status(status).json(exception.getResponse());
      }
      return;
    }
    if (!res.headersSent) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: exception instanceof Error ? exception.message : 'Internal server error',
      });
    }
  }

  private emitLog(
    level: 'warn' | 'error',
    payload: ErrorPayload,
    status: number,
    req: Request,
    original: unknown,
  ): void {
    const meta = {
      err: original instanceof Error ? original : undefined,
      error_code: payload.code,
      status_code: status,
      method: req.method,
      route: req.path,
    };
    if (level === 'error') {
      this.logger.error('http.exception', meta);
    } else {
      this.logger.warn('http.exception', meta);
    }
  }
}

function hasValidationMessages(response: unknown): response is { message: string[] } {
  return (
    typeof response === 'object' &&
    response !== null &&
    Array.isArray((response as { message?: unknown }).message) &&
    (response as { message: unknown[] }).message.every((m) => typeof m === 'string')
  );
}

function extractMessage(response: unknown, fallback: string): string {
  if (typeof response === 'string') return response;
  if (
    typeof response === 'object' &&
    response !== null &&
    typeof (response as { message?: unknown }).message === 'string'
  ) {
    return (response as { message: string }).message;
  }
  return fallback;
}

function statusToErrorCode(status: number): ErrorPayload['code'] {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.INSUFFICIENT_PERMISSIONS;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.RESOURCE_NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ERROR_CODES.STATE_INVALID;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.LOCKED:
      return ERROR_CODES.LOCKED_RESOURCE;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMITED;
    case HttpStatus.BAD_GATEWAY:
      return ERROR_CODES.EXTERNAL_PROVIDER_ERROR;
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}

/**
 * class-validator messages don't carry a structured field path, but the
 * convention is to start the message with the property name. Pull a
 * leading identifier when one is present.
 */
function extractPath(message: string): string | undefined {
  const match = /^([a-zA-Z_$][\w$.]*)\b/.exec(message);
  return match?.[1];
}
