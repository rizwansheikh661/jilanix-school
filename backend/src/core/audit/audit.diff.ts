/**
 * Diff + redaction helpers shared by the Prisma `auditExt` capture path
 * and the service decorator path.
 *
 * Rules (per BACKEND_ARCHITECTURE §11.4 / PRISMA_STRATEGY §7):
 *
 *   - Compute the diff as `{ before: <only changed keys' old vals>,
 *                            after:  <only changed keys' new vals> }`
 *     — DO NOT store the full row. Audit rows are kept forever; minimising
 *     payload size compounds over years.
 *
 *   - Replace any value at a sensitive key with the literal string
 *     `[REDACTED]`. The base set (`BASE_SENSITIVE_FIELDS`) covers
 *     credentials and PII that are NEVER safe to log; per-model annotations
 *     extend it.
 *
 *   - Cap the serialised diff at 64 KiB. Larger diffs are returned with a
 *     `__overflow` marker so the writer can offload to the `audit_payloads`
 *     side table (Sprint 1 just keeps the marker — the side table lands
 *     when the audit retention story is finalised).
 */

const SIZE_LIMIT_BYTES = 64 * 1024;
const OVERFLOW_MARKER = '__schoolos_audit_overflow__';

const BASE_SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'access_token',
  'refresh_token',
  'id_token',
  'secret',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'mfaSecret',
  'mfa_secret',
  'mfaCode',
  'otp',
  'pin',
  'cvv',
  'aadhaar',
  'aadhaarNumber',
  'aadhaarEncrypted',
  'aadhaar_encrypted',
  'pan',
  'panNumber',
  'panEncrypted',
  'pan_encrypted',
  'bankAccountEncrypted',
  'bank_account_encrypted',
  'cardNumber',
  'card_number',
  'authorization',
  'cookie',
  'set-cookie',
]);

const REDACTED = '[REDACTED]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walk `value` and replace any property whose key is in `sensitive` with
 * `[REDACTED]`. Returns a new object — does not mutate the input.
 */
export function redactSensitive(
  value: unknown,
  extraSensitive: readonly string[] = [],
): unknown {
  const sensitive = new Set<string>(BASE_SENSITIVE_FIELDS);
  for (const f of extraSensitive) {
    sensitive.add(f);
  }
  return walk(value, sensitive);
}

function walk(value: unknown, sensitive: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, sensitive));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (sensitive.has(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = walk(v, sensitive);
    }
  }
  return out;
}

/**
 * Build a minimal before/after diff. Returns only changed keys. Keys
 * present in `before` but missing in `after` are recorded as `after: null`;
 * keys added by `after` are recorded with `before: undefined`. Equal values
 * are dropped entirely.
 */
export function diffRows(
  before: unknown,
  after: unknown,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const beforeObj = isPlainObject(before) ? before : {};
  const afterObj = isPlainObject(after) ? after : {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const beforeOut: Record<string, unknown> = {};
  const afterOut: Record<string, unknown> = {};
  for (const k of keys) {
    if (!shallowEqual(beforeObj[k], afterObj[k])) {
      beforeOut[k] = beforeObj[k] ?? null;
      afterOut[k] = afterObj[k] ?? null;
    }
  }
  return { before: beforeOut, after: afterOut };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export interface CappedPayload {
  readonly value: unknown;
  readonly overflow: boolean;
  readonly originalBytes: number;
}

/**
 * Serialise once to check the byte budget. If the payload is too big, return
 * a small placeholder so the writer can offload to side storage; the original
 * is still kept in memory so the writer can act on it.
 */
export function capPayload(value: unknown): CappedPayload {
  const serialised = JSON.stringify(value ?? null);
  const bytes = Buffer.byteLength(serialised, 'utf8');
  if (bytes <= SIZE_LIMIT_BYTES) {
    return { value: value ?? null, overflow: false, originalBytes: bytes };
  }
  return {
    value: { [OVERFLOW_MARKER]: true, originalBytes: bytes },
    overflow: true,
    originalBytes: bytes,
  };
}

export const __audit_internals__ = {
  BASE_SENSITIVE_FIELDS,
  SIZE_LIMIT_BYTES,
  OVERFLOW_MARKER,
};
