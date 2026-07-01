/**
 * Sprint 15 unit — SubscriptionService lifecycle orchestration.
 *
 * Asserts:
 *   1. activate emits SUBSCRIPTION_ACTIVATED + writes a history row.
 *   2. cancel is idempotent against the terminal CANCELLED status — second
 *      call throws SubscriptionAlreadyCancelledError.
 *   3. renew extends expiryDate by `extendDays` and lifts EXPIRING back to
 *      ACTIVE.
 */
import { SubscriptionAlreadyCancelledError } from '../../src/core/subscription/subscription.errors';
import { SubscriptionOutboxTopics } from '../../src/core/subscription/subscription.constants';
import { buildSubscriptionService, makeSubscriptionRow } from './helpers';

describe('Sprint 15 unit — SubscriptionService', () => {
  it('activate transitions TRIAL -> ACTIVE, emits SUBSCRIPTION_ACTIVATED, and records history', async () => {
    const h = buildSubscriptionService({
      current: makeSubscriptionRow({ id: 'sub-1', status: 'TRIAL' }),
    });
    const updated = await h.service.activate('s-1', 'sub-1', 1);
    expect(updated.status).toBe('ACTIVE');
    expect(updated.version).toBe(2);
    expect(h.outboxTopics()).toContain(SubscriptionOutboxTopics.SUBSCRIPTION_ACTIVATED);
    expect(h.history.record).toHaveBeenCalledTimes(1);
    expect(h.audit.record).toHaveBeenCalledTimes(1);
  });

  it('cancel marks the row terminal then refuses a second cancel', async () => {
    const h = buildSubscriptionService({
      current: makeSubscriptionRow({ id: 'sub-1', status: 'ACTIVE' }),
    });
    const cancelled = await h.service.cancel('s-1', 'sub-1', 1, 'churn');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe('churn');
    expect(h.outboxTopics()).toContain(SubscriptionOutboxTopics.SUBSCRIPTION_CANCELLED);

    await expect(h.service.cancel('s-1', 'sub-1', 2, 'second time')).rejects.toBeInstanceOf(
      SubscriptionAlreadyCancelledError,
    );
  });

  it('renew extends expiryDate by extendDays and lifts EXPIRING -> ACTIVE', async () => {
    const baseExpiry = new Date('2026-07-01T00:00:00Z');
    const h = buildSubscriptionService({
      current: makeSubscriptionRow({ id: 'sub-1', status: 'EXPIRING', expiryDate: baseExpiry }),
    });
    const renewed = await h.service.renew({
      schoolId: 's-1',
      subscriptionId: 'sub-1',
      expectedVersion: 1,
      extendDays: 30,
    });
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.expiryDate?.toISOString()).toBe(
      new Date(baseExpiry.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(renewed.lastRenewedAt).not.toBeNull();
    expect(h.outboxTopics()).toContain(SubscriptionOutboxTopics.PLAN_RENEWED);
  });
});
