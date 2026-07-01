import { z } from 'zod';

/**
 * Single source of truth for environment variables.
 *
 * Rules:
 *  - Every key the application consumes must appear here.
 *  - Sprint 1 (modules 1+2) keys are required.
 *  - Future-sprint keys are declared as optional so new modules can opt-in
 *    without schema churn. When their consuming module lands, a service-level
 *    guard (e.g. PrismaModule) enforces presence.
 *  - Coercions are explicit (`z.coerce.*`) because `process.env` values are
 *    always strings.
 *  - Sensitive keys are tagged in REDACTED_KEYS (see redaction.ts) so they
 *    are masked in boot logs and any error surfaces.
 */

const NodeEnvEnum = z.enum(['development', 'test', 'staging', 'production']);
export type NodeEnv = z.infer<typeof NodeEnvEnum>;

const LogLevelEnum = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);
export type LogLevel = z.infer<typeof LogLevelEnum>;

const booleanString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', ''].includes(v)) {
      return false;
    }
    throw new Error(`Expected boolean-like string, got "${value}"`);
  });

const csvList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

export const EnvSchema = z
  .object({
    // ----- APP -----
    NODE_ENV: NodeEnvEnum.default('development'),
    APP_NAME: z.string().min(1).default('schoolos-api'),
    APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_HOST: z.string().min(1).default('0.0.0.0'),
    APP_GLOBAL_PREFIX: z.string().min(1).default('api'),
    APP_API_VERSION: z.string().regex(/^v\d+$/, 'Must be like "v1", "v2"').default('v1'),
    APP_BASE_URL: z.string().url().default('http://localhost:3000'),
    APP_VERSION: z.string().min(1).default('0.1.0'),
    APP_BUILD_SHA: z.string().default('unknown'),
    APP_BUILD_TIME: z.string().default('unknown'),

    CORS_ORIGINS: csvList.default(''),
    CORS_CREDENTIALS: booleanString.default('true'),
    HTTP_BODY_LIMIT: z.string().min(2).default('1mb'),
    HTTP_TRUST_PROXY: booleanString.default('false'),

    // ----- LOGGER -----
    LOG_LEVEL: LogLevelEnum.default('info'),
    LOG_PRETTY: booleanString.default('false'),
    LOG_REDACT_SECRETS: booleanString.default('true'),
    LOG_HTTP_EXCLUDE_PATHS: csvList.default('/health,/ready,/version,/metrics'),
    LOG_SAMPLE_RATE_INFO: z.coerce.number().min(0).max(1).default(1),
    LOG_BASE_BINDINGS: booleanString.default('true'),

    // ----- SWAGGER -----
    SWAGGER_ENABLED: booleanString.default('true'),
    SWAGGER_PATH: z.string().min(1).default('api/docs'),
    SWAGGER_TITLE: z.string().min(1).default('SchoolOS API'),
    SWAGGER_DESCRIPTION: z.string().default('Multi-tenant school ERP API'),
    SWAGGER_VERSION: z.string().min(1).default('0.1.0'),

    // ----- DATABASE (Sprint 2+) -----
    DB_URL: z
      .string()
      .url()
      .refine((v) => v.startsWith('mysql://') || v.startsWith('mysqls://'), {
        message: 'DB_URL must be a mysql:// or mysqls:// connection string.',
      })
      .optional(),
    DB_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(10),
    DB_POOL_TIMEOUT: z.coerce.number().int().min(1).max(120).default(10),
    DB_LOG_QUERIES: booleanString.default('false'),
    DB_SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().min(1).max(60_000).default(250),
    DB_TRANSACTION_MAX_WAIT_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
    DB_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),

    // ----- REDIS (Sprint 3+) -----
    REDIS_URL: z.string().url().optional(),
    REDIS_KEY_PREFIX: z.string().default('schoolos:dev'),

    // ----- JWT / AUTH (Sprint 1 §8 — optional now, required when Auth module lands) -----
    JWT_PRIVATE_KEY_BASE64: z.string().optional(),
    JWT_PUBLIC_KEY_BASE64: z.string().optional(),
    JWT_ISSUER: z.string().default('schoolos'),
    JWT_AUDIENCE: z.string().default('schoolos-api'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).default(2_592_000),
    AUTH_PASSWORD_PEPPER: z.string().optional(),

    // ----- AUTH PATCH — V1 (Wave W1.1) -----
    // Refresh-token TTL split: default vs Remember Me. Wired into AuthService
    // in a later wave; declared here so config validation passes at boot.
    AUTH_REFRESH_TTL_DEFAULT_SECONDS: z.coerce.number().int().min(3600).default(86_400),
    AUTH_REFRESH_TTL_REMEMBER_ME_SECONDS: z.coerce.number().int().min(3600).default(2_592_000),
    // Basic account protection (plan §17). Counter increments per User on
    // INVALID_CREDENTIALS; at AUTH_LOCKOUT_MAX_ATTEMPTS the account is locked
    // for AUTH_LOCKOUT_DURATION_SECONDS. Behaviour ships in a later wave.
    AUTH_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
    AUTH_LOCKOUT_DURATION_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),

    // ----- AWS / S3 (Sprint 4) -----
    AWS_REGION: z.string().default('ap-south-1'),
    AWS_S3_BUCKET: z.string().optional(),
    AWS_S3_KMS_KEY_ID: z.string().optional(),

    // ----- CRYPTO (Sprint 4 — PII column encryption) -----
    // Base64-encoded 32-byte AES-256 key. Required in production; in
    // development an ephemeral per-process key is generated by CryptoService
    // when unset (a warning is logged). Per-tenant CMK is a Sprint-18 swap.
    PII_AES_KEY_B64: z.string().optional(),

    // ----- OBSERVABILITY -----
    OTEL_ENABLED: booleanString.default('false'),
    OTEL_SERVICE_NAME: z.string().default('schoolos-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

    // ----- FEATURE TOGGLES -----
    FEATURE_DEBUG_ENDPOINTS: booleanString.default('false'),

    // ----- STORAGE (Sprint 5) -----
    // Driver selection. `local` is the default; `s3-compatible` is a stub
    // until Sprint 6 wires AWS S3 / DO Spaces / Cloudflare R2 / MinIO. App
    // code talks to `StorageProvider` and is unaware of the driver.
    STORAGE_DRIVER: z.enum(['local', 's3-compatible']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().min(1).default('./var/storage'),
    // Used by `LocalStorageProvider` to format download URLs. Optional in
    // dev (defaults to APP_BASE_URL + /api/v1/uploads/:id/download). Useful
    // when the app is fronted by a CDN.
    STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),
    STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800),
    STORAGE_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    // S3-compatible (only validated when STORAGE_DRIVER='s3-compatible').
    STORAGE_S3_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_REGION: z.string().optional(),
    STORAGE_S3_BUCKET: z.string().optional(),
    STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
    STORAGE_S3_FORCE_PATH_STYLE: booleanString.default('false'),

    // ----- JOBS (Sprint 5) -----
    // Processor is opt-in. Off by default so unit/e2e tests don't drain the
    // queue mid-spec; the API server, when used as a worker, sets this to
    // true. Splitting into a separate apps/worker is a Sprint 7 concern.
    JOBS_PROCESSOR_ENABLED: booleanString.default('false'),
    JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
    JOBS_CLAIM_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(10),
    JOBS_DEFAULT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
    // CSV of backoff intervals in ms. Indexed by attempt number (1-based).
    // After exhausting the list the last entry is reused.
    JOBS_DEFAULT_BACKOFF_MS: csvList.default('30000,120000,600000,3600000,14400000'),

    // ----- OUTBOX (Sprint 5) -----
    OUTBOX_DISPATCHER_ENABLED: booleanString.default('false'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
    OUTBOX_DISPATCH_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(10),

    // ----- FEATURE FLAGS (Sprint 5 runtime) -----
    FEATURE_FLAG_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),

    // ----- MAIL TRANSPORT (Sprint N1) -----
    // Provider-agnostic outbound email. `smtp` covers Mailpit in dev and any
    // transactional SMTP provider (SES SMTP, SendGrid SMTP, Mailgun SMTP) in
    // prod. `json` is a no-network sink for tests — Nodemailer returns the
    // composed message instead of dispatching.
    MAIL_TRANSPORT: z.enum(['smtp', 'json']).default('smtp'),
    MAIL_FROM: z.string().default('SchoolOS <no-reply@schoolos.local>'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: booleanString.default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.LOG_PRETTY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LOG_PRETTY'],
          message: 'LOG_PRETTY must be false in production (structured JSON only).',
        });
      }
      if (env.CORS_ORIGINS.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'CORS wildcard "*" is forbidden in production.',
        });
      }
      if (env.FEATURE_DEBUG_ENDPOINTS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['FEATURE_DEBUG_ENDPOINTS'],
          message: 'FEATURE_DEBUG_ENDPOINTS must be false in production.',
        });
      }
      if (env.SWAGGER_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SWAGGER_ENABLED'],
          message: 'SWAGGER_ENABLED must be false in production.',
        });
      }
      if (env.DB_URL === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DB_URL'],
          message: 'DB_URL is required in production.',
        });
      }
      if (env.DB_LOG_QUERIES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DB_LOG_QUERIES'],
          message: 'DB_LOG_QUERIES must be false in production (PII risk + log volume).',
        });
      }
    }
    if (env.STORAGE_DRIVER === 's3-compatible') {
      const required: Array<keyof RawEnv> = [
        'STORAGE_S3_ENDPOINT',
        'STORAGE_S3_REGION',
        'STORAGE_S3_BUCKET',
        'STORAGE_S3_ACCESS_KEY_ID',
        'STORAGE_S3_SECRET_ACCESS_KEY',
      ];
      for (const key of required) {
        const value = env[key];
        if (value === undefined || (typeof value === 'string' && value.length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER='s3-compatible'.`,
          });
        }
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.PII_AES_KEY_B64 === undefined || env.PII_AES_KEY_B64.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PII_AES_KEY_B64'],
          message: 'PII_AES_KEY_B64 is required in production (base64-encoded 32-byte AES-256 key).',
        });
      } else {
        try {
          const decoded = Buffer.from(env.PII_AES_KEY_B64, 'base64');
          if (decoded.length !== 32) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['PII_AES_KEY_B64'],
              message: `PII_AES_KEY_B64 must decode to 32 bytes; got ${decoded.length}.`,
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['PII_AES_KEY_B64'],
            message: 'PII_AES_KEY_B64 must be valid base64.',
          });
        }
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.MAIL_TRANSPORT === 'json') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MAIL_TRANSPORT'],
          message: "MAIL_TRANSPORT='json' is for tests only; use 'smtp' in production.",
        });
      }
      if (env.MAIL_TRANSPORT === 'smtp' && (!env.SMTP_HOST || env.SMTP_HOST === 'localhost')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_HOST'],
          message: 'SMTP_HOST must be set to a real host in production (localhost is dev-only).',
        });
      }
    }
  });

export type RawEnv = z.infer<typeof EnvSchema>;
