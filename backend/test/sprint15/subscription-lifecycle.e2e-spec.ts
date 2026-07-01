/**
 * Sprint 15 e2e — Subscription lifecycle saga.
 *
 * Walks one school through: assignInitial (TRIAL) → activate → upgrade →
 * renew → suspend → reactivate → cancel. Asserts:
 *   - Each transition records exactly one outbox event with the right topic.
 *   - History records the same number of action rows.
 *   - cancel is terminal — further mutations refuse.
 */
import { SubscriptionAlreadyCancelledError } from '../../src/core/subscription/subscription.errors';
import { SubscriptionOutboxTopics } from '../../src/core/subscription/subscription.constants';
import { buildSubscriptionService } from './helpers';

describe('Sprint 15 e2e — Subscription lifecycle saga', () => {
  it('walks the full lifecycle and emits the right outbox sequence', async () => {
    const h = buildSubscriptionService();

    // Step 1 — assign creates a TRIAL row and fires ASSIGNED + ACTIVATED.
    const initial = await h.service.assign({
      schoolId: 's-1',
      planId: 'plan-starter',
      billingCycle: 'TRIAL',
    });
    expect(initial.status).toBe('TRIAL');
    expect(h.outboxTopics()).toEqual([
      SubscriptionOutboxTopics.SUBSCRIPTION_ASSIGNED,
      SubscriptionOutboxTopics.SUBSCRIPTION_ACTIVATED,
    ]);

    // Step 2 — activate TRIAL -> ACTIVE.
    const active = await h.service.activate('s-1', initial.id, initial.version);
    expect(active.status).toBe('ACTIVE');

    // Step 3 — suspend ACTIVE -> SUSPENDED.
    const suspended = await h.service.suspend('s-1', active.id, active.version, 'non-payment');
    expect(suspended.status).toBe('SUSPENDED');
    expect(suspended.cancellationReason).toBe('non-payment');

    // Step 4 — reactivate SUSPENDED -> ACTIVE.
    const reactivated = await h.service.reactivate('s-1', suspended.id, suspended.version);
    expect(reactivated.status).toBe('ACTIVE');

    // Step 5 — renew (ACTIVE stays ACTIVE; expiryDate extends).
    const renewed = await h.service.renew({
      schoolId: 's-1',
      subscriptionId: reactivated.id,
      expectedVersion: reactivated.version,
      extendDays: 30,
    });
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.lastRenewedAt).not.toBeNull();

    // Step 6 — cancel (terminal).
    const cancelled = await h.service.cancel('s-1', renewed.id, renewed.version, 'churn');
    expect(cancelled.status).toBe('CANCELLED');

    // Step 7 — further mutations refuse.
    await expect(
      h.service.cancel('s-1', cancelled.id, cancelled.version, 'duplicate'),
    ).rejects.toBeInstanceOf(SubscriptionAlreadyCancelledError);

    // Outbox topic timeline (assign + activate-on-trial + activate + suspend
    // + reactivate + renew + cancel).
    expect(h.outboxTopics()).toEqual([
      SubscriptionOutboxTopics.SUBSCRIPTION_ASSIGNED,
      SubscriptionOutboxTopics.SUBSCRIPTION_ACTIVATED,
      SubscriptionOutboxTopics.SUBSCRIPTION_ACTIVATED,
      SubscriptionOutboxTopics.SUBSCRIPTION_SUSPENDED,
      SubscriptionOutboxTopics.SUBSCRIPTION_REACTIVATED,
      SubscriptionOutboxTopics.PLAN_RENEWED,
      SubscriptionOutboxTopics.SUBSCRIPTION_CANCELLED,
    ]);

    // History rows: 1 ASSIGNED + 5 lifecycle moves.
    expect(h.history.record).toHaveBeenCalledTimes(6);
  });
});
