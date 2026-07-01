/**
 * Sprint 15 unit — subscription-transitions.ts pure state machine.
 *
 * Asserts:
 *   1. The seeded matrix matches the documented graph (allowed + rejected).
 *   2. CANCELLED is terminal — every other state is rejected as the
 *      destination.
 *   3. assertSubscriptionTransition throws the typed error.
 */
import {
  assertSubscriptionTransition,
  isSubscriptionTransitionAllowed,
  isTerminal,
  SUBSCRIPTION_TRANSITIONS,
} from '../../src/core/subscription/subscription/subscription-transitions';
import { InvalidSubscriptionTransitionError } from '../../src/core/subscription/subscription.errors';
import type { SubscriptionStatusValue } from '../../src/core/subscription/subscription.types';

describe('Sprint 15 unit — subscription transitions', () => {
  it('allows the documented graph and rejects everything else', () => {
    // Sample of allowed transitions from each state.
    expect(isSubscriptionTransitionAllowed('PENDING', 'TRIAL')).toBe(true);
    expect(isSubscriptionTransitionAllowed('PENDING', 'ACTIVE')).toBe(true);
    expect(isSubscriptionTransitionAllowed('TRIAL', 'ACTIVE')).toBe(true);
    expect(isSubscriptionTransitionAllowed('ACTIVE', 'EXPIRING')).toBe(true);
    expect(isSubscriptionTransitionAllowed('EXPIRING', 'ACTIVE')).toBe(true);
    expect(isSubscriptionTransitionAllowed('EXPIRING', 'EXPIRED')).toBe(true);
    expect(isSubscriptionTransitionAllowed('EXPIRED', 'ACTIVE')).toBe(true);
    expect(isSubscriptionTransitionAllowed('SUSPENDED', 'ACTIVE')).toBe(true);

    // Rejections.
    expect(isSubscriptionTransitionAllowed('TRIAL', 'EXPIRING')).toBe(false);
    expect(isSubscriptionTransitionAllowed('ACTIVE', 'PENDING')).toBe(false);
    expect(isSubscriptionTransitionAllowed('EXPIRED', 'EXPIRING')).toBe(false);
    expect(isSubscriptionTransitionAllowed('SUSPENDED', 'EXPIRED')).toBe(false);
  });

  it('treats CANCELLED as terminal — no outbound transition is permitted', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(SUBSCRIPTION_TRANSITIONS.CANCELLED.length).toBe(0);
    const targets: SubscriptionStatusValue[] = [
      'PENDING', 'TRIAL', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED',
    ];
    for (const to of targets) {
      expect(isSubscriptionTransitionAllowed('CANCELLED', to)).toBe(false);
    }
  });

  it('assertSubscriptionTransition throws InvalidSubscriptionTransitionError on disallowed moves', () => {
    expect(() => assertSubscriptionTransition('ACTIVE', 'TRIAL')).toThrow(
      InvalidSubscriptionTransitionError,
    );
    expect(() => assertSubscriptionTransition('PENDING', 'EXPIRED')).toThrow(
      InvalidSubscriptionTransitionError,
    );
    // Allowed transition does NOT throw.
    expect(() => assertSubscriptionTransition('TRIAL', 'ACTIVE')).not.toThrow();
  });
});
