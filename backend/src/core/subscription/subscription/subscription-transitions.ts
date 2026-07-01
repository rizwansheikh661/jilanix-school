/**
 * subscription-transitions.ts — pure state machine for
 * `subscriptions.status` (Sprint 15 SaaS subscription lifecycle).
 *
 *      from / to →     PENDING TRIAL ACTIVE EXPIRING EXPIRED SUSPENDED CANCELLED
 *      PENDING                  v     v                                 v
 *      TRIAL                          v                v       v        v
 *      ACTIVE                               v          v       v        v
 *      EXPIRING                       v                v                v
 *      EXPIRED                        v                                 v
 *      SUSPENDED                      v                                 v
 *      CANCELLED                                                        (terminal)
 *
 * Notes:
 *   - PENDING is the assignment seed. The same lifecycle row is then
 *     activated into TRIAL or ACTIVE.
 *   - EXPIRING is a soft pre-expiry warning band (set by the daily expiry
 *     scheduler when nextRenewalAt <= now + window). Re-renewing returns to
 *     ACTIVE; tick-past-expiry advances to EXPIRED.
 *   - UPGRADE/DOWNGRADE close the previous Subscription row and open a new
 *     one, so the matrix only governs in-place state moves.
 */
import type { SubscriptionStatusValue } from '../subscription.types';
import { InvalidSubscriptionTransitionError } from '../subscription.errors';

export const SUBSCRIPTION_TRANSITIONS: Readonly<
  Record<SubscriptionStatusValue, ReadonlyArray<SubscriptionStatusValue>>
> = Object.freeze({
  PENDING: Object.freeze(['TRIAL', 'ACTIVE', 'CANCELLED'] as const),
  TRIAL: Object.freeze(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'] as const),
  ACTIVE: Object.freeze(['EXPIRING', 'EXPIRED', 'SUSPENDED', 'CANCELLED'] as const),
  EXPIRING: Object.freeze(['ACTIVE', 'EXPIRED', 'CANCELLED'] as const),
  EXPIRED: Object.freeze(['ACTIVE', 'CANCELLED'] as const),
  SUSPENDED: Object.freeze(['ACTIVE', 'CANCELLED'] as const),
  CANCELLED: Object.freeze([] as const),
});

export function isSubscriptionTransitionAllowed(
  from: SubscriptionStatusValue,
  to: SubscriptionStatusValue,
): boolean {
  return SUBSCRIPTION_TRANSITIONS[from].includes(to);
}

export function assertSubscriptionTransition(
  from: SubscriptionStatusValue,
  to: SubscriptionStatusValue,
): void {
  if (!isSubscriptionTransitionAllowed(from, to)) {
    throw new InvalidSubscriptionTransitionError(from, to);
  }
}

export const TERMINAL_SUBSCRIPTION_STATUS: SubscriptionStatusValue = 'CANCELLED';

export function isTerminal(status: SubscriptionStatusValue): boolean {
  return status === TERMINAL_SUBSCRIPTION_STATUS;
}
