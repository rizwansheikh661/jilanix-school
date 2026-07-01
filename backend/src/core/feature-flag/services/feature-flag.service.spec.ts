import { withTestContext } from '../../request-context';
import { FeatureFlagCacheService } from './feature-flag-cache.service';
import { FeatureFlagService } from './feature-flag.service';

function makeService(opts: {
  definitionByKey?: Record<string, unknown> | null;
  rollouts?: unknown[];
  tenantOverride?: unknown | null;
  planEntry?: unknown | null;
} = {}) {
  const definition =
    opts.definitionByKey === undefined
      ? {
          id: 'flag-1',
          key: 'module.fees',
          name: 'Fees',
          description: null,
          kind: 'MODULE',
          owner: null,
          defaultValue: false,
          lifecycle: 'ACTIVE',
          cleanupDueAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        }
      : opts.definitionByKey;

  const definitions = {
    findByKey: jest.fn().mockResolvedValue(definition),
    findById: jest.fn().mockResolvedValue(definition),
  };
  const rollouts = { listActiveForFlag: jest.fn().mockResolvedValue(opts.rollouts ?? []) };
  const tenantOverrides = {
    findActive: jest.fn().mockResolvedValue(opts.tenantOverride ?? null),
  };
  const planMap = { findByPlanAndFlag: jest.fn().mockResolvedValue(opts.planEntry ?? null) };
  const audits = { append: jest.fn() };
  const outbox = { publish: jest.fn() };
  const cache = new FeatureFlagCacheService({
    featureFlagsRuntime: { cacheTtlSeconds: 60 },
  } as never);
  const registry = { list: jest.fn().mockReturnValue([]) };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const svc = new FeatureFlagService(
    prisma as never,
    definitions as never,
    planMap as never,
    tenantOverrides as never,
    rollouts as never,
    audits as never,
    cache,
    outbox as never,
    registry as never,
  );
  return { svc, definitions, rollouts, tenantOverrides, planMap, cache };
}

describe('FeatureFlagService.evaluate', () => {
  it('returns default when no rollout/override/plan match', async () => {
    const t = makeService();
    const res = await t.svc.evaluate('module.fees', { schoolId: 's1' });
    expect(res.value).toBe(false);
    expect(res.source).toBe('default');
  });

  it('rollout match wins over tenant override', async () => {
    const t = makeService({
      rollouts: [
        {
          id: 'r1',
          flagId: 'flag-1',
          strategy: 'TENANT_LIST',
          percentage: null,
          tenantIdsJson: ['s1'],
          planIdsJson: null,
          regionsJson: null,
          isActive: true,
          startsAt: null,
          endsAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        },
      ],
      tenantOverride: { value: false, quotaInt: null, expiresAt: null },
    });
    const res = await t.svc.evaluate('module.fees', { schoolId: 's1' });
    expect(res.value).toBe(true);
    expect(res.source).toBe('rollout');
  });

  it('tenant override wins over plan map and default', async () => {
    const t = makeService({
      tenantOverride: { value: true, quotaInt: 5, expiresAt: null },
      planEntry: { value: false, quotaInt: null },
    });
    const res = await t.svc.evaluate('module.fees', { schoolId: 's1', planId: 'p1' });
    expect(res.value).toBe(true);
    expect(res.source).toBe('tenant_override');
    expect(res.quotaInt).toBe(5);
  });

  it('plan map fires when no rollout and no override', async () => {
    const t = makeService({
      planEntry: { value: true, quotaInt: 10 },
    });
    const res = await t.svc.evaluate('module.fees', { schoolId: 's1', planId: 'p1' });
    expect(res.source).toBe('plan_map');
    expect(res.value).toBe(true);
    expect(res.quotaInt).toBe(10);
  });

  it('percentage 100 always matches; percentage 0 never matches', async () => {
    const rollout100 = {
      id: 'r1',
      flagId: 'flag-1',
      strategy: 'PERCENTAGE',
      percentage: 100,
      tenantIdsJson: null,
      planIdsJson: null,
      regionsJson: null,
      isActive: true,
      startsAt: null,
      endsAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    const t1 = makeService({ rollouts: [rollout100] });
    expect((await t1.svc.evaluate('module.fees', { schoolId: 's1' })).value).toBe(true);

    const t2 = makeService({ rollouts: [{ ...rollout100, percentage: 0 }] });
    const res = await t2.svc.evaluate('module.fees', { schoolId: 's1' });
    expect(res.value).toBe(false);
    expect(res.source).toBe('rollout');
  });

  it('caches the evaluation', async () => {
    const t = makeService();
    await t.svc.evaluate('module.fees', { schoolId: 's1' });
    await t.svc.evaluate('module.fees', { schoolId: 's1' });
    expect(t.rollouts.listActiveForFlag).toHaveBeenCalledTimes(1);
  });
});

describe('FeatureFlagService.handleFlagChangedEvent', () => {
  it('invalidates a single key when payload has flagKey', () => {
    const t = makeService();
    t.cache.set('s1', 'module.fees', { key: 'module.fees', value: true, source: 'default' });
    t.svc.handleFlagChangedEvent({ flagKey: 'module.fees' });
    expect(t.cache.get('s1', 'module.fees')).toBeUndefined();
  });

  it('invalidates all when payload has no flagKey', () => {
    const t = makeService();
    t.cache.set('s1', 'a.b', { key: 'a.b', value: true, source: 'default' });
    t.svc.handleFlagChangedEvent(null);
    expect(t.cache.size()).toBe(0);
  });
});

describe('FeatureFlagService.createDefinition', () => {
  it('writes audit + outbox in the same tx', async () => {
    const t = makeService({ definitionByKey: null });
    const definitions = {
      ...(t as unknown as { definitions: { findByKey: jest.Mock; create: jest.Mock } }).definitions,
      findByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'flag-new',
        key: 'module.x',
        name: 'X',
        description: null,
        kind: 'MODULE',
        owner: null,
        defaultValue: false,
        lifecycle: 'INTRODUCED',
        cleanupDueAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      }),
    };
    const audits = { append: jest.fn() };
    const outbox = { publish: jest.fn() };
    const cache = new FeatureFlagCacheService({
      featureFlagsRuntime: { cacheTtlSeconds: 60 },
    } as never);
    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ marker: true })),
    };
    const svc = new FeatureFlagService(
      prisma as never,
      definitions as never,
      { findByPlanAndFlag: jest.fn() } as never,
      { findActive: jest.fn() } as never,
      { listActiveForFlag: jest.fn().mockResolvedValue([]) } as never,
      audits as never,
      cache,
      outbox as never,
      { list: jest.fn().mockReturnValue([]) } as never,
    );
    await withTestContext({ schoolId: 'platform' }, async () => {
      await svc.createDefinition({
        key: 'module.x',
        name: 'X',
        description: null,
        kind: 'MODULE',
        owner: null,
        defaultValue: false,
        lifecycle: 'INTRODUCED',
        cleanupDueAt: null,
      });
    });
    expect(audits.append).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    const [tx, payload] = outbox.publish.mock.calls[0] as [
      { marker: boolean },
      { topic: string },
    ];
    expect(tx.marker).toBe(true);
    expect(payload.topic).toBe('feature_flag.changed');
  });
});
