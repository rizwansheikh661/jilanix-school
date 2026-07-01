/**
 * TimetableFeatureFlagsBootstrap unit spec — verifies the 5 timetable
 * feature flag keys are registered with the correct kind/default values.
 */
import { TimetableFeatureFlagsBootstrap } from './timetable-feature-flags.bootstrap';

describe('TimetableFeatureFlagsBootstrap', () => {
  it('registers all 5 timetable feature flags', () => {
    const calls: Array<{ key: string; kind: string; defaultValue: boolean }> = [];
    const registry = {
      register: jest.fn((entry: { key: string; kind: string; defaultValue: boolean }) => {
        calls.push({ key: entry.key, kind: entry.kind, defaultValue: entry.defaultValue });
      }),
    };

    new TimetableFeatureFlagsBootstrap(registry as never);

    expect(registry.register).toHaveBeenCalledTimes(5);
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey['module.timetable']?.kind).toBe('MODULE');
    expect(byKey['module.timetable']?.defaultValue).toBe(true);
    expect(byKey['timetable.auto_generate']?.kind).toBe('RELEASE');
    expect(byKey['timetable.auto_generate']?.defaultValue).toBe(false);
    expect(byKey['timetable.substitution']?.kind).toBe('RELEASE');
    expect(byKey['timetable.substitution']?.defaultValue).toBe(false);
    expect(byKey['timetable.substitution.notifications']?.kind).toBe('RELEASE');
    expect(byKey['timetable.substitution.notifications']?.defaultValue).toBe(false);
    expect(byKey['timetable.allow_unqualified_teacher']?.kind).toBe('RELEASE');
    expect(byKey['timetable.allow_unqualified_teacher']?.defaultValue).toBe(false);
  });

  it('registration is idempotent across multiple constructions', () => {
    const registry = { register: jest.fn() };
    new TimetableFeatureFlagsBootstrap(registry as never);
    new TimetableFeatureFlagsBootstrap(registry as never);
    expect(registry.register).toHaveBeenCalledTimes(10);
  });
});
