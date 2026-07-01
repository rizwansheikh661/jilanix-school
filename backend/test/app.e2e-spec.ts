import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ConfigService } from '../src/core/config';
import { PrismaService } from '../src/infra/prisma';

/**
 * Smoke E2E: the app boots, the three health-style endpoints are reachable
 * version-neutral, and a missing route returns 404.
 *
 * PrismaService is stubbed so the test does not require a running MySQL.
 * Real-MySQL e2e (via Testcontainers) lands when the first repository ships.
 */
describe('App (e2e) — Sprint 1 smoke', () => {
  let app: INestApplication;

  const prismaStub: Pick<PrismaService, 'ping' | 'onModuleInit' | 'onModuleDestroy' | 'transaction'> & {
    client: Record<string, unknown>;
  } = {
    client: {
      auditLog: {
        create: async (args: { data: { rowHash?: string } }) => ({
          id: 'audit-stub',
          rowHash: args.data.rowHash ?? 'stub',
        }),
        findFirst: async () => null,
      },
    },
    async ping() {
      return { ok: true as const, latencyMs: 1 };
    },
    async onModuleInit() {},
    async onModuleDestroy() {},
    async transaction(fn) {
      return fn({} as never);
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.LOG_LEVEL = 'warn';
    process.env.LOG_PRETTY = 'false';
    process.env.DB_URL = 'mysql://stub:stub@127.0.0.1:3306/stub';
    ConfigService.reset();
    ConfigService.bootstrap({ force: true });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health', 'ready', 'version'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    ConfigService.reset();
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('GET /ready returns 200 when DB ping succeeds', async () => {
    const res = await request(app.getHttpServer()).get('/ready').expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database).toEqual(expect.objectContaining({ status: 'ok' }));
  });

  it('GET /ready returns 503 when DB ping fails', async () => {
    const original = prismaStub.ping;
    prismaStub.ping = async () => {
      throw new Error('connection refused');
    };
    try {
      const res = await request(app.getHttpServer()).get('/ready').expect(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.checks.database.status).toBe('down');
    } finally {
      prismaStub.ping = original;
    }
  });

  it('GET /version returns 200 with build identity', async () => {
    const res = await request(app.getHttpServer()).get('/version').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        version: expect.any(String),
        environment: 'test',
        commit: expect.any(String),
        buildTime: expect.any(String),
      }),
    );
  });

  it('health is NOT served under the /api/v1 prefix', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(404);
  });

  it('unknown routes return 404', async () => {
    await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
  });
});
