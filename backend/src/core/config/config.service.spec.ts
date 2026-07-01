import { ConfigService } from './config.service';
import { EnvValidationError } from './validate-env';

/**
 * Unit tests for ConfigService. We mutate `process.env` directly within the
 * config namespace (the only place ESLint allows it) and rely on
 * `ConfigService.reset()` between cases to drop the cached snapshot.
 */
describe('ConfigService', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    ConfigService.reset();
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, {
      NODE_ENV: 'test',
      APP_NAME: 'schoolos-api',
      APP_PORT: '3001',
      APP_HOST: '127.0.0.1',
      APP_GLOBAL_PREFIX: 'api',
      APP_API_VERSION: 'v1',
      APP_BASE_URL: 'http://localhost:3001',
      LOG_LEVEL: 'info',
      LOG_PRETTY: 'true',
      SWAGGER_ENABLED: 'true',
    });
  });

  afterAll(() => {
    ConfigService.reset();
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('produces a frozen snapshot from valid env', () => {
    const cfg = ConfigService.bootstrap({ force: true });
    expect(cfg.app.env).toBe('test');
    expect(cfg.app.port).toBe(3001);
    expect(cfg.app.isTest).toBe(true);
    expect(cfg.app.isProduction).toBe(false);
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.app.cors.origins)).toBe(true);
  });

  it('coerces booleans from string variants', () => {
    process.env.HTTP_TRUST_PROXY = 'yes';
    process.env.CORS_CREDENTIALS = '0';
    const cfg = ConfigService.bootstrap({ force: true });
    expect(cfg.app.trustProxy).toBe(true);
    expect(cfg.app.cors.credentials).toBe(false);
  });

  it('parses CSV CORS_ORIGINS and trims entries', () => {
    process.env.CORS_ORIGINS = ' https://a.example.com , https://b.example.com ,';
    const cfg = ConfigService.bootstrap({ force: true });
    expect(cfg.app.cors.origins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('is idempotent unless force=true', () => {
    const first = ConfigService.bootstrap({ force: true });
    process.env.APP_PORT = '4444';
    const second = ConfigService.bootstrap();
    expect(second.app.port).toBe(first.app.port);
    const third = ConfigService.bootstrap({ force: true });
    expect(third.app.port).toBe(4444);
  });

  it('rejects production with LOG_PRETTY=true via aggregated error', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_PRETTY = 'true';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.FEATURE_DEBUG_ENDPOINTS = 'false';
    expect(() => ConfigService.bootstrap({ force: true })).toThrow(EnvValidationError);
  });

  it('rejects production with CORS wildcard', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_PRETTY = 'false';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.CORS_ORIGINS = '*';
    try {
      ConfigService.bootstrap({ force: true });
      fail('expected EnvValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const issues = (err as EnvValidationError).issues;
      expect(issues.some((i) => i.path === 'CORS_ORIGINS')).toBe(true);
    }
  });

  it('rejects invalid APP_PORT', () => {
    process.env.APP_PORT = '70000';
    expect(() => ConfigService.bootstrap({ force: true })).toThrow(EnvValidationError);
  });

  it('exposes typed grouped accessors via instance', () => {
    ConfigService.bootstrap({ force: true });
    const svc = new ConfigService();
    expect(svc.app.name).toBe('schoolos-api');
    expect(svc.logger.level).toBe('info');
    expect(svc.swagger.enabled).toBe(true);
    expect(svc.features.debugEndpoints).toBe(false);
  });
});
