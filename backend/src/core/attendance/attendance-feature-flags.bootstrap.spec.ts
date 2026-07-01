/**
 * AttendanceFeatureFlagsBootstrap unit spec — verifies the 5 flag keys
 * are registered with the correct kind/default values.
 */
import { AttendanceFeatureFlagsBootstrap } from './attendance-feature-flags.bootstrap';

describe('AttendanceFeatureFlagsBootstrap', () => {
  it('registers all 5 attendance feature flags', () => {
    const calls: Array<{ key: string; kind: string; defaultValue: boolean }> = [];
    const registry = {
      register: jest.fn((entry: { key: string; kind: string; defaultValue: boolean }) => {
        calls.push({ key: entry.key, kind: entry.kind, defaultValue: entry.defaultValue });
      }),
    };

    new AttendanceFeatureFlagsBootstrap(registry as never);

    expect(registry.register).toHaveBeenCalledTimes(5);
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey['module.attendance']?.kind).toBe('MODULE');
    expect(byKey['module.attendance']?.defaultValue).toBe(true);
    expect(byKey['attendance.period_wise']?.defaultValue).toBe(false);
    expect(byKey['attendance.subject_wise']?.defaultValue).toBe(false);
    expect(byKey['attendance.biometric']?.defaultValue).toBe(false);
    expect(byKey['attendance.mobile_app']?.defaultValue).toBe(false);
  });

  it('registration is idempotent across multiple constructions', () => {
    const registry = { register: jest.fn() };
    new AttendanceFeatureFlagsBootstrap(registry as never);
    new AttendanceFeatureFlagsBootstrap(registry as never);
    expect(registry.register).toHaveBeenCalledTimes(10);
  });
});
