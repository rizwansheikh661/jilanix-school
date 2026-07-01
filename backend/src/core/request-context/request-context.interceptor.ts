/**
 * RequestContextInterceptor — global interceptor that binds the per-request
 * RequestContext for the controller phase using `storage.run`.
 *
 * # Why this exists
 *
 *   RequestContextMiddleware opens a top-level ALS frame with
 *   `actorScope: 'public'` because the auth layer hasn't run yet. The
 *   strategy + guard subsequently call `RequestContextRegistry.upgrade(...)`
 *   which uses `AsyncLocalStorage.enterWith` to mutate the frame on the
 *   *current* async resource. That works for the strategy's own DB reads,
 *   but the controller is dispatched via a continuation that does not
 *   always inherit the upgraded frame — Passport's verify-callback hop
 *   reverts the store for any await chain that doesn't share the upgrading
 *   resource. The result was sporadic `TenantContextMissingError` on
 *   /auth/logout, /auth/logout-all, /auth/first-login/change-password and
 *   the @Public() refresh / password-reset routes.
 *
 *   This interceptor closes that gap by re-binding the frame explicitly,
 *   exactly once, at the point in the Nest pipeline where the principal
 *   is known (after JwtAuthGuard) and the controller is about to be
 *   invoked. It wraps `next.handle()` in `RequestContextRegistry.run`, so
 *   every controller method, every service call, every Prisma query, and
 *   every interceptor that runs AFTER this one sees the same frame.
 *
 * # Lifecycle position
 *
 *   1. RequestContextMiddleware       — binds F0 (actorScope: 'public').
 *   2. TenantResolverMiddleware        — populates req.resolvedTenant.
 *   3. JwtAuthGuard / PermissionsGuard — sets req.user (when not @Public()).
 *   4. *** this interceptor ***        — builds finalCtx from req.user +
 *                                        req.resolvedTenant + current frame,
 *                                        wraps next.handle() in storage.run.
 *   5. AuditInterceptor                — sees finalCtx via peek(). Correct.
 *   6. Controller → AuthService → Prisma — all inside finalCtx. Correct.
 *
 * # What this does NOT change
 *
 *   - Middleware, strategy, guard, repositories, and Prisma extension are
 *     untouched. The existing upgrade() calls remain in place and become
 *     harmlessly redundant for routes that pass through this interceptor.
 *   - For @Public() routes without a principal, the interceptor just
 *     re-binds the existing frame unchanged. Services that need a tenant
 *     context on @Public() paths (refresh, password-reset/*) are expected
 *     to wrap their tenant-scoped work in `runInheritedContext(...)` after
 *     they have derived a schoolId — see AuthService.refresh and
 *     PasswordResetService.request/confirm.
 */
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import type { AuthPrincipal } from '../auth/auth.types';
import {
  RequestContextRegistry,
  type RequestContext,
} from './request-context.service';
import type { ResolvedTenant } from './tenant-resolver.service';

type RequestLike = {
  user?: AuthPrincipal;
  resolvedTenant?: ResolvedTenant;
};

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  public intercept(
    execCtx: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    // Only HTTP transports carry req.user / req.resolvedTenant. Other
    // transports (microservices, future gRPC) just see the existing frame.
    if (execCtx.getType() !== 'http') {
      return next.handle();
    }

    const req = execCtx.switchToHttp().getRequest<RequestLike>();
    const principal = req.user;
    const resolved = req.resolvedTenant;
    const current = RequestContextRegistry.peek();

    // If the middleware never bound a frame (unexpected on HTTP — would
    // mean RequestContextMiddleware was bypassed), fall through unchanged
    // rather than throw. Guard failures should read as 401, not 500.
    if (current === undefined) {
      return next.handle();
    }

    const overrides = this.buildOverrides(principal, resolved);
    const finalCtx = RequestContextRegistry.inherit(overrides);

    return new Observable((subscriber) => {
      RequestContextRegistry.run(finalCtx, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }

  private buildOverrides(
    principal: AuthPrincipal | undefined,
    resolved: ResolvedTenant | undefined,
  ): Partial<RequestContext> {
    // Authenticated routes: the JWT principal is the source of truth.
    // schoolId may be null (global actor) — collapse to undefined so the
    // extension treats the actor as platform-scoped.
    if (principal !== undefined) {
      return {
        schoolId: principal.schoolId ?? undefined,
        userId: principal.userId,
        actorScope: principal.actorScope,
        roleIds: [...principal.roleIds],
      };
    }

    // @Public() routes: bind whatever the host resolver inferred. Services
    // that need a tenant context for anonymous flows (refresh, password
    // reset) wrap their own work in runInheritedContext after deriving the
    // schoolId from the request payload — the interceptor only carries
    // what's already known at request boundary.
    if (resolved?.scope === 'tenant' && resolved.schoolId !== undefined) {
      return { schoolId: resolved.schoolId };
    }

    return {};
  }
}
