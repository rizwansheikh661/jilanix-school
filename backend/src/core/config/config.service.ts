import { Injectable, Logger } from '@nestjs/common';

import { type LoadedFile, loadEnvFiles } from './load-env';
import { isSensitiveKey, maskValue } from './redaction';
import {
  type AppConfig,
  type AppConfiguration,
  type AuthConfig,
  type AwsConfig,
  type CryptoConfig,
  type DatabaseConfig,
  type FeatureFlags,
  type FeatureFlagsRuntimeConfig,
  type JwtConfig,
  type LoggerConfig,
  type MailConfig,
  type ObservabilityConfig,
  type OutboxConfig,
  type QueueConfig,
  type RedisConfig,
  type StorageConfig,
  type SwaggerConfig,
  buildAppConfiguration,
} from './types';
import { validateEnv } from './validate-env';

/**
 * Application-wide configuration.
 *
 * Lifecycle:
 *   1. `ConfigService.bootstrap()` is invoked once, BEFORE the Nest factory
 *      is constructed (see apps/api/main.ts). It loads `.env*` files in order,
 *      validates the merged result against `EnvSchema`, and freezes a typed
 *      `AppConfiguration` snapshot.
 *   2. The Nest container then instantiates `ConfigService` via DI; the
 *      service simply exposes the frozen snapshot.
 *
 * Feature code MUST consume configuration through this service.
 * Direct `process.env` access is forbidden by ESLint outside src/core/config.
 */
@Injectable()
export class ConfigService {
  private static readonly logger = new Logger(ConfigService.name);
  private static snapshot: AppConfiguration | null = null;
  private static loadedFiles: LoadedFile[] = [];

  /**
   * Load + validate env. Idempotent: subsequent calls return the cached snapshot.
   * Use `force: true` only in tests that need a fresh load with mutated env.
   */
  public static bootstrap(options: { cwd?: string; force?: boolean } = {}): AppConfiguration {
    if (this.snapshot !== null && options.force !== true) {
      return this.snapshot;
    }

    const files = loadEnvFiles({ cwd: options.cwd });
    const validated = validateEnv(process.env);
    const config = Object.freeze(buildAppConfiguration(validated));

    this.snapshot = config;
    this.loadedFiles = files;
    return config;
  }

  /** Reset the cached snapshot. Test-only utility. */
  public static reset(): void {
    this.snapshot = null;
    this.loadedFiles = [];
  }

  /**
   * Emit a single boot-log line summarising the loaded files and selected
   * configuration. Sensitive values are masked.
   */
  public static logSnapshot(): void {
    if (this.snapshot === null) {
      return;
    }
    const fileSummary = this.loadedFiles
      .map((f) => (f.loaded ? `${f.path} (${f.keys} keys)` : `${f.path} (skipped)`))
      .join(', ');
    this.logger.log(`Env files: ${fileSummary || '<none>'}`);

    const flat = this.flatten(this.snapshot);
    for (const [key, value] of Object.entries(flat)) {
      const display = isSensitiveKey(key) ? maskValue(value) : String(value);
      this.logger.log(`  ${key}=${display}`);
    }
  }

  private static flatten(cfg: AppConfiguration, prefix = '', acc: Record<string, unknown> = {}): Record<string, unknown> {
    for (const [key, value] of Object.entries(cfg)) {
      const path = prefix === '' ? key : `${prefix}.${key}`;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.flatten(value as AppConfiguration, path, acc);
      } else {
        acc[path] = value;
      }
    }
    return acc;
  }

  // -----------------------------------------------------------------
  // Instance API — typed accessors only. No string-key get('FOO') here.
  // -----------------------------------------------------------------

  private readonly snapshot: AppConfiguration;

  constructor() {
    if (ConfigService.snapshot === null) {
      // Fallback: Nest may instantiate before bootstrap in some test paths.
      ConfigService.bootstrap();
    }
    // Non-null after bootstrap.
    this.snapshot = ConfigService.snapshot as AppConfiguration;
  }

  public get all(): AppConfiguration {
    return this.snapshot;
  }

  public get app(): AppConfig {
    return this.snapshot.app;
  }

  public get logger(): LoggerConfig {
    return this.snapshot.logger;
  }

  public get swagger(): SwaggerConfig {
    return this.snapshot.swagger;
  }

  public get db(): DatabaseConfig {
    return this.snapshot.db;
  }

  public get redis(): RedisConfig {
    return this.snapshot.redis;
  }

  public get jwt(): JwtConfig {
    return this.snapshot.jwt;
  }

  public get auth(): AuthConfig {
    return this.snapshot.auth;
  }

  public get aws(): AwsConfig {
    return this.snapshot.aws;
  }

  public get crypto(): CryptoConfig {
    return this.snapshot.crypto;
  }

  public get observability(): ObservabilityConfig {
    return this.snapshot.observability;
  }

  public get features(): FeatureFlags {
    return this.snapshot.features;
  }

  public get storage(): StorageConfig {
    return this.snapshot.storage;
  }

  public get queue(): QueueConfig {
    return this.snapshot.queue;
  }

  public get outbox(): OutboxConfig {
    return this.snapshot.outbox;
  }

  public get featureFlagsRuntime(): FeatureFlagsRuntimeConfig {
    return this.snapshot.featureFlagsRuntime;
  }

  public get mail(): MailConfig {
    return this.snapshot.mail;
  }
}
