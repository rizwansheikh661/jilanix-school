/**
 * ReportingPermissionsSeeder unit specs — asserts all 38 reporting
 * permission keys are upserted with parsed resource + action.
 */
import { ReportingPermissions } from './reporting.constants';
import { ReportingPermissionsSeeder } from './reporting-permissions.seeder';

function makeHarness() {
  const upsert = jest.fn(async () => undefined);
  const permissionsRepo = { upsert } as never;
  const seeder = new ReportingPermissionsSeeder(permissionsRepo);
  return { seeder, upsert };
}

describe('ReportingPermissionsSeeder', () => {
  it('upserts exactly 38 reporting permission keys', async () => {
    const t = makeHarness();
    await t.seeder.onApplicationBootstrap();
    const keys = Object.values(ReportingPermissions);
    expect(keys.length).toBe(38);
    expect(t.upsert).toHaveBeenCalledTimes(38);
  });

  it('parses resource and action from each key', async () => {
    const t = makeHarness();
    await t.seeder.onApplicationBootstrap();
    const calls = t.upsert.mock.calls as unknown as Array<
      [{ key: string; resource: string; action: string; description: string }]
    >;
    for (const [arg] of calls) {
      expect(arg.resource.length).toBeGreaterThan(0);
      expect(arg.action.length).toBeGreaterThan(0);
      expect(arg.description.length).toBeGreaterThan(0);
      expect(`${arg.resource}.${arg.action}`).toBe(arg.key);
    }
  });

  it('includes the canonical report.read and import.commit keys', async () => {
    const t = makeHarness();
    await t.seeder.onApplicationBootstrap();
    const keys = (
      t.upsert.mock.calls as unknown as Array<[{ key: string }]>
    ).map(([a]) => a.key);
    expect(keys).toContain('report.read');
    expect(keys).toContain('import.commit');
    expect(keys).toContain('bulk-operation.execute');
    expect(keys).toContain('dashboard.widget-manage');
    expect(keys).toContain('report-template.update');
  });

  it('swallows repo errors and logs (does not throw)', async () => {
    const upsert = jest.fn(async () => {
      throw new Error('db down');
    });
    const seeder = new ReportingPermissionsSeeder({ upsert } as never);
    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
