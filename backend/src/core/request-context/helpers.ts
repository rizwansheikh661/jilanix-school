/**
 * Helpers for non-HTTP callers that need to run code inside a bound
 * RequestContext: seed scripts, queue workers, scheduled jobs, tests.
 *
 *   - `runWithSystemContext` — synthesises a "system" context (no user,
 *     `actorScope='global'`) and runs `fn` inside it. Use this for cron
 *     jobs and platform-level boot tasks.
 *
 *   - `runInheritedContext`  — clones the current context with overrides
 *     and runs `fn` inside the new binding. Use this for worker fan-out
 *     (e.g. "process each tenant in parallel").
 *
 *   - `withTestContext`      — test-only: builds a minimal context with
 *     overridable fields. Designed for unit tests of services that call
 *     into Prisma (and therefore need a context).
 */
import { RequestContextRegistry, type RequestContext } from './request-context.service';

export function runWithSystemContext<T>(
  partial: Partial<RequestContext>,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext(partial);
  return RequestContextRegistry.run(ctx, fn);
}

export function runInheritedContext<T>(
  overrides: Partial<RequestContext>,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const ctx = RequestContextRegistry.inherit(overrides);
  return RequestContextRegistry.run(ctx, fn);
}

export function withTestContext<T>(
  partial: Partial<RequestContext>,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    requestId: 'test',
    actorScope: 'tenant',
    ...partial,
  });
  return RequestContextRegistry.run(ctx, fn);
}
