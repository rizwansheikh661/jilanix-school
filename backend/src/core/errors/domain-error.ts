/**
 * Domain error hierarchy.
 *
 * Per BACKEND_ARCHITECTURE §12.1: services and repositories throw
 * typed domain errors. The global filter (Sprint 1 §6) maps them to
 * the canonical `{ error: { code, message, details, requestId } }`
 * envelope using the `ErrorCode` taxonomy.
 *
 * Rules:
 *   - Domain errors carry NO HTTP details. The `code` decides the
 *     status via `ERROR_CODE_HTTP_STATUS`.
 *   - `details` is structured context for clients/operators (e.g.
 *     `{ id }`, `{ field, expected }`). Never include Prisma internals
 *     or PII — redact at the throw site.
 *   - `cause` carries the wrapped infra error for log correlation;
 *     the filter logs it with `err: this.cause` and never serialises
 *     it onto the wire.
 */
import { ERROR_CODES, type ErrorCode, type FieldIssue } from '../../contracts/api';

export interface DomainErrorOptions {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class DomainError extends Error {
  public override readonly name: string = 'DomainError';
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(options: DomainErrorOptions) {
    super(options.message);
    this.code = options.code;
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class ValidationFailedError extends DomainError {
  public override readonly name = 'ValidationFailedError';
  constructor(public readonly fields: FieldIssue[], message = 'Request validation failed') {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message,
      details: { fields },
    });
  }
}

export class UnauthenticatedError extends DomainError {
  public override readonly name = 'UnauthenticatedError';
  constructor(message = 'Authentication required', details?: Record<string, unknown>) {
    super({ code: ERROR_CODES.UNAUTHENTICATED, message, ...(details ? { details } : {}) });
  }
}

export class ForbiddenError extends DomainError {
  public override readonly name: string = 'ForbiddenError';
  constructor(message = 'Insufficient permissions', details?: Record<string, unknown>) {
    super({ code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message, ...(details ? { details } : {}) });
  }
}

export class NotFoundError extends DomainError {
  public override readonly name = 'NotFoundError';
  constructor(resource: string, id?: string) {
    super({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: `${resource} not found`,
      details: id !== undefined ? { resource, id } : { resource },
    });
  }
}

export class ConflictError extends DomainError {
  public override readonly name = 'ConflictError';
  constructor(
    message: string,
    options: { code?: ErrorCode; details?: Record<string, unknown> } = {},
  ) {
    super({
      code: options.code ?? ERROR_CODES.STATE_INVALID,
      message,
      ...(options.details ? { details: options.details } : {}),
    });
  }
}

export class DuplicateResourceError extends DomainError {
  public override readonly name = 'DuplicateResourceError';
  constructor(resource: string, fields?: string[]) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `${resource} already exists`,
      details: fields !== undefined ? { resource, fields } : { resource },
    });
  }
}

export class VersionConflict extends DomainError {
  public override readonly name = 'VersionConflict';
  constructor(resource: string, id: string, expectedVersion: number) {
    super({
      code: ERROR_CODES.VERSION_CONFLICT,
      message: `${resource} was modified concurrently — reload and retry`,
      details: { resource, id, expectedVersion },
    });
  }
}

export class LockedResourceError extends DomainError {
  public override readonly name = 'LockedResourceError';
  constructor(resource: string, reason?: string) {
    super({
      code: ERROR_CODES.LOCKED_RESOURCE,
      message: `${resource} is locked`,
      details: reason !== undefined ? { resource, reason } : { resource },
    });
  }
}

export class RateLimitedError extends DomainError {
  public override readonly name = 'RateLimitedError';
  constructor(message = 'Too many requests', details?: Record<string, unknown>) {
    super({ code: ERROR_CODES.RATE_LIMITED, message, ...(details ? { details } : {}) });
  }
}

export class ExternalProviderError extends DomainError {
  public override readonly name = 'ExternalProviderError';
  constructor(provider: string, message: string, cause?: unknown) {
    super({
      code: ERROR_CODES.EXTERNAL_PROVIDER_ERROR,
      message: `${provider}: ${message}`,
      details: { provider },
      ...(cause !== undefined ? { cause } : {}),
    });
  }
}

export class InternalError extends DomainError {
  public override readonly name = 'InternalError';
  constructor(message = 'Internal server error', cause?: unknown) {
    super({
      code: ERROR_CODES.INTERNAL_ERROR,
      message,
      ...(cause !== undefined ? { cause } : {}),
    });
  }
}

/** Type guard — used by filter to branch on domain vs unknown errors. */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
