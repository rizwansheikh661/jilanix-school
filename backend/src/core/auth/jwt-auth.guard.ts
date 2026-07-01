/**
 * JwtAuthGuard — global guard that enforces JWT auth on every route
 * except those marked `@Public()`.
 *
 * Lifecycle on a request:
 *   1. RequestContextMiddleware bound a base context with `actorScope:
 *      'public'` (no user, no tenant).
 *   2. This guard runs (registered via APP_GUARD in CoreModule).
 *   3. If the route is `@Public()`, we let it through unchanged.
 *   4. Otherwise we delegate to passport-jwt → JwtStrategy → AuthPrincipal.
 *   5. We upgrade the RequestContext with the principal so downstream
 *      code (Prisma tenant-scope, audit, logger bindings) sees the
 *      tenant + user without re-parsing the JWT.
 *
 * Errors are translated to the canonical AuthError taxonomy so the
 * GlobalExceptionFilter renders them as `UNAUTHENTICATED` envelopes
 * with `details.reason`. Without this, passport's own `UnauthorizedException`
 * would leak as a generic 401 with no `reason` discriminator.
 */
import {
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import {
  RequestContextRegistry,
} from '../request-context';
import {
  AuthError,
  TokenExpiredError,
  TokenMalformedError,
} from './auth.errors';
import type { AuthPrincipal } from './auth.types';
import { IS_PUBLIC_METADATA_KEY } from './token/token.constants';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  public override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * Passport's default `handleRequest` throws `UnauthorizedException` on
   * any failure — we replace that with our domain auth errors so the
   * filter can render `details.reason`.
   *
   * On success, this is also where we upgrade the RequestContext, since
   * `super.canActivate` resolves before the controller runs but after
   * passport has set `req.user`.
   */
  public override handleRequest<T extends AuthPrincipal>(
    err: Error | null,
    user: T | false,
    info: Error | { name?: string; message?: string } | undefined,
    context: ExecutionContext,
    _status?: unknown,
  ): T {
    if (err instanceof AuthError) {
      throw err;
    }
    if (err !== null && err !== undefined) {
      // Re-throw any non-auth error untouched (e.g. DB outage during
      // the strategy.validate() lookups).
      throw err;
    }
    if (user === false || user === undefined) {
      throw mapPassportInfoToAuthError(info);
    }

    this.upgradeRequestContext(context, user);
    return user;
  }

  private upgradeRequestContext(_context: ExecutionContext, principal: AuthPrincipal): void {
    const current = RequestContextRegistry.peek();
    if (current === undefined) {
      // We expect RequestContextMiddleware to have run; if it hasn't,
      // skip the upgrade rather than throw — guard failures must read
      // as 401, not 500.
      return;
    }
    RequestContextRegistry.upgrade({
      schoolId: principal.schoolId ?? undefined,
      userId: principal.userId,
      actorScope: principal.actorScope,
      roleIds: [...principal.roleIds],
    });
  }
}

function mapPassportInfoToAuthError(
  info: Error | { name?: string; message?: string } | undefined,
): AuthError {
  const name = info?.name;
  if (name === 'TokenExpiredError') {
    return new TokenExpiredError();
  }
  // Everything else from passport-jwt (JsonWebTokenError, NoAuthToken,
  // signature mismatch, audience mismatch) → malformed.
  return new TokenMalformedError();
}
