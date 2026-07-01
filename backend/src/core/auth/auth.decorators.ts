/**
 * Auth decorators — `@Public()`, `@CurrentUser()`, `@CurrentTenant()`.
 *
 *   - `@Public()` opts a route OUT of the global JwtAuthGuard. We attach
 *      a single boolean via SetMetadata under a stable key so the guard
 *      can read it via Reflector.
 *
 *   - `@CurrentUser()` returns the AuthPrincipal that the JwtAuthGuard
 *      attached to `request.user` after a successful verification.
 *
 *   - `@CurrentTenant()` returns the schoolId from the principal — handy
 *      when a handler only needs the tenant id and would otherwise have
 *      to reach into `currentUser.schoolId`.
 */
import {
  type ExecutionContext,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';

import type { AuthPrincipal } from './auth.types';
import { IS_PUBLIC_METADATA_KEY } from './token/token.constants';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_METADATA_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    if (req.user === undefined) {
      throw new Error(
        '@CurrentUser used on a route without authentication. Did you mean @Public()?',
      );
    }
    return req.user;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    if (req.user === undefined) {
      throw new Error('@CurrentTenant used on a route without authentication.');
    }
    return req.user.schoolId;
  },
);
