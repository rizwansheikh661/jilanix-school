/**
 * ReportingNotificationBootstrap unit specs — asserts all 5 reporting
 * notification catalog entries are registered on onApplicationBootstrap.
 */
import { ReportingNotificationEventKeys } from './reporting.constants';
import { ReportingNotificationBootstrap } from './reporting-notification-bootstrap';

describe('ReportingNotificationBootstrap', () => {
  it('registers exactly 5 notification catalog entries on bootstrap', () => {
    const register = jest.fn();
    const registry = { register } as never;
    const bootstrap = new ReportingNotificationBootstrap(registry);
    bootstrap.onApplicationBootstrap();
    expect(register).toHaveBeenCalledTimes(5);
  });

  it('registers all 5 known reporting notification keys', () => {
    const register = jest.fn();
    const registry = { register } as never;
    const bootstrap = new ReportingNotificationBootstrap(registry);
    bootstrap.onApplicationBootstrap();
    const keys = (register.mock.calls as Array<[{ key: string }]>).map(
      ([a]) => a.key,
    );
    expect(keys.sort()).toEqual(
      Object.values(ReportingNotificationEventKeys).slice().sort(),
    );
  });

  it('all entries belong to COMMUNICATION category with audience USER', () => {
    const register = jest.fn();
    const registry = { register } as never;
    const bootstrap = new ReportingNotificationBootstrap(registry);
    bootstrap.onApplicationBootstrap();
    const calls = register.mock.calls as Array<
      [{ category: string; audience: string }]
    >;
    for (const [arg] of calls) {
      expect(arg.category).toBe('COMMUNICATION');
      expect(arg.audience).toBe('USER');
    }
  });

  it('REPORT_FAILED and IMPORT_FAILED use HIGH priority; the rest MEDIUM', () => {
    const register = jest.fn();
    const registry = { register } as never;
    const bootstrap = new ReportingNotificationBootstrap(registry);
    bootstrap.onApplicationBootstrap();
    const byKey = new Map<string, string>();
    for (const [arg] of register.mock.calls as Array<
      [{ key: string; defaultPriority: string }]
    >) {
      byKey.set(arg.key, arg.defaultPriority);
    }
    expect(byKey.get(ReportingNotificationEventKeys.REPORT_READY)).toBe('MEDIUM');
    expect(byKey.get(ReportingNotificationEventKeys.REPORT_FAILED)).toBe('HIGH');
    expect(byKey.get(ReportingNotificationEventKeys.IMPORT_COMPLETED)).toBe(
      'MEDIUM',
    );
    expect(byKey.get(ReportingNotificationEventKeys.IMPORT_FAILED)).toBe('HIGH');
    expect(
      byKey.get(ReportingNotificationEventKeys.BULK_OPERATION_COMPLETED),
    ).toBe('MEDIUM');
  });
});
