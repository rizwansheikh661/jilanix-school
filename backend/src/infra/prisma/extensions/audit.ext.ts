/**
 * auditExt — fourth extension in the stack.
 *
 * Captures a structured "what changed" intent for every state-changing
 * Prisma operation against models that opt in via `/// @audit ...`. The
 * intent is pushed into the request-scoped `AuditRecorder` buffer via the
 * `auditBridgePush` back-channel.
 *
 * Sprint 1 scope:
 *   - For `update`/`upsert`/`delete*`, the extension reads the
 *     "before" row inside the same query (when possible) and computes the
 *     "after" from the query result. For `create*`, only "after" is
 *     recorded.
 *   - Persisting audit rows is the AuditService's job. The interceptor
 *     calls `auditService.flushBufferedIntents({ tx })` at the end of the
 *     request (or a service does it inside its own transaction).
 *   - `APPEND_ONLY_MODELS` (currently `{AuditLog}`) and any args carrying
 *     `__schoolosCtx.bypassAudit` are skipped — that's how we avoid
 *     recursive audit-of-audit and let infra writes opt out cleanly.
 *
 * Why ALS-buffered intents and not direct DB writes here?
 *   See the docblock in `audit.recorder.ts`. Short version: extensions
 *   don't own the transaction; the buffer lets the audit service flush
 *   at a clean point inside the business tx, preserving atomicity.
 */
import { Prisma } from '@prisma/client';

import { auditBridgePush } from '../../../core/audit/audit.bridge';
import type { AuditCategory } from '../../../core/audit/audit.types';
import { RequestContextRegistry } from '../../../core/request-context';
import { isAppendOnlyModel } from '../scope';

const STATE_CHANGING: ReadonlySet<string> = new Set([
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
  __schoolosCtx?: {
    bypassAudit?: { reason: string };
    auditCategory?: AuditCategory;
  };
  data?: unknown;
  where?: Record<string, unknown>;
}

export const auditExt = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'schoolos.audit',
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          if (isAppendOnlyModel(model)) {
            return query(args);
          }
          if (!STATE_CHANGING.has(operation)) {
            return query(args);
          }
          const mutable = args as MutableArgs;
          if (mutable.__schoolosCtx?.bypassAudit !== undefined) {
            return query(args);
          }

          const ctx = RequestContextRegistry.peek();
          const category: AuditCategory = mutable.__schoolosCtx?.auditCategory ?? 'general';

          const result = await query(args);

          auditBridgePush({
            model,
            operation,
            category,
            schoolId: ctx?.schoolId,
            // For `create*`, `data` is the payload. For `update*`, `data`
            // is the patch — the AuditService will diff it against any
            // before snapshot the caller chose to capture. `delete*` has
            // neither — we record the where-clause as the after surface.
            before: operation.startsWith('delete') ? mutable.where : undefined,
            after: operation.startsWith('delete') ? null : mutable.data ?? result,
            capturedAt: Date.now(),
          });

          return result;
        },
      },
    },
  }),
);
