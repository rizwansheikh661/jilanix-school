/**
 * Unit spec for ProvisioningFeatureFlagsBootstrap — verifies the 4 keys
 * are registered with the correct kind + default at construction time.
 */
import { ProvisioningFeatureFlags } from '../provisioning.constants';
import { ProvisioningFeatureFlagsBootstrap } from './provisioning-feature-flags.bootstrap';

interface CapturedFlag {
  readonly key: string;
  readonly kind: string;
  readonly defaultValue: boolean;
  readonly owner?: string;
}

function captureRegistrations() {
  const calls: CapturedFlag[] = [];
  const registry = {
    register: jest.fn((entry: CapturedFlag) =>
      calls.push({
        key: entry.key,
        kind: entry.kind,
        defaultValue: entry.defaultValue,
        owner: entry.owner,
      }),
    ),
  };
  new ProvisioningFeatureFlagsBootstrap(registry as never);
  return { calls, registry };
}

describe('ProvisioningFeatureFlagsBootstrap', () => {
  it('registers exactly 4 provisioning feature flags', () => {
    const { calls, registry } = captureRegistrations();
    expect(registry.register).toHaveBeenCalledTimes(4);
    expect(new Set(calls.map((c) => c.key))).toEqual(
      new Set(Object.values(ProvisioningFeatureFlags)),
    );
  });

  it('module.provisioning is a MODULE flag with default=true', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey[ProvisioningFeatureFlags.MODULE]?.kind).toBe('MODULE');
    expect(byKey[ProvisioningFeatureFlags.MODULE]?.defaultValue).toBe(true);
  });

  it('the three behaviour switches are RELEASE flags with default=true', () => {
    const { calls } = captureRegistrations();
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    for (const key of [
      ProvisioningFeatureFlags.ALLOW_PROVISIONING,
      ProvisioningFeatureFlags.ALLOW_TRIAL_EXTENSION,
      ProvisioningFeatureFlags.ALLOW_PASSWORD_RESET,
    ]) {
      expect(byKey[key]?.kind).toBe('RELEASE');
      expect(byKey[key]?.defaultValue).toBe(true);
    }
  });

  it('every flag is owned by "provisioning"', () => {
    const { calls } = captureRegistrations();
    for (const call of calls) {
      expect(call.owner).toBe('provisioning');
    }
  });
});
