/**
 * Errors emitted by the Prisma extension stack. Each carries enough
 * structured context for the global exception filter (Sprint 1 §6) to map
 * it to a 4xx/5xx response with the canonical envelope, without leaking
 * Prisma internals to clients.
 */

export class PrismaInfraError extends Error {
  public override readonly name: string = 'PrismaInfraError';
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown by `tenantScopeExt` when a TENANT_OWNED model is queried without
 * a `RequestContext` bound. Always a programmer error — the caller forgot
 * to wrap the operation in `RequestContextRegistry.run(...)`.
 */
export class TenantContextMissingError extends PrismaInfraError {
  public override readonly name = 'TenantContextMissingError';
  constructor(public readonly model: string) {
    super(
      `Tenant context required to query model "${model}", but none was bound. ` +
        'Wrap the call in RequestContextRegistry.run(ctx, ...).',
    );
  }
}

/**
 * Thrown by `tenantScopeExt` when caller-supplied `where.schoolId` does
 * not match the bound context. Indicates either a bug or an attempted
 * cross-tenant access — surfaces as 403 with a security audit event.
 */
export class TenantScopeViolationError extends PrismaInfraError {
  public override readonly name = 'TenantScopeViolationError';
  constructor(
    public readonly model: string,
    public readonly contextSchoolId: string,
    public readonly suppliedSchoolId: string,
  ) {
    super(
      `Tenant scope violation on "${model}": context school=${contextSchoolId}, ` +
        `supplied school=${suppliedSchoolId}.`,
    );
  }
}

/**
 * Thrown by repositories on optimistic concurrency conflict — the
 * `WHERE id=? AND version=?` predicate matched zero rows. Mapped to HTTP
 * 409 by the exception filter.
 */
export class VersionConflictError extends PrismaInfraError {
  public override readonly name = 'VersionConflictError';
  constructor(
    public readonly model: string,
    public readonly id: string,
    public readonly expectedVersion: number,
  ) {
    super(`Optimistic lock failure on ${model}#${id}: expected version=${expectedVersion}.`);
  }
}
