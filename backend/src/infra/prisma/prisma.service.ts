import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

import { ConfigService } from '../../core/config';
import {
  auditExt,
  buildSlowQueryExt,
  correlationExt,
  softDeleteExt,
  tenantScopeExt,
} from './extensions';
import { MODEL_SCOPE } from './scope';

// Prisma 6 dropped the `Prisma.LogLevel` and `Prisma.TransactionIsolationLevel`
// re-exports. The literal unions below match the runtime/library.d.ts
// definitions and let us keep these strongly typed without depending on a
// moving target inside @prisma/client.
type PrismaLogLevel = 'query' | 'info' | 'warn' | 'error';
type PrismaIsolationLevel =
  | 'ReadUncommitted'
  | 'ReadCommitted'
  | 'RepeatableRead'
  | 'Serializable';

/**
 * PrismaService — single point of database access for the API.
 *
 * Lifecycle (Nest takes care of order):
 *   onModuleInit  → connect() and emit a one-line readiness log.
 *   onModuleDestroy → disconnect() so HMR / graceful shutdown doesn't leak
 *                     pool connections.
 *
 * Extension stack — applied in this exact order:
 *   1. correlationExt   (stamp ctx onto every operation)
 *   2. tenantScopeExt   (filter / stamp schoolId)
 *   3. softDeleteExt    (rewrite delete*, inject deletedAt:null)
 *   4. auditExt         (capture state changes — Sprint 1 stub)
 *   5. slowQueryExt     (timing observability)
 *
 * The extended client is exposed via the `client` getter. Direct access to
 * `this` (the bare PrismaClient) is forbidden by an internal lint rule —
 * see prisma.module.ts where the export is wrapped.
 *
 * Logging: pino-style structured fields land here via the slow-query
 * extension. We do NOT enable Prisma's built-in `query` log in production
 * (PII risk + log volume). In development, set `DB_LOG_QUERIES=true` to
 * surface every SQL statement in the console.
 */
type ExtendedClient = ReturnType<typeof buildExtendedClient>;

function buildExtendedClient(base: PrismaClient, slowQueryThresholdMs: number) {
  return base
    .$extends(correlationExt)
    .$extends(tenantScopeExt)
    .$extends(softDeleteExt)
    .$extends(auditExt)
    .$extends(buildSlowQueryExt({ thresholdMs: slowQueryThresholdMs }));
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly base: PrismaClient;
  private readonly extended: ExtendedClient;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.assertScopeRegistryHasNoTypos();

    const dbUrl = this.config.db.url;
    if (dbUrl === undefined) {
      throw new Error(
        'PrismaService cannot start: DB_URL is not set. ' +
          'Either provide DB_URL in .env or remove PrismaModule from the imports.',
      );
    }

    const logLevels: PrismaLogLevel[] = this.config.db.logQueries
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'];

    this.base = new PrismaClient({
      datasourceUrl: dbUrl,
      log: logLevels.map((level) => ({ emit: 'event', level })),
      errorFormat: this.config.app.isProduction ? 'minimal' : 'pretty',
    });

    this.wireBaseLogging();

    this.extended = buildExtendedClient(this.base, this.config.db.slowQueryThresholdMs);
  }

  /**
   * The fully-extended client. This is the only handle that should escape
   * PrismaService into the application — it has the 5-extension stack
   * applied. Use it as a drop-in PrismaClient.
   */
  public get client(): ExtendedClient {
    return this.extended;
  }

  /**
   * Lightweight liveness check used by the readiness probe and
   * integration tests. Cheap (`SELECT 1`) and deliberately untyped — we
   * do NOT want this to depend on any application table existing.
   */
  public async ping(): Promise<{ ok: true; latencyMs: number }> {
    const start = process.hrtime.bigint();
    await (this.base.$queryRawUnsafe as (sql: string) => Promise<Array<{ ok: number }>>)(
      'SELECT 1 AS ok',
    );
    const elapsedNs = process.hrtime.bigint() - start;
    return { ok: true, latencyMs: Number(elapsedNs / 1_000_000n) };
  }

  /**
   * Helper: run `fn` inside an interactive transaction with the timeouts
   * configured by `DB_TRANSACTION_*`. Repositories accept an optional
   * `tx` parameter; this is the canonical place to obtain one.
   */
  public async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel?: PrismaIsolationLevel } = {},
  ): Promise<T> {
    return this.base.$transaction(fn, {
      maxWait: this.config.db.transactionMaxWaitMs,
      timeout: this.config.db.transactionTimeoutMs,
      isolationLevel: options.isolationLevel,
    });
  }

  public async onModuleInit(): Promise<void> {
    await this.base.$connect();
    this.logger.log(
      `Prisma connected (poolSize=${this.config.db.poolSize}, slow>=${this.config.db.slowQueryThresholdMs}ms)`,
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private wireBaseLogging(): void {
    if (this.config.db.logQueries) {
      // Cast through unknown — Prisma's `$on('query', ...)` typing depends
      // on the log option being literal-typed at construction.
      (this.base as unknown as {
        $on: (event: 'query', cb: (e: { query: string; params: string; duration: number }) => void) => void;
      }).$on('query', (event) => {
        this.logger.debug(`sql duration_ms=${event.duration} ${event.query}`);
      });
    }
    (this.base as unknown as { $on: (event: 'warn', cb: (e: { message: string }) => void) => void }).$on(
      'warn',
      (event) => this.logger.warn(`prisma: ${event.message}`),
    );
    (this.base as unknown as { $on: (event: 'error', cb: (e: { message: string }) => void) => void }).$on(
      'error',
      (event) => this.logger.error(`prisma: ${event.message}`),
    );
  }

  /**
   * Tripwire for typos in scope.ts. We can't validate against the real
   * Prisma DMMF without coupling to private API, but we can at minimum
   * fail boot if `MODEL_SCOPE` is empty (someone shipped a broken edit)
   * or contains obviously wrong characters.
   */
  private assertScopeRegistryHasNoTypos(): void {
    const entries = Object.entries(MODEL_SCOPE);
    if (entries.length === 0) {
      throw new Error('MODEL_SCOPE is empty — refusing to start without a tenant-scope policy.');
    }
    for (const [model] of entries) {
      if (!/^[A-Z][A-Za-z0-9_]*$/.test(model)) {
        throw new Error(`MODEL_SCOPE entry "${model}" is not a valid PascalCase model name.`);
      }
    }
  }
}
