/**
 * SubscriptionWriteGuardInterceptor — blocks all tenant mutations when the
 * caller's Subscription is not in a usable status (TRIAL / ACTIVE / EXPIRING).
 *
 * - Read methods (GET / HEAD / OPTIONS) always pass.
 * - Platform context (no schoolId in RequestContext) always passes — super-
 *   admin lifecycle ops must not be self-blocked.
 * - Routes/controllers annotated with @AllowWhenInactive() pass regardless
 *   (auth flows, super-admin reactivate/cancel, etc.).
 * - Otherwise calls `guard.assertMutationAllowed(schoolId)` which throws
 *   SubscriptionInactiveError (→ HTTP 403 via the global filter).
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';

import { RequestContextRegistry } from '../../request-context';
import { ALLOW_WHEN_INACTIVE_KEY } from './allow-when-inactive.decorator';
import { SubscriptionGuardService } from './subscription-guard.service';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class SubscriptionWriteGuardInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly guard: SubscriptionGuardService,
  ) {}

  public async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest<{ method?: string }>();
    if (req?.method !== undefined && READ_ONLY_METHODS.has(req.method)) {
      return next.handle();
    }

    const reqCtx = RequestContextRegistry.peek();
    const schoolId = reqCtx?.schoolId;
    if (schoolId === undefined) return next.handle();

    const allow = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_WHEN_INACTIVE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (allow === true) return next.handle();

    await this.guard.assertMutationAllowed(schoolId);
    return next.handle();
  }
}
