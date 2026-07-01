/**
 * Unit spec for ProvisioningNotificationBootstrap — verifies the 6
 * lifecycle event keys are registered on application bootstrap.
 */
import type { NotificationEventDefinition } from '../../notifications/notification-events.catalog';
import { ProvisioningNotificationEventKeys } from '../provisioning.constants';
import { ProvisioningNotificationBootstrap } from './provisioning-notification.bootstrap';

describe('ProvisioningNotificationBootstrap', () => {
  function build() {
    const captured: NotificationEventDefinition[] = [];
    const registry = {
      register: jest.fn((def: NotificationEventDefinition) => captured.push(def)),
    };
    const bootstrap = new ProvisioningNotificationBootstrap(registry as never);
    return { bootstrap, captured, registry };
  }

  it('registers every provisioning notification event key on bootstrap', () => {
    const { bootstrap, captured, registry } = build();
    bootstrap.onApplicationBootstrap();
    const expectedCount = Object.values(ProvisioningNotificationEventKeys).length;
    expect(registry.register).toHaveBeenCalledTimes(expectedCount);
    expect(new Set(captured.map((d) => d.key))).toEqual(
      new Set(Object.values(ProvisioningNotificationEventKeys)),
    );
  });

  it('every event is category=SYSTEM with audience=USER', () => {
    const { bootstrap, captured } = build();
    bootstrap.onApplicationBootstrap();
    for (const def of captured) {
      expect(def.category).toBe('SYSTEM');
      expect(def.audience).toBe('USER');
    }
  });

  it('SCHOOL_SUSPENDED and TRIAL_EXPIRED are CRITICAL priority', () => {
    const { bootstrap, captured } = build();
    bootstrap.onApplicationBootstrap();
    const byKey = Object.fromEntries(captured.map((d) => [d.key, d]));
    expect(byKey[ProvisioningNotificationEventKeys.SCHOOL_SUSPENDED]?.defaultPriority).toBe(
      'CRITICAL',
    );
    expect(byKey[ProvisioningNotificationEventKeys.TRIAL_EXPIRED]?.defaultPriority).toBe(
      'CRITICAL',
    );
  });

  it('every definition carries sampleVariables for renderer preview', () => {
    const { bootstrap, captured } = build();
    bootstrap.onApplicationBootstrap();
    for (const def of captured) {
      expect(def.sampleVariables).toBeDefined();
      expect(Object.keys(def.sampleVariables ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('does NOT register on construction (only via onApplicationBootstrap)', () => {
    const { registry } = build();
    expect(registry.register).not.toHaveBeenCalled();
  });
});
