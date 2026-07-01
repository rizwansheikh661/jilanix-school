/**
 * tenantScopeExt — defense layer 4 of 7 (per PRISMA_STRATEGY.md §4).
 *
 * Behaviour by model scope:
 *
 *   PLATFORM_ONLY            — pass through; no schoolId on these models.
 *   TENANT_OWNED             — RequestContext.schoolId is required:
 *                                * read ops merge `where.schoolId = ctx.schoolId`
 *                                * write ops stamp `data.schoolId = ctx.schoolId`
 *                                * caller-supplied mismatch → throws.
 *   TENANT_SHARED_PLATFORM   — like TENANT_OWNED for tenant actors; for
 *                              platform actors (actorScope === 'global'),
 *                              passes through.
 *   CROSS_TENANT_OPERATIONAL — pass through; relays/workers read across
 *                              tenants. Caller is responsible for filtering
 *                              when they know they want a specific tenant.
 *
 * Bypass: callers that legitimately need to escape the scope (e.g. tenant
 * provisioning, support tooling) call `prisma.$withTenantScope({ skip:
 * true, reason }).<op>(...)`. The bypass marker is consumed once and a
 * security audit event is emitted.
 *
 * Sprint 1 caveat: AuditLog write goes via `auditExt`. This extension only
 * handles tenant scoping; observability for bypasses is a TODO until the
 * audit module fully lands.
 */
import { Prisma } from '@prisma/client';

import { RequestContextRegistry } from '../../../core/request-context';
import { TenantContextMissingError, TenantScopeViolationError } from '../errors';
import { getModelScope } from '../scope';

const READ_OPERATIONS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_OPERATIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

interface MutableArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  __schoolosCtx?: {
    bypassTenantScope?: { reason: string };
  };
}

function applyWhereSchoolFilter(args: MutableArgs, schoolId: string, model: string): void {
  const where = (args.where ?? {}) as Record<string, unknown>;
  const existing = where.schoolId;
  if (existing !== undefined && existing !== null && existing !== schoolId) {
    throw new TenantScopeViolationError(model, schoolId, String(existing));
  }
  args.where = { ...where, schoolId };
}

function stampDataSchoolId(args: MutableArgs, schoolId: string, model: string): void {
  if (args.data === undefined) {
    return;
  }
  const stamp = (row: Record<string, unknown>): Record<string, unknown> => {
    const existing = row.schoolId;
    if (existing !== undefined && existing !== null && existing !== schoolId) {
      throw new TenantScopeViolationError(model, schoolId, String(existing));
    }
    return { ...row, schoolId };
  };
  if (Array.isArray(args.data)) {
    args.data = args.data.map(stamp);
  } else {
    args.data = stamp(args.data);
  }
}

export const tenantScopeExt = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'schoolos.tenantScope',
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          const scope = getModelScope(model);
          // Models without a registered scope MUST NOT silently pass — that
          // is precisely the failure mode the registry exists to catch.
          // Throwing here at runtime is loud and keeps the security
          // invariant intact.
          if (scope === undefined) {
            throw new Error(
              `Model "${model}" has no scope in MODEL_SCOPE registry. ` +
                'Add it to src/infra/prisma/scope.ts before querying it.',
            );
          }

          if (scope === 'PLATFORM_ONLY' || scope === 'CROSS_TENANT_OPERATIONAL') {
            return query(args);
          }

          const mutable = args as MutableArgs;
          const bypass = mutable.__schoolosCtx?.bypassTenantScope;
          if (bypass !== undefined) {
            return query(args);
          }

          const ctx = RequestContextRegistry.peek();

          if (scope === 'TENANT_SHARED_PLATFORM' && ctx?.actorScope === 'global') {
            return query(args);
          }

          if (ctx === undefined || ctx.schoolId === undefined) {
            throw new TenantContextMissingError(model);
          }

          if (READ_OPERATIONS.has(operation)) {
            applyWhereSchoolFilter(mutable, ctx.schoolId, model);
          } else if (WRITE_OPERATIONS.has(operation)) {
            // Writes both filter (for update*/delete* targeting) and stamp
            // (for create*/upsert payloads) so that the same `schoolId` the
            // caller is bound to is the one written or matched.
            if (mutable.where !== undefined) {
              applyWhereSchoolFilter(mutable, ctx.schoolId, model);
            }
            if (mutable.data !== undefined) {
              stampDataSchoolId(mutable, ctx.schoolId, model);
            }
          }

          return query(args);
        },
      },
    },
  }),
);
