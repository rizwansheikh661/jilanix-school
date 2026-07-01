/**
 * CommunicationDashboardService unit specs — Sprint 19.
 *
 * Critical paths:
 *   - getSummary() composes 7 counters from the metrics repo. Verifies the
 *     pending bucket sums QUEUED + SENDING and the failed bucket sums
 *     FAILED + DEAD_LETTER. Verifies status filter is stripped from base.
 */
import { withTestContext } from '../../src/core/request-context';
import { CommunicationDashboardService } from '../../src/core/communication-center/dashboard/communication-dashboard.service';

function makeService() {
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };
  const metrics = {
    count: jest.fn(),
    countScheduled: jest.fn(),
    groupByStatus: jest.fn(),
    groupByChannel: jest.fn(),
    sumAttempts: jest.fn(),
  };
  const svc = new CommunicationDashboardService(featureFlags as never, metrics as never);
  return { svc, featureFlags, metrics };
}

describe('CommunicationDashboardService.getSummary', () => {
  it('aggregates 7 counters (pending = QUEUED+SENDING, failed = FAILED+DEAD_LETTER)', async () => {
    const t = makeService();
    // count(...) calls in order:
    //   0: total
    //   1: today
    //   2: QUEUED      (pending sub)
    //   3: SENDING     (pending sub)
    //   3 scheduled (different fn)
    //   4: FAILED      (failed sub)
    //   5: DEAD_LETTER (failed sub)
    //   6: DELIVERED
    //   7: READ
    t.metrics.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(20) // today
      .mockResolvedValueOnce(5) // QUEUED
      .mockResolvedValueOnce(3) // SENDING
      .mockResolvedValueOnce(2) // FAILED
      .mockResolvedValueOnce(1) // DEAD_LETTER
      .mockResolvedValueOnce(70) // DELIVERED
      .mockResolvedValueOnce(40); // READ
    t.metrics.countScheduled.mockResolvedValueOnce(7);

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.getSummary({ status: 'FAILED' }),
    );

    expect(out.totalCommunications).toBe(100);
    expect(out.todayCommunications).toBe(20);
    expect(out.pendingDeliveries).toBe(8); // 5+3
    expect(out.scheduledCommunications).toBe(7);
    expect(out.failedDeliveries).toBe(3); // 2+1
    expect(out.deliveredCommunications).toBe(70);
    expect(out.readCommunications).toBe(40);
    // status filter MUST be stripped from base (would skew total otherwise)
    expect(t.metrics.count).toHaveBeenNthCalledWith(
      1,
      'school-1',
      expect.not.objectContaining({ status: 'FAILED' }),
    );
  });
});
