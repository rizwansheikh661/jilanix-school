/**
 * Pure-helper specs for `computeFine` (exported via `__test__`).
 *
 * The helper is policy-agnostic and stateless — it takes invoice totals,
 * dueDate, the policy, and "now", and returns `{amount, daysOverdue, ...}`.
 * Terminal-status handling (VOID/PAID/REFUNDED) lives in the service
 * wrapper, not the pure helper, so those cases are exercised at the
 * service level instead.
 */
import { __test__ } from './fee-invoice.service';

const { computeFine } = __test__;

const POLICY_BASE = {
  id: 'pol-1',
  gracePeriodDays: 5,
  capAmount: null as number | null,
};

function days(date: string): Date {
  return new Date(date);
}

describe('computeFine (pure helper)', () => {
  it('within grace period → 0 fine, daysOverdue=0', () => {
    const invoice = { total: 10000, dueDate: days('2026-06-10T00:00:00.000Z') };
    // grace = 5 days, today = 2026-06-14 → still within grace.
    const today = days('2026-06-14T00:00:00.000Z');
    const policy = { ...POLICY_BASE, type: 'FLAT_PER_DAY' as const, value: 50 };
    const result = computeFine(invoice, policy, today);
    expect(result.amount).toBe(0);
    expect(result.daysOverdue).toBe(0);
  });

  it('FLAT_ONCE past grace returns policy.value regardless of daysOverdue', () => {
    const invoice = { total: 10000, dueDate: days('2026-05-01T00:00:00.000Z') };
    // grace = 5 days → grace-end 2026-05-06; today 2026-06-20 → ~45 days late.
    const today = days('2026-06-20T00:00:00.000Z');
    const policy = { ...POLICY_BASE, type: 'FLAT_ONCE' as const, value: 200 };
    const result = computeFine(invoice, policy, today);
    expect(result.amount).toBe(200);
    expect(result.daysOverdue).toBeGreaterThan(0);
  });

  it('FLAT_PER_DAY 50 × 5 days = 250', () => {
    const invoice = { total: 10000, dueDate: days('2026-06-01T00:00:00.000Z') };
    // grace 5 → grace-end 2026-06-06; today 2026-06-11 → 5 days overdue.
    const today = days('2026-06-11T00:00:00.000Z');
    const policy = { ...POLICY_BASE, type: 'FLAT_PER_DAY' as const, value: 50 };
    const result = computeFine(invoice, policy, today);
    expect(result.daysOverdue).toBe(5);
    expect(result.amount).toBe(250);
  });

  it('PERCENT_PER_DAY 1% × 10000 × 10 days = 1000', () => {
    const invoice = { total: 10000, dueDate: days('2026-06-01T00:00:00.000Z') };
    // grace 5 → grace-end 2026-06-06; today 2026-06-16 → 10 days overdue.
    const today = days('2026-06-16T00:00:00.000Z');
    const policy = {
      ...POLICY_BASE,
      type: 'PERCENT_PER_DAY' as const,
      value: 1, // 1%
    };
    const result = computeFine(invoice, policy, today);
    expect(result.daysOverdue).toBe(10);
    expect(result.amount).toBe(1000);
  });

  it('capped at capAmount when raw computation exceeds the cap', () => {
    const invoice = { total: 10000, dueDate: days('2026-06-01T00:00:00.000Z') };
    // grace 5 → grace-end 2026-06-06; today 2026-06-16 → 10 days overdue.
    const today = days('2026-06-16T00:00:00.000Z');
    const policy = {
      ...POLICY_BASE,
      capAmount: 300,
      type: 'FLAT_PER_DAY' as const,
      value: 50, // 50 * 10 = 500, capped to 300.
    };
    const result = computeFine(invoice, policy, today);
    expect(result.amount).toBe(300);
    expect(result.cappedAt).toBe(300);
  });

  it('zero days overdue (exactly on grace-end) returns 0', () => {
    const invoice = { total: 10000, dueDate: days('2026-06-01T00:00:00.000Z') };
    // grace 5 → grace-end 2026-06-06; today = exactly grace-end → 0 days.
    const today = days('2026-06-06T00:00:00.000Z');
    const policy = { ...POLICY_BASE, type: 'FLAT_PER_DAY' as const, value: 50 };
    const result = computeFine(invoice, policy, today);
    expect(result.amount).toBe(0);
    expect(result.daysOverdue).toBe(0);
  });

  it('FLAT_ONCE with cap below value still caps', () => {
    const invoice = { total: 10000, dueDate: days('2026-05-01T00:00:00.000Z') };
    const today = days('2026-06-20T00:00:00.000Z');
    const policy = {
      ...POLICY_BASE,
      capAmount: 100,
      type: 'FLAT_ONCE' as const,
      value: 500,
    };
    const result = computeFine(invoice, policy, today);
    expect(result.amount).toBe(100);
    expect(result.cappedAt).toBe(100);
  });
});
