/**
 * AuditRecorder — request-scoped buffer of audit intents captured by the
 * Prisma `auditExt` extension. Lives in AsyncLocalStorage so it inherits
 * the same lifecycle as RequestContext.
 *
 * Why a buffer, not a direct write?
 *   - `auditExt` runs inside Prisma's query lifecycle, with no access to
 *     the transaction client. Writing to `audit_log` from inside the
 *     extension would either skip the tx (bad) or recurse (worse).
 *   - The buffer lets the interceptor (or any service method that holds
 *     the tx in hand) flush at a clean point — usually right before
 *     committing the business transaction.
 *
 * Discard semantics:
 *   - The buffer is per-request via ALS. When the request ends, ALS
 *     unbinds it. Anything not flushed is dropped on the floor — by
 *     design, because:
 *       1. A non-flushed buffer means the request errored before commit,
 *          in which case the business write rolled back too — recording
 *          an audit for a non-event is worse than no audit.
 *       2. Cross-request leakage would require a global singleton, which
 *          we explicitly do NOT want.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { AuditIntent } from './audit.types';

interface Buffer {
  intents: AuditIntent[];
}

const storage = new AsyncLocalStorage<Buffer>();

export class AuditRecorder {
  /** Open a fresh buffer for the duration of `fn`. */
  public static run<T>(fn: () => T): T {
    return storage.run({ intents: [] }, fn);
  }

  /** Push an intent into the active buffer. No-op if none is bound. */
  public static push(intent: AuditIntent): void {
    const buf = storage.getStore();
    if (buf === undefined) {
      return;
    }
    buf.intents.push(intent);
  }

  /** Snapshot the current buffer's intents and clear it. */
  public static drain(): AuditIntent[] {
    const buf = storage.getStore();
    if (buf === undefined) {
      return [];
    }
    const out = buf.intents;
    buf.intents = [];
    return out;
  }

  /** Inspect without draining — useful in tests. */
  public static peek(): readonly AuditIntent[] {
    return storage.getStore()?.intents ?? [];
  }
}
