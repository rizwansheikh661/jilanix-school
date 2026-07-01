/**
 * AnalyticsService unit specs — Sprint 19.
 *
 * Critical paths:
 *   - getSummary() computes deliveryRate, readRate, failureRate and
 *     retryCount with the formulas documented on the service.
 *   - Zero-divisor guards (total=0 → all rates = 0).
 */
import { withTestContext } from '../../src/core/request-context';
import { AnalyticsService } from '../../src/core/communication-center/analytics/analytics.service';

function makeService() {
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };
  const metrics = {
    count: jest.fn(),
    countScheduled: jest.fn(),
    groupByStatus: jest.fn(),
    groupByChannel: jest.fn().mockResolvedValue([]),
    sumAttempts: jest.fn(),
  };
  const svc = new AnalyticsService(featureFlags as never, metrics as never);
  return { svc, featureFlags, metrics };
}

describe('AnalyticsService.getSummary', () => {
  it('computes delivery/read/failure rates and retryCount = sumAttempts - total', async () => {
    const t = makeService();
    // order: total, DELIVERED, READ, FAILED, DEAD_LETTER
    t.metrics.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(80) // DELIVERED
      .mockResolvedValueOnce(40) // READ
      .mockResolvedValueOnce(10) // FAILED
      .mockResolvedValueOnce(5); // DEAD_LETTER
    t.metrics.sumAttempts.mockResolvedValueOnce(125); // 25 retries beyond first attempt

    const out = await withTestContext({ schoolId: 'school-1' }, () => t.svc.getSummary({}));

    expect(out.total).toBe(100);
    expect(out.delivered).toBe(80);
    expect(out.read).toBe(40);
    expect(out.failed).toBe(15);
    expect(out.deliveryRate).toBeCloseTo(0.8);
    expect(out.readRate).toBeCloseTo(0.5); // 40 / 80
    expect(out.failureRate).toBeCloseTo(0.15);
    expect(out.retryCount).toBe(25);
  });

  it('returns zero rates when total=0', async () => {
    const t = makeService();
    t.metrics.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    t.metrics.sumAttempts.mockResolvedValueOnce(0);

    const out = await withTestContext({ schoolId: 'school-1' }, () => t.svc.getSummary({}));
    expect(out.deliveryRate).toBe(0);
    expect(out.readRate).toBe(0);
    expect(out.failureRate).toBe(0);
    expect(out.retryCount).toBe(0);
  });
});
