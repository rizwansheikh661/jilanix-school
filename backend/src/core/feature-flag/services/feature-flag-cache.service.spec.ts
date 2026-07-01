import { FeatureFlagCacheService } from './feature-flag-cache.service';

function makeCache(ttlSeconds = 60): FeatureFlagCacheService {
  return new FeatureFlagCacheService({
    featureFlagsRuntime: { cacheTtlSeconds: ttlSeconds },
  } as never);
}

const ev = (key: string, value: boolean) => ({
  key,
  value,
  source: 'default' as const,
});

describe('FeatureFlagCacheService', () => {
  it('returns undefined on miss', () => {
    const cache = makeCache();
    expect(cache.get('s1', 'module.fees')).toBeUndefined();
  });

  it('returns set values on hit', () => {
    const cache = makeCache();
    cache.set('s1', 'module.fees', ev('module.fees', true));
    expect(cache.get('s1', 'module.fees')?.value).toBe(true);
  });

  it('expires entries past TTL', () => {
    const cache = makeCache(1);
    cache.set('s1', 'module.fees', ev('module.fees', true));
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 5_000;
      expect(cache.get('s1', 'module.fees')).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
  });

  it('invalidate drops all entries for a key across tenants', () => {
    const cache = makeCache();
    cache.set('s1', 'module.fees', ev('module.fees', true));
    cache.set('s2', 'module.fees', ev('module.fees', false));
    cache.set('s1', 'module.examination', ev('module.examination', true));
    expect(cache.invalidate('module.fees')).toBe(2);
    expect(cache.get('s1', 'module.fees')).toBeUndefined();
    expect(cache.get('s2', 'module.fees')).toBeUndefined();
    expect(cache.get('s1', 'module.examination')?.value).toBe(true);
  });

  it('invalidateAll wipes the cache', () => {
    const cache = makeCache();
    cache.set('s1', 'a.b', ev('a.b', true));
    cache.set('s2', 'c.d', ev('c.d', false));
    cache.invalidateAll();
    expect(cache.size()).toBe(0);
  });

  it('separates platform and tenant entries', () => {
    const cache = makeCache();
    cache.set(null, 'module.fees', ev('module.fees', true));
    cache.set('s1', 'module.fees', ev('module.fees', false));
    expect(cache.get(null, 'module.fees')?.value).toBe(true);
    expect(cache.get('s1', 'module.fees')?.value).toBe(false);
  });
});
