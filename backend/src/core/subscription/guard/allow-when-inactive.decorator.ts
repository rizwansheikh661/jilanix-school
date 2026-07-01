import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key & decorator that opts a controller or handler out of the
 * SubscriptionWriteGuardInterceptor. Apply at class level on controllers
 * that must remain reachable while a school's Subscription is EXPIRED /
 * SUSPENDED / CANCELLED (auth flows so a locked-out admin can still log in
 * and change credentials, plus super-admin lifecycle/subscription paths).
 */
export const ALLOW_WHEN_INACTIVE_KEY = 'subscription:allow_when_inactive';

export const AllowWhenInactive = (): ClassDecorator & MethodDecorator =>
  SetMetadata(ALLOW_WHEN_INACTIVE_KEY, true);
