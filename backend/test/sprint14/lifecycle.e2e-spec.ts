/**
 * Sprint 14 e2e — School lifecycle saga.
 *
 * Walks a tenant through the full lifecycle graph using the REAL
 * SchoolLifecycleService and TrialService bolted onto in-memory repo
 * fakes. Asserts:
 *   - TRIAL → extend (cap respected) → activate (needs plan)
 *   - ACTIVE → suspend (sessions revoked) → reactivate
 *   - cancel is terminal — no further transitions accepted
 *   - every transition emits exactly one outbox event with the right topic
 *   - trial-expiry job moves overdue trials to EXPIRED in one batch
 */
import { ProvisioningOutboxTopics } from '../../src/core/provisioning/provisioning.constants';
import {
  InvalidLifecycleTransitionError,
  PlanNotAssignedError,
  SchoolAlreadyCancelledError,
  TrialExtensionLimitError,
} from '../../src/core/provisioning/provisioning.errors';
import { buildSprint14Harness } from './helpers';

describe('Sprint 14 e2e — School lifecycle saga', () => {
  it('walks TRIAL → extend → activate → suspend → reactivate → cancel and emits the right outbox sequence', async () => {
    const h = buildSprint14Harness();
    h.seedSchool({ id: 's-1' });

    // Extend trial once.
    const afterExtend = await h.trials.extend({
      schoolId: 's-1',
      expectedVersion: 1,
      additionalDays: 14,
      reason: 'late onboarding',
    });
    expect(afterExtend.trialExtendedCount).toBe(1);
    expect(afterExtend.trialEndDate?.toISOString()).toBe('2026-07-15T00:00:00.000Z');

    // Activate — requires a plan, which the seed provided.
    const afterActivate = await h.lifecycle.activate('s-1', afterExtend.version);
    expect(afterActivate.lifecycleStatus).toBe('ACTIVE');
    expect(afterActivate.status).toBe('active');
    expect(h.getSchool('s-1')?.planStatus).toBe('ACTIVE');

    // Suspend — revokes sessions on the way through.
    const afterSuspend = await h.lifecycle.suspend(
      's-1',
      afterActivate.version,
      'Non-payment',
    );
    expect(afterSuspend.lifecycleStatus).toBe('SUSPENDED');
    expect(h.getSchool('s-1')?.suspendedReason).toBe('Non-payment');
    expect(h.sessionUpdateMany).toHaveBeenCalledTimes(1);

    // Reactivate from SUSPENDED → ACTIVE.
    const afterReactivate = await h.lifecycle.reactivate('s-1', afterSuspend.version);
    expect(afterReactivate.lifecycleStatus).toBe('ACTIVE');

    // Cancel — terminal, revokes sessions again.
    const afterCancel = await h.lifecycle.cancel(
      's-1',
      afterReactivate.version,
      'Customer churn',
    );
    expect(afterCancel.lifecycleStatus).toBe('CANCELLED');
    expect(h.getSchool('s-1')?.cancelledAt).not.toBeNull();
    expect(h.getSchool('s-1')?.planStatus).toBe('CANCELLED');
    expect(h.sessionUpdateMany).toHaveBeenCalledTimes(2);

    // Topic timeline (extension + 4 lifecycle moves).
    expect(h.outboxTopics()).toEqual([
      ProvisioningOutboxTopics.TRIAL_EXTENDED,
      ProvisioningOutboxTopics.SCHOOL_ACTIVATED,
      ProvisioningOutboxTopics.SCHOOL_SUSPENDED,
      ProvisioningOutboxTopics.SCHOOL_REACTIVATED,
      ProvisioningOutboxTopics.SCHOOL_CANCELLED,
    ]);

    // SUSPENDED payload carries the reason + the revocation count.
    const suspended = h.outboxByTopic(ProvisioningOutboxTopics.SCHOOL_SUSPENDED)[0];
    expect(suspended?.payload).toMatchObject({ reason: 'Non-payment' });
  });

  it('refuses to activate a TRIAL school with no plan and refuses re-cancellation', async () => {
    const h = buildSprint14Harness();
    h.seedSchool({ id: 's-no-plan', planId: null, planStatus: null });

    await expect(h.lifecycle.activate('s-no-plan', 1)).rejects.toBeInstanceOf(
      PlanNotAssignedError,
    );

    h.seedSchool({ id: 's-cancelled', lifecycleStatus: 'CANCELLED' });
    await expect(
      h.lifecycle.cancel('s-cancelled', 1, 'duplicate'),
    ).rejects.toBeInstanceOf(SchoolAlreadyCancelledError);
  });

  it('enforces the trial-extension cap and refuses extensions on non-TRIAL schools', async () => {
    const h = buildSprint14Harness();
    // At the cap — TRIAL_EXTENSION_MAX_COUNT = 3.
    h.seedSchool({ id: 's-capped', trialExtendedCount: 3 });
    await expect(
      h.trials.extend({ schoolId: 's-capped', expectedVersion: 1, additionalDays: 7 }),
    ).rejects.toBeInstanceOf(TrialExtensionLimitError);

    h.seedSchool({ id: 's-active', lifecycleStatus: 'ACTIVE', status: 'active' });
    await expect(
      h.trials.extend({ schoolId: 's-active', expectedVersion: 1, additionalDays: 7 }),
    ).rejects.toBeInstanceOf(InvalidLifecycleTransitionError);
  });

  it('the trial-expiry job moves overdue trials to EXPIRED and reports the batch summary', async () => {
    const h = buildSprint14Harness();
    h.seedSchool({
      id: 's-overdue-1',
      slug: 'sun-1',
      trialEndDate: new Date('2026-06-20T00:00:00Z'),
    });
    h.seedSchool({
      id: 's-overdue-2',
      slug: 'sun-2',
      trialEndDate: new Date('2026-06-22T00:00:00Z'),
    });
    h.seedSchool({
      id: 's-fresh',
      slug: 'sun-3',
      trialEndDate: new Date('2026-12-01T00:00:00Z'),
    });
    // ACTIVE — already left TRIAL; the scan must skip it.
    h.seedSchool({
      id: 's-active',
      slug: 'sun-4',
      lifecycleStatus: 'ACTIVE',
      status: 'active',
      trialEndDate: new Date('2026-06-01T00:00:00Z'),
    });

    const result = await h.trialJob.handle(
      { asOf: '2026-06-25T00:00:00Z', batchSize: 10 },
      h.jobCtx(),
    );

    expect(result.scanned).toBe(2);
    expect(result.expired).toBe(2);
    expect(result.errors).toBe(0);
    expect(h.getSchool('s-overdue-1')?.lifecycleStatus).toBe('EXPIRED');
    expect(h.getSchool('s-overdue-2')?.lifecycleStatus).toBe('EXPIRED');
    expect(h.getSchool('s-fresh')?.lifecycleStatus).toBe('TRIAL');
    expect(h.getSchool('s-active')?.lifecycleStatus).toBe('ACTIVE');

    // Two SCHOOL_TRIAL_EXPIRED outbox events.
    expect(
      h.outboxByTopic(ProvisioningOutboxTopics.SCHOOL_TRIAL_EXPIRED).length,
    ).toBe(2);
  });
});
