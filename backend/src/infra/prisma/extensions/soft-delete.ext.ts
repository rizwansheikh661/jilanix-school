/**
 * softDeleteExt — third extension in the stack.
 *
 * Models registered in SOFT_DELETE_MODELS get the following behaviour:
 *
 *   - `delete`     → `update({ data: { deletedAt: now, deletedBy: ctx.userId }})`
 *   - `deleteMany` → `updateMany` with `deletedAt: null` precondition
 *                    (so a second delete on already-soft-deleted rows is a
 *                    no-op rather than thrashing audit and version)
 *   - All find* / count / aggregate operations inject `deletedAt: null`
 *     into `where` unless the caller explicitly sets `deletedAt` (escape
 *     hatch for repos that need to query the tombstones).
 *
 * Restoration is NOT magic — it must go through `repo.restore(id)`, which
 * sets `deletedAt = null` and stamps `updated_by` after a permission
 * check. Implementing restore here would invite accidental un-deletes via
 * arbitrary `update({ data: { deletedAt: null } })` calls.
 */
import { Prisma } from '@prisma/client';

import { RequestContextRegistry } from '../../../core/request-context';
import { isAppendOnlyModel, isSoftDeleteModel } from '../scope';

interface MutableArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  __schoolosCtx?: {
    bypassSoftDelete?: { reason: string };
  };
}

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

function applyDeletedAtFilter(args: MutableArgs): void {
  const where = (args.where ?? {}) as Record<string, unknown>;
  // Caller already touched deletedAt — respect their intent (e.g. they
  // want the trash bin).
  if ('deletedAt' in where) {
    return;
  }
  args.where = { ...where, deletedAt: null };
}

export const softDeleteExt = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'schoolos.softDelete',
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          if (!isSoftDeleteModel(model) || isAppendOnlyModel(model)) {
            return query(args);
          }

          const mutable = args as MutableArgs;
          const bypass = mutable.__schoolosCtx?.bypassSoftDelete;
          if (bypass !== undefined) {
            return query(args);
          }

          const ctx = RequestContextRegistry.peek();
          const now = new Date();

          if (operation === 'delete') {
            // We can't change the operation we hand back to Prisma, so we
            // re-route through the model client's `update` to keep the
            // semantic (single row, throw on miss) while persisting the
            // soft-delete columns.
            const modelClient = (client as unknown as Record<string, { update: (a: unknown) => Promise<unknown> } | undefined>)[
              decapitalise(model)
            ];
            if (modelClient === undefined) {
              throw new Error(`soft-delete extension: model "${model}" missing on client`);
            }
            return modelClient.update({
              where: mutable.where,
              data: { deletedAt: now, deletedBy: ctx?.userId ?? null },
            });
          }

          if (operation === 'deleteMany') {
            const where = (mutable.where ?? {}) as Record<string, unknown>;
            const modelClient = (client as unknown as Record<string, { updateMany: (a: unknown) => Promise<unknown> } | undefined>)[
              decapitalise(model)
            ];
            if (modelClient === undefined) {
              throw new Error(`soft-delete extension: model "${model}" missing on client`);
            }
            return modelClient.updateMany({
              where: { ...where, deletedAt: null },
              data: { deletedAt: now, deletedBy: ctx?.userId ?? null },
            });
          }

          if (READ_OPERATIONS.has(operation)) {
            applyDeletedAtFilter(mutable);
          }

          return query(args);
        },
      },
    },
  }),
);

function decapitalise(name: string): string {
  return name.length === 0 ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}
