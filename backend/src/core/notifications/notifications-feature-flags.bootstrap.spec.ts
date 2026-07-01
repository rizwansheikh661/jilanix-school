/**
 * NotificationsFeatureFlagsBootstrap unit spec — verifies the 13
 * notifications flag keys are registered with the correct kinds and
 * default values (channel flags are ENTITLEMENT, module flag is MODULE,
 * provider/behavior flags are RELEASE).
 */
import { NotificationsFeatureFlagsBootstrap } from './notifications-feature-flags.bootstrap';
import { NotificationsFeatureFlags } from './notifications.constants';

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
  new NotificationsFeatureFlagsBootstrap(registry as never);
  return { calls, registry };
}

describe('NotificationsFeatureFlagsBootstrap', () => {
  it('registers all 13 notifications feature flags', () => {
    const { calls, registry } = captureRegistrations();
    expect(registry.register).toHaveBeenCalledTimes(13);
    const expected = new Set(Object.values(NotificationsFeatureFlags));
    expect(new Set(calls.map((c) => c.key))).toEqual(expected);
  });

  it('module.notifications is a MODULE flag with default=true', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey['module.notifications']?.kind).toBe('MODULE');
    expect(byKey['module.notifications']?.defaultValue).toBe(true);
  });

  it('channel flags are ENTITLEMENT with the right defaults (email/in_app on, sms/whatsapp off)', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey['comms.channel.email']?.kind).toBe('ENTITLEMENT');
    expect(byKey['comms.channel.email']?.defaultValue).toBe(true);

    expect(byKey['comms.channel.in_app']?.kind).toBe('ENTITLEMENT');
    expect(byKey['comms.channel.in_app']?.defaultValue).toBe(true);

    expect(byKey['comms.channel.sms']?.kind).toBe('ENTITLEMENT');
    expect(byKey['comms.channel.sms']?.defaultValue).toBe(false);

    expect(byKey['comms.channel.whatsapp']?.kind).toBe('ENTITLEMENT');
    expect(byKey['comms.channel.whatsapp']?.defaultValue).toBe(false);
  });

  it('provider flags are RELEASE with default=false', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    for (const key of [
      'comms.provider.ses',
      'comms.provider.sendgrid',
      'comms.provider.msg91',
      'comms.provider.twilio',
      'comms.provider.waba',
    ]) {
      expect(byKey[key]?.kind).toBe('RELEASE');
      expect(byKey[key]?.defaultValue).toBe(false);
    }
  });

  it('behaviour flags are RELEASE with the right defaults', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey['notifications.allow_broadcast']?.kind).toBe('RELEASE');
    expect(byKey['notifications.allow_broadcast']?.defaultValue).toBe(false);

    expect(byKey['notifications.allow_scheduled']?.kind).toBe('RELEASE');
    expect(byKey['notifications.allow_scheduled']?.defaultValue).toBe(true);

    expect(byKey['notifications.quiet_hours_enforced']?.kind).toBe('RELEASE');
    expect(byKey['notifications.quiet_hours_enforced']?.defaultValue).toBe(true);
  });

  it('registration is idempotent across multiple constructions', () => {
    const registry = { register: jest.fn() };
    new NotificationsFeatureFlagsBootstrap(registry as never);
    new NotificationsFeatureFlagsBootstrap(registry as never);
    expect(registry.register).toHaveBeenCalledTimes(26);
  });
});
