/**
 * RequestContext — AsyncLocalStorage carrier for per-request metadata that
 * needs to be available deep in the call stack without threading it through
 * every function signature.
 *
 * What it carries:
 *   - `requestId`         — correlation ID stamped at the HTTP edge (ULID).
 *   - `traceId`           — W3C trace id (from `traceparent` header, if any).
 *   - `schoolId`          — tenant the caller is acting on (undefined for
 *                            platform actors / unauthenticated probes).
 *   - `userId`            — the authenticated principal, when there is one.
 *   - `actorScope`        — `tenant` | `global` | `public`.
 *   - `roleIds`,
 *     `permissions`       — populated by the auth/RBAC modules in later
 *                            sprints. Sprint 1 always leaves them empty.
 *   - `ip`, `userAgent`,
 *     `clientName`,
 *     `clientVersion`,
 *     `route`, `method`,
 *     `locale`            — request envelope; used by logger and audit.
 *
 * Why static helpers + AsyncLocalStorage instead of NestJS REQUEST injection?
 *   Prisma extensions, queue workers, and seed scripts all need access. Of
 *   those, only HTTP requests have a Nest DI scope, so a request-scoped
 *   provider would not work for the others. AsyncLocalStorage is the
 *   standard Node primitive for this.
 *
 * Sprint 1 scope:
 *   The Auth and RBAC sprints populate the rich identity fields. For now,
 *   the HTTP middleware stamps everything it can know without auth
 *   (requestId/traceId/ip/userAgent/clientName/clientVersion/route/method).
 *   Until JWT lands, `actorScope` defaults to `public`, `userId` is
 *   `undefined`, and `schoolId` is `undefined`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type ActorScope = 'tenant' | 'global' | 'public';

export interface RequestContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly schoolId?: string;
  readonly userId?: string;
  readonly actorScope: ActorScope;
  readonly roleIds: readonly string[];
  readonly permissions: readonly string[];
  readonly impersonatorUserId?: string;
  readonly ip?: string;
  readonly userAgent?: string;
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly route?: string;
  readonly method?: string;
  readonly locale?: string;
  /**
   * Per-request metadata that callers can stash for cross-cutting concerns
   * (e.g. soft-delete reason, audit comment). Must be primitive-only.
   */
  readonly meta: Readonly<Record<string, string | number | boolean>>;
}

const storage = new AsyncLocalStorage<RequestContext>();

export class RequestContextRegistry {
  /** Returns the current context, or `undefined` if none is bound. */
  public static peek(): RequestContext | undefined {
    return storage.getStore();
  }

  /**
   * Returns the current context, throwing if absent. Use this from places
   * that should never run outside a request — controllers, services that
   * assume tenant scope, the tenant-scope extension on TENANT_OWNED reads.
   */
  public static require(): RequestContext {
    const ctx = storage.getStore();
    if (ctx === undefined) {
      throw new Error('RequestContext not bound. Wrap the call in runWithContext().');
    }
    return ctx;
  }

  /** Run `fn` with `ctx` bound for the entire async chain rooted at it. */
  public static run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  }

  /**
   * Build a safe default context for non-HTTP callers (seed scripts, jobs,
   * tests). Caller supplies what they have; everything else gets a sane
   * blank value. The actor scope defaults to `global` so seeds can write
   * platform-only tables without bumping into tenant-scope guards.
   */
  public static makeSystemContext(partial: Partial<RequestContext> = {}): RequestContext {
    return freezeContext({
      requestId: partial.requestId ?? 'system',
      traceId: partial.traceId,
      schoolId: partial.schoolId,
      userId: partial.userId,
      actorScope: partial.actorScope ?? 'global',
      roleIds: [...(partial.roleIds ?? [])],
      permissions: [...(partial.permissions ?? [])],
      impersonatorUserId: partial.impersonatorUserId,
      ip: partial.ip,
      userAgent: partial.userAgent,
      clientName: partial.clientName,
      clientVersion: partial.clientVersion,
      route: partial.route,
      method: partial.method,
      locale: partial.locale,
      meta: { ...(partial.meta ?? {}) },
    });
  }

  /**
   * Build a derived context that inherits the current context plus any
   * overrides. Throws if no context is bound — designed for places that
   * narrow the scope (e.g. a queue worker fanning out per-tenant).
   */
  public static inherit(overrides: Partial<RequestContext>): RequestContext {
    const current = RequestContextRegistry.require();
    return freezeContext({
      ...current,
      ...overrides,
      roleIds: [...(overrides.roleIds ?? current.roleIds)],
      permissions: [...(overrides.permissions ?? current.permissions)],
      meta: { ...current.meta, ...(overrides.meta ?? {}) },
    });
  }

  /**
   * Mutate the bound context for the remainder of the current async chain.
   * Used by JwtAuthGuard to lift `actorScope: 'public'` to a fully
   * authenticated context after the JWT verifies. Implemented on top of
   * `AsyncLocalStorage.enterWith` — the only Node primitive that lets us
   * swap the store for the *current* async resource and have it persist
   * through subsequent awaits.
   *
   * This must NOT be called from non-HTTP entry points (jobs, seeds);
   * those should compose with `runInheritedContext` instead so the swap
   * is scoped to a callback.
   */
  public static upgrade(overrides: Partial<RequestContext>): RequestContext {
    const next = RequestContextRegistry.inherit(overrides);
    storage.enterWith(next);
    return next;
  }
}

function freezeContext(ctx: RequestContext): RequestContext {
  return Object.freeze({
    ...ctx,
    roleIds: Object.freeze([...ctx.roleIds]),
    permissions: Object.freeze([...ctx.permissions]),
    meta: Object.freeze({ ...ctx.meta }),
  });
}
