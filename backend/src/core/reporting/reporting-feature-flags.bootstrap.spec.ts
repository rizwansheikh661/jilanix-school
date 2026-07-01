/**
 * ReportingFeatureFlagsBootstrap unit specs — asserts the constructor
 * registers all 6 reporting feature flags with the FeatureFlagRegistry.
 */
import { ReportingFeatureFlags } from './reporting.constants';
import { ReportingFeatureFlagsBootstrap } from './reporting-feature-flags.bootstrap';

describe('ReportingFeatureFlagsBootstrap', () => {
  it('registers exactly 6 feature flags at construct time', () => {
    const register = jest.fn();
    const registry = { register } as never;
    // eslint-disable-next-line @typescript-eslint/no-new
    new ReportingFeatureFlagsBootstrap(registry);
    expect(register).toHaveBeenCalledTimes(6);
  });

  it('registers all 6 known reporting flag keys', () => {
    const register = jest.fn();
    const registry = { register } as never;
    // eslint-disable-next-line @typescript-eslint/no-new
    new ReportingFeatureFlagsBootstrap(registry);
    const keys = (register.mock.calls as Array<[{ key: string }]>).map(
      ([a]) => a.key,
    );
    expect(keys).toEqual(
      expect.arrayContaining(Object.values(ReportingFeatureFlags)),
    );
    expect(keys.length).toBe(Object.values(ReportingFeatureFlags).length);
  });

  it('owner is "reporting" on every registration', () => {
    const register = jest.fn();
    const registry = { register } as never;
    // eslint-disable-next-line @typescript-eslint/no-new
    new ReportingFeatureFlagsBootstrap(registry);
    const calls = register.mock.calls as Array<
      [{ key: string; owner: string; kind: string; defaultValue: boolean }]
    >;
    for (const [arg] of calls) {
      expect(arg.owner).toBe('reporting');
    }
  });

  it('module flag is kind=MODULE; all others kind=RELEASE; defaults all true', () => {
    const register = jest.fn();
    const registry = { register } as never;
    // eslint-disable-next-line @typescript-eslint/no-new
    new ReportingFeatureFlagsBootstrap(registry);
    const calls = register.mock.calls as Array<
      [{ key: string; kind: string; defaultValue: boolean }]
    >;
    for (const [arg] of calls) {
      if (arg.key === ReportingFeatureFlags.MODULE) {
        expect(arg.kind).toBe('MODULE');
      } else {
        expect(arg.kind).toBe('RELEASE');
      }
      expect(arg.defaultValue).toBe(true);
    }
  });
});
