/**
 * FeesFeatureFlagsBootstrap unit spec — verifies the 8 Fees feature flag
 * keys are registered with the correct kind/default values (Sprint 9 baseline
 * + Sprint 9.1 `payments.gateway.cashfree`).
 */
import { FeesFeatureFlagsBootstrap } from './fees-feature-flags.bootstrap';

describe('FeesFeatureFlagsBootstrap', () => {
  it('registers all 8 fees feature flags', () => {
    const calls: Array<{ key: string; kind: string; defaultValue: boolean }> = [];
    const registry = {
      register: jest.fn((entry: { key: string; kind: string; defaultValue: boolean }) => {
        calls.push({ key: entry.key, kind: entry.kind, defaultValue: entry.defaultValue });
      }),
    };

    new FeesFeatureFlagsBootstrap(registry as never);

    expect(registry.register).toHaveBeenCalledTimes(8);
    const byKey = Object.fromEntries(calls.map((c) => [c.key, c]));
    expect(byKey['module.fees']?.kind).toBe('MODULE');
    expect(byKey['module.fees']?.defaultValue).toBe(true);
    expect(byKey['payments.gateway.razorpay']?.kind).toBe('RELEASE');
    expect(byKey['payments.gateway.razorpay']?.defaultValue).toBe(false);
    expect(byKey['payments.gateway.phonepe']?.kind).toBe('RELEASE');
    expect(byKey['payments.gateway.phonepe']?.defaultValue).toBe(false);
    expect(byKey['payments.gateway.paytm']?.kind).toBe('RELEASE');
    expect(byKey['payments.gateway.paytm']?.defaultValue).toBe(false);
    expect(byKey['payments.gateway.stripe']?.kind).toBe('RELEASE');
    expect(byKey['payments.gateway.stripe']?.defaultValue).toBe(false);
    expect(byKey['payments.gateway.cashfree']?.kind).toBe('RELEASE');
    expect(byKey['payments.gateway.cashfree']?.defaultValue).toBe(false);
  });

  it('registration is idempotent across multiple constructions', () => {
    const registry = { register: jest.fn() };
    new FeesFeatureFlagsBootstrap(registry as never);
    new FeesFeatureFlagsBootstrap(registry as never);
    expect(registry.register).toHaveBeenCalledTimes(16);
  });
});
