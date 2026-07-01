/**
 * Map Prisma-layer errors (both `@prisma/client` runtime errors and our
 * own `PrismaInfraError` subclasses) to typed `DomainError`s.
 *
 * Why a mapper?
 *   - Services should not import `Prisma` to inspect `error.code === 'P2002'`.
 *   - The global filter only knows how to serialise `DomainError`. Mapping
 *     happens here so the filter stays code-agnostic.
 *   - Cross-tenant probes via `TenantScopeViolationError` MUST surface as
 *     404 (`RESOURCE_NOT_FOUND`), not 403 — see API_STANDARDS §8 / §22.
 *
 * Design notes:
 *   - We never serialise `meta.target` directly to clients; it can leak
 *     internal column names. Only field names are forwarded, and only on
 *     the writes that already advertise them (e.g. unique constraints).
 *   - The original error is kept on `cause` so the filter logs it once at
 *     `error` level with full stack — without echoing onto the wire.
 */
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';

import {
  TenantContextMissingError,
  TenantScopeViolationError,
  VersionConflictError as InfraVersionConflictError,
} from '../../infra/prisma/errors';
import {
  ConflictError,
  DomainError,
  DuplicateResourceError,
  InternalError,
  NotFoundError,
  VersionConflict,
} from './domain-error';

type PrismaKnownRequestErrorMeta = {
  target?: string[] | string;
  modelName?: string;
  field_name?: string;
  cause?: string;
};

/**
 * Convert any thrown value to a `DomainError`. Already-typed domain
 * errors pass through. Prisma + infra errors map to specific codes.
 * Everything else returns `undefined` — the filter then either honours
 * `HttpException` or falls back to `INTERNAL_ERROR`.
 */
export function mapPrismaError(error: unknown): DomainError | undefined {
  if (error instanceof DomainError) {
    return error;
  }

  if (error instanceof TenantScopeViolationError) {
    // Don't leak existence across tenants — surface as a plain 404.
    return new NotFoundError(error.model);
  }
  if (error instanceof TenantContextMissingError) {
    return new InternalError('Tenant context missing for tenant-scoped query', error);
  }
  if (error instanceof InfraVersionConflictError) {
    return new VersionConflict(error.model, error.id, error.expectedVersion);
  }

  if (error instanceof PrismaClientKnownRequestError) {
    return mapKnownRequestError(error);
  }
  if (error instanceof PrismaClientValidationError) {
    // Caller passed malformed args — internal bug, not user-correctable.
    return new InternalError('Database query was malformed', error);
  }

  return undefined;
}

function mapKnownRequestError(error: PrismaClientKnownRequestError): DomainError {
  const meta = (error.meta ?? {}) as PrismaKnownRequestErrorMeta;
  const resource = meta.modelName ?? 'Resource';

  switch (error.code) {
    case 'P2002': {
      // Unique constraint failed.
      const fields = normaliseTarget(meta.target);
      return new DuplicateResourceError(resource, fields);
    }

    case 'P2025': {
      // Record(s) not found for required relation / required where.
      return new NotFoundError(resource);
    }

    case 'P2003':
    case 'P2014': {
      // FK / required relation violation — caller broke an invariant.
      return new ConflictError(`${resource} relation invariant violated`, {
        details: { resource },
      });
    }

    case 'P2034': {
      // Write conflict / deadlock retry exhausted.
      return new ConflictError(`${resource} update conflicted with another writer — retry`, {
        details: { resource },
      });
    }

    default:
      return new InternalError(`Database error (${error.code})`, error);
  }
}

function normaliseTarget(target: string[] | string | undefined): string[] | undefined {
  if (target === undefined) return undefined;
  if (Array.isArray(target)) return target.length > 0 ? target : undefined;
  return target.length > 0 ? [target] : undefined;
}
