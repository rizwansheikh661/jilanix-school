/**
 * API response envelope contract — the wire shape every controller
 * emits and every client SDK consumes.
 *
 * Per `docs/API_STANDARDS.md` §6/§7 and §22:
 *   - Success: `{ data, meta }` — never `200` with an `error` body.
 *   - Error:   `{ error: { code, message, details?, requestId } }`.
 *   - Bodies are camelCase (DB columns are snake_case and converted at
 *     the DTO boundary).
 *   - `requestId` echoes the `X-Request-Id` header / RequestContext.
 */

/** Canonical error code taxonomy — see API_STANDARDS §20. */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  STATE_INVALID: 'STATE_INVALID',
  LOCKED_RESOURCE: 'LOCKED_RESOURCE',
  RATE_LIMITED: 'RATE_LIMITED',
  EXTERNAL_PROVIDER_ERROR: 'EXTERNAL_PROVIDER_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Per-field validation issue — populated by the ValidationPipe bridge. */
export interface FieldIssue {
  /** Dotted path from the DTO root, e.g. `address.pincode`. */
  path: string;
  /** Stable per-field code, e.g. `IS_NOT_EMPTY`, `IS_EMAIL`. */
  code: string;
  /** Human-readable message. */
  message: string;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  /** Optional structured context — never includes Prisma internals or PII. */
  details?: Record<string, unknown>;
  requestId: string;
}

export interface ErrorEnvelope {
  error: ErrorPayload;
}

export interface SuccessMeta {
  requestId: string;
  /** Reserved for pagination / deprecation headers in later sprints. */
  [key: string]: unknown;
}

export interface SuccessEnvelope<T> {
  data: T;
  meta: SuccessMeta;
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** Type guard distinguishing a controller's pre-built envelope from a raw payload. */
export function isSuccessEnvelope(value: unknown): value is SuccessEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    typeof (value as { meta: unknown }).meta === 'object'
  );
}
