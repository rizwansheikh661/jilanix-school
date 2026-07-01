import { FeatureFlagRegistry } from './feature-flag.registry';

describe('FeatureFlagRegistry', () => {
  it('register stores entries indexed by key', () => {
    const defs = { upsertByKey: jest.fn() };
    const reg = new FeatureFlagRegistry(defs as never);
    reg.register({
      key: 'module.fees',
      name: 'Fees module',
      kind: 'MODULE',
      defaultValue: false,
    });
    expect(reg.has('module.fees')).toBe(true);
    expect(reg.get('module.fees')?.name).toBe('Fees module');
    expect(reg.list().map((e) => e.key)).toEqual(['module.fees']);
  });

  it('list returns entries sorted by key', () => {
    const reg = new FeatureFlagRegistry({ upsertByKey: jest.fn() } as never);
    reg.register({ key: 'b.x', name: 'B', kind: 'MODULE', defaultValue: false });
    reg.register({ key: 'a.x', name: 'A', kind: 'MODULE', defaultValue: false });
    expect(reg.list().map((e) => e.key)).toEqual(['a.x', 'b.x']);
  });

  it('upsertAll calls defs.upsertByKey once per registration', async () => {
    const defs = { upsertByKey: jest.fn() };
    const reg = new FeatureFlagRegistry(defs as never);
    reg.register({ key: 'm.a', name: 'A', kind: 'MODULE', defaultValue: false });
    reg.register({ key: 'm.b', name: 'B', kind: 'RELEASE', defaultValue: true });
    await reg.upsertAll();
    expect(defs.upsertByKey).toHaveBeenCalledTimes(2);
  });

  it('onApplicationBootstrap is idempotent', async () => {
    const defs = { upsertByKey: jest.fn() };
    const reg = new FeatureFlagRegistry(defs as never);
    reg.register({ key: 'm.a', name: 'A', kind: 'MODULE', defaultValue: false });
    await reg.onApplicationBootstrap();
    await reg.onApplicationBootstrap();
    expect(defs.upsertByKey).toHaveBeenCalledTimes(1);
  });
});
