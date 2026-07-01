/**
 * correlationExt — innermost extension in the stack (last applied, runs
 * closest to the Prisma engine).
 *
 * Two responsibilities:
 *   1. Surface the per-request correlation context to downstream observers
 *      via `RequestContextRegistry` (already populated by the HTTP layer).
 *   2. Sanitise the args object before it reaches the Prisma engine by
 *      stripping the private `__schoolosCtx` namespace. Callers (and the
 *      outer extensions: tenantScope/audit) use that field to signal
 *      bypass flags and an audit category; Prisma 6 rejects any unknown
 *      argument at the query boundary, so it must not survive past this
 *      point.
 *
 * The earlier design tagged ctx onto args here so other extensions could
 * read it without hitting AsyncLocalStorage. In practice every consumer
 * already calls `RequestContextRegistry.peek()` directly, so the tagging
 * was dead — and worse, it was the source of `Unknown argument
 * __schoolosCtx` engine errors when a caller didn't pre-set the field.
 */
import { Prisma } from '@prisma/client';

export const correlationExt = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'schoolos.correlation',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if (args !== null && typeof args === 'object' && '__schoolosCtx' in args) {
            delete (args as Record<string, unknown>).__schoolosCtx;
          }
          return query(args);
        },
      },
    },
  }),
);
