import type { LogLevel, NodeEnv, RawEnv } from './env.schema';

/**
 * Typed, hierarchical view of validated configuration. Feature code accesses
 * configuration only through these grouped objects — never via raw env keys.
 */

export interface AppConfig {
  readonly env: NodeEnv;
  readonly name: string;
  readonly version: string;
  readonly host: string;
  readonly port: number;
  readonly globalPrefix: string;
  readonly apiVersion: string;
  readonly baseUrl: string;
  readonly bodyLimit: string;
  readonly trustProxy: boolean;
  readonly cors: {
    readonly origins: readonly string[];
    readonly credentials: boolean;
  };
  readonly build: {
    readonly commit: string;
    readonly time: string;
  };
  readonly isProduction: boolean;
  readonly isStaging: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
}

export interface LoggerConfig {
  readonly level: LogLevel;
  readonly pretty: boolean;
  readonly redactSecrets: boolean;
  readonly httpExcludePaths: readonly string[];
  readonly sampleRateInfo: number;
  readonly baseBindings: boolean;
}

export interface SwaggerConfig {
  readonly enabled: boolean;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly version: string;
}

export interface DatabaseConfig {
  readonly url: string | undefined;
  readonly poolSize: number;
  readonly poolTimeout: number;
  readonly logQueries: boolean;
  readonly slowQueryThresholdMs: number;
  readonly transactionMaxWaitMs: number;
  readonly transactionTimeoutMs: number;
}

export interface RedisConfig {
  readonly url: string | undefined;
  readonly keyPrefix: string;
}

export interface JwtConfig {
  readonly privateKeyBase64: string | undefined;
  readonly publicKeyBase64: string | undefined;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly passwordPepper: string | undefined;
}

/**
 * Auth Patch V1 (Wave W1.1) — refresh-TTL split and basic account-protection
 * knobs. Lives next to `JwtConfig` rather than nested inside it so the auth
 * feature module can consume these knobs without depending on the JWT key
 * material. `JwtConfig.refreshTtlSeconds` remains for backward compatibility
 * (and as a sane fallback) until the consuming wave swaps callers over.
 */
export interface AuthConfig {
  readonly refreshTtlDefaultSeconds: number;
  readonly refreshTtlRememberMeSeconds: number;
  readonly lockoutMaxAttempts: number;
  readonly lockoutDurationSeconds: number;
}

export interface AwsConfig {
  readonly region: string;
  readonly s3Bucket: string | undefined;
  readonly s3KmsKeyId: string | undefined;
}

export interface CryptoConfig {
  /** Base64-encoded 32-byte AES-256 key for PII column encryption. */
  readonly piiKeyB64: string | undefined;
}

export interface ObservabilityConfig {
  readonly otelEnabled: boolean;
  readonly otelServiceName: string;
  readonly otelEndpoint: string | undefined;
}

export interface FeatureFlags {
  readonly debugEndpoints: boolean;
}

/**
 * Driver-agnostic storage knobs. The provider (local / s3-compatible / future
 * S3 / DO Spaces / R2 / MinIO) reads from this config and from its own
 * driver-specific section.
 */
export interface StorageConfig {
  readonly driver: 'local' | 's3-compatible';
  readonly localRoot: string;
  readonly publicBaseUrl: string | undefined;
  readonly maxUploadBytes: number;
  readonly downloadUrlTtlSeconds: number;
  readonly s3: {
    readonly endpoint: string | undefined;
    readonly region: string | undefined;
    readonly bucket: string | undefined;
    readonly accessKeyId: string | undefined;
    readonly secretAccessKey: string | undefined;
    readonly forcePathStyle: boolean;
  };
}

/**
 * Background-job queue runtime. `processorEnabled=false` keeps the polling
 * loop from running in tests or in API-only servers; a dedicated worker
 * deployment would set it to true.
 */
export interface QueueConfig {
  readonly processorEnabled: boolean;
  readonly pollIntervalMs: number;
  readonly claimBatchSize: number;
  readonly defaultMaxAttempts: number;
  /** Per-attempt backoff in ms; index n is the wait before attempt n+1. */
  readonly defaultBackoffMs: readonly number[];
}

export interface OutboxConfig {
  readonly dispatcherEnabled: boolean;
  readonly pollIntervalMs: number;
  readonly dispatchBatchSize: number;
  readonly maxAttempts: number;
}

/**
 * Runtime layer for the DB-backed feature-flag system (Sprint 5). Distinct
 * from `FeatureFlags` above, which is build-time toggles only.
 */
export interface FeatureFlagsRuntimeConfig {
  readonly cacheTtlSeconds: number;
}

/**
 * Outbound mail transport. Provider-agnostic — `smtp` covers Mailpit in dev
 * and any transactional SMTP provider in prod. `json` is a no-network sink
 * for unit tests.
 */
export interface MailConfig {
  readonly transport: 'smtp' | 'json';
  readonly from: string;
  readonly smtp: {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
    readonly user: string | undefined;
    readonly password: string | undefined;
  };
}

export interface AppConfiguration {
  readonly app: AppConfig;
  readonly logger: LoggerConfig;
  readonly swagger: SwaggerConfig;
  readonly db: DatabaseConfig;
  readonly redis: RedisConfig;
  readonly jwt: JwtConfig;
  readonly auth: AuthConfig;
  readonly aws: AwsConfig;
  readonly crypto: CryptoConfig;
  readonly observability: ObservabilityConfig;
  readonly features: FeatureFlags;
  readonly storage: StorageConfig;
  readonly queue: QueueConfig;
  readonly outbox: OutboxConfig;
  readonly featureFlagsRuntime: FeatureFlagsRuntimeConfig;
  readonly mail: MailConfig;
}

export function buildAppConfiguration(env: RawEnv): AppConfiguration {
  return {
    app: {
      env: env.NODE_ENV,
      name: env.APP_NAME,
      version: env.APP_VERSION,
      host: env.APP_HOST,
      port: env.APP_PORT,
      globalPrefix: env.APP_GLOBAL_PREFIX,
      apiVersion: env.APP_API_VERSION,
      baseUrl: env.APP_BASE_URL,
      bodyLimit: env.HTTP_BODY_LIMIT,
      trustProxy: env.HTTP_TRUST_PROXY,
      cors: {
        origins: Object.freeze([...env.CORS_ORIGINS]),
        credentials: env.CORS_CREDENTIALS,
      },
      build: {
        commit: env.APP_BUILD_SHA,
        time: env.APP_BUILD_TIME,
      },
      isProduction: env.NODE_ENV === 'production',
      isStaging: env.NODE_ENV === 'staging',
      isDevelopment: env.NODE_ENV === 'development',
      isTest: env.NODE_ENV === 'test',
    },
    logger: {
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY,
      redactSecrets: env.LOG_REDACT_SECRETS,
      httpExcludePaths: Object.freeze([...env.LOG_HTTP_EXCLUDE_PATHS]),
      sampleRateInfo: env.LOG_SAMPLE_RATE_INFO,
      baseBindings: env.LOG_BASE_BINDINGS,
    },
    swagger: {
      enabled: env.SWAGGER_ENABLED,
      path: env.SWAGGER_PATH,
      title: env.SWAGGER_TITLE,
      description: env.SWAGGER_DESCRIPTION,
      version: env.SWAGGER_VERSION,
    },
    db: {
      url: env.DB_URL,
      poolSize: env.DB_POOL_SIZE,
      poolTimeout: env.DB_POOL_TIMEOUT,
      logQueries: env.DB_LOG_QUERIES,
      slowQueryThresholdMs: env.DB_SLOW_QUERY_THRESHOLD_MS,
      transactionMaxWaitMs: env.DB_TRANSACTION_MAX_WAIT_MS,
      transactionTimeoutMs: env.DB_TRANSACTION_TIMEOUT_MS,
    },
    redis: {
      url: env.REDIS_URL,
      keyPrefix: env.REDIS_KEY_PREFIX,
    },
    jwt: {
      privateKeyBase64: env.JWT_PRIVATE_KEY_BASE64,
      publicKeyBase64: env.JWT_PUBLIC_KEY_BASE64,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
      passwordPepper: env.AUTH_PASSWORD_PEPPER,
    },
    auth: {
      refreshTtlDefaultSeconds: env.AUTH_REFRESH_TTL_DEFAULT_SECONDS,
      refreshTtlRememberMeSeconds: env.AUTH_REFRESH_TTL_REMEMBER_ME_SECONDS,
      lockoutMaxAttempts: env.AUTH_LOCKOUT_MAX_ATTEMPTS,
      lockoutDurationSeconds: env.AUTH_LOCKOUT_DURATION_SECONDS,
    },
    aws: {
      region: env.AWS_REGION,
      s3Bucket: env.AWS_S3_BUCKET,
      s3KmsKeyId: env.AWS_S3_KMS_KEY_ID,
    },
    crypto: {
      piiKeyB64: env.PII_AES_KEY_B64,
    },
    observability: {
      otelEnabled: env.OTEL_ENABLED,
      otelServiceName: env.OTEL_SERVICE_NAME,
      otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    features: {
      debugEndpoints: env.FEATURE_DEBUG_ENDPOINTS,
    },
    storage: {
      driver: env.STORAGE_DRIVER,
      localRoot: env.STORAGE_LOCAL_ROOT,
      publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
      maxUploadBytes: env.STORAGE_MAX_UPLOAD_BYTES,
      downloadUrlTtlSeconds: env.STORAGE_DOWNLOAD_URL_TTL_SECONDS,
      s3: {
        endpoint: env.STORAGE_S3_ENDPOINT,
        region: env.STORAGE_S3_REGION,
        bucket: env.STORAGE_S3_BUCKET,
        accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
      },
    },
    queue: {
      processorEnabled: env.JOBS_PROCESSOR_ENABLED,
      pollIntervalMs: env.JOBS_POLL_INTERVAL_MS,
      claimBatchSize: env.JOBS_CLAIM_BATCH_SIZE,
      defaultMaxAttempts: env.JOBS_DEFAULT_MAX_ATTEMPTS,
      defaultBackoffMs: Object.freeze(
        env.JOBS_DEFAULT_BACKOFF_MS.map((entry) => {
          const n = Number(entry);
          if (!Number.isFinite(n) || n <= 0) {
            throw new Error(`JOBS_DEFAULT_BACKOFF_MS contained non-positive number: ${entry}`);
          }
          return Math.trunc(n);
        }),
      ),
    },
    outbox: {
      dispatcherEnabled: env.OUTBOX_DISPATCHER_ENABLED,
      pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
      dispatchBatchSize: env.OUTBOX_DISPATCH_BATCH_SIZE,
      maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
    },
    featureFlagsRuntime: {
      cacheTtlSeconds: env.FEATURE_FLAG_CACHE_TTL_SECONDS,
    },
    mail: {
      transport: env.MAIL_TRANSPORT,
      from: env.MAIL_FROM,
      smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
      },
    },
  };
}
