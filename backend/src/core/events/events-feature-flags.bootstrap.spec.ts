/**
 * EventsFeatureFlagsBootstrap unit spec — verifies the 5 Events flag keys
 * are registered with the correct kinds and default values.
 */
import { EventsFeatureFlagsBootstrap } from './events-feature-flags.bootstrap';
import { EventsFeatureFlags } from './events.constants';

interface CapturedFlag {
  readonly key: string;
  readonly kind: string;
  readonly defaultValue: boolean;
}

function captureRegistrations() {
  const calls: CapturedFlag[] = [];
  const registry = {
    register: jest.fn((entry: CapturedFlag) =>
      calls.push({ key: entry.key, kind: entry.kind, defaultValue: entry.defaultValue }),
    ),
  };
  new EventsFeatureFlagsBootstrap(registry as never);
  return { calls, registry };
}

describe('EventsFeatureFlagsBootstrap', () => {
  it('registers all 5 events feature flags', () => {
    const { calls, registry } = captureRegistrations();
    expect(registry.register).toHaveBeenCalledTimes(5);
    const expected = new Set(Object.values(EventsFeatureFlags));
    expect(new Set(calls.map((c) => c.key))).toEqual(expected);
  });

  it('module.events is a MODULE flag with default=true', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey['module.events']?.kind).toBe('MODULE');
    expect(byKey['module.events']?.defaultValue).toBe(true);
  });

  it('behaviour flags are RELEASE with default=true', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    for (const key of [
      'events.allow_publish',
      'events.allow_fee_generation',
      'events.allow_bulk_registration',
      'events.notify_on_lifecycle',
    ]) {
      expect(byKey[key]?.kind).toBe('RELEASE');
      expect(byKey[key]?.defaultValue).toBe(true);
    }
  });

  it('registration is idempotent across multiple constructions', () => {
    const registry = { register: jest.fn() };
    new EventsFeatureFlagsBootstrap(registry as never);
    new EventsFeatureFlagsBootstrap(registry as never);
    expect(registry.register).toHaveBeenCalledTimes(10);
  });
});
