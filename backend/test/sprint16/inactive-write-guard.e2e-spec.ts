/**
 * Sprint 16 e2e — SubscriptionWriteGuardInterceptor behaviour.
 *
 * Drives the interceptor through:
 *   - GET request -> bypassed (no guard call).
 *   - POST with platform context (no schoolId) -> bypassed.
 *   - POST with tenant context + ACTIVE subscription -> guard passes.
 *   - POST with tenant context + EXPIRED subscription -> throws
 *     SubscriptionInactiveError before the handler runs.
 *   - POST with @AllowWhenInactive() metadata on the class even when
 *     EXPIRED -> bypassed (handler runs).
 */
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { RequestContextRegistry } from '../../src/core/request-context';
import { ALLOW_WHEN_INACTIVE_KEY } from '../../src/core/subscription/guard/allow-when-inactive.decorator';
import { SubscriptionWriteGuardInterceptor } from '../../src/core/subscription/guard/subscription-write-guard.interceptor';
import { SubscriptionInactiveError } from '../../src/core/subscription/subscription.errors';

function makeCtx(method: string, opts: { allowWhenInactive?: boolean } = {}) {
  const handler = function fakeHandler() {};
  const klass = class FakeController {};
  if (opts.allowWhenInactive === true) {
    Reflect.defineMetadata(ALLOW_WHEN_INACTIVE_KEY, true, klass);
  }
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
    getHandler: () => handler,
    getClass: () => klass,
  } as never;
}

const nextHandled = { handle: () => of('OK') };

function inTenantCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: 's-1',
    userId: 'u-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function inPlatformCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ actorScope: 'global' });
  return RequestContextRegistry.run(ctx, fn);
}

function buildInterceptor(guardAssertImpl: () => Promise<void>) {
  const guard = {
    assertMutationAllowed: jest.fn(guardAssertImpl),
  };
  const interceptor = new SubscriptionWriteGuardInterceptor(new Reflector(), guard as never);
  return { interceptor, guard };
}

describe('Sprint 16 e2e — SubscriptionWriteGuardInterceptor', () => {
  it('bypasses GET, platform-ctx, and @AllowWhenInactive() routes; enforces tenant writes', async () => {
    // 1. GET bypasses regardless of status.
    {
      const { interceptor, guard } = buildInterceptor(async () => {
        throw new Error('should not be called');
      });
      const out = await inTenantCtx(async () => {
        const obs = await interceptor.intercept(makeCtx('GET'), nextHandled as never);
        return obs.toPromise();
      });
      expect(out).toBe('OK');
      expect(guard.assertMutationAllowed).not.toHaveBeenCalled();
    }

    // 2. Platform context (no schoolId) bypasses.
    {
      const { interceptor, guard } = buildInterceptor(async () => {
        throw new Error('should not be called');
      });
      const out = await inPlatformCtx(async () => {
        const obs = await interceptor.intercept(makeCtx('POST'), nextHandled as never);
        return obs.toPromise();
      });
      expect(out).toBe('OK');
      expect(guard.assertMutationAllowed).not.toHaveBeenCalled();
    }

    // 3. Tenant POST with usable status: guard passes, handler runs.
    {
      const { interceptor, guard } = buildInterceptor(async () => undefined);
      const out = await inTenantCtx(async () => {
        const obs = await interceptor.intercept(makeCtx('POST'), nextHandled as never);
        return obs.toPromise();
      });
      expect(out).toBe('OK');
      expect(guard.assertMutationAllowed).toHaveBeenCalledWith('s-1');
    }

    // 4. Tenant POST with inactive status: interceptor surfaces the error.
    {
      const { interceptor } = buildInterceptor(async () => {
        throw new SubscriptionInactiveError('s-1', 'EXPIRED');
      });
      await expect(
        inTenantCtx(() => interceptor.intercept(makeCtx('POST'), nextHandled as never)),
      ).rejects.toBeInstanceOf(SubscriptionInactiveError);
    }

    // 5. Tenant POST with @AllowWhenInactive() class metadata: bypassed even
    //    if the guard would have thrown.
    {
      const { interceptor, guard } = buildInterceptor(async () => {
        throw new SubscriptionInactiveError('s-1', 'EXPIRED');
      });
      const out = await inTenantCtx(async () => {
        const obs = await interceptor.intercept(
          makeCtx('POST', { allowWhenInactive: true }),
          nextHandled as never,
        );
        return obs.toPromise();
      });
      expect(out).toBe('OK');
      expect(guard.assertMutationAllowed).not.toHaveBeenCalled();
    }
  });
});
