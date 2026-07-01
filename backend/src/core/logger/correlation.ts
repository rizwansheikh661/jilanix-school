/**
 * Correlation primitives shared by the logger middleware, the request-context
 * middleware, and any test harness that needs to mint a synthetic id.
 *
 * Header contract:
 *   - We accept `X-Request-Id` from upstream (gateway, ALB, client SDK) and
 *     echo the same id back on the response so end-to-end tracing works
 *     across the gateway boundary without any extra coordination.
 *   - HTTP header names are case-insensitive; Node lowercases them on
 *     `req.headers`, so we match against the lowercase form.
 *   - `traceparent` (W3C Trace Context) is read separately so that a real
 *     trace id (when OTel ships in a later sprint) is available to the
 *     RequestContext even before request-id is generated.
 *
 * Why ULID instead of UUIDv4?
 *   ULIDs are 26-character Crockford base32 strings, lexicographically
 *   sortable by timestamp. That means request-id columns/indexes order
 *   naturally by time, which is hugely useful in `audit_log` and slow-query
 *   correlation tooling. They are also URL-safe and shorter than UUIDs.
 */
import { randomBytes } from 'node:crypto';

import { ulid } from 'ulid';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_HEADER_OUT = 'X-Request-Id';

/** W3C Trace Context — read-only in Sprint 1 (OTel exporter ships later). */
export const TRACEPARENT_HEADER = 'traceparent';

/** Optional client identity headers used to enrich logs and analytics. */
export const CLIENT_NAME_HEADER = 'x-client-name';
export const CLIENT_VERSION_HEADER = 'x-client-version';

/** Strict ULID character class (Crockford base32, no I/L/O/U). */
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Crockford base32 charset Pino/log scrapers can rely on. Generated via
 * `ulid()` which uses `crypto.getRandomValues` internally.
 */
export function generateRequestId(): string {
  return ulid();
}

/**
 * Accept an arbitrary header value and return a sanitised request id. We
 * accept any non-empty 8–128 char ASCII id (so gateways using UUIDs or
 * their own trace prefixes still work), but reject control characters and
 * obvious junk to keep log scrapers happy. Anything outside that contract
 * is replaced with a fresh ULID.
 */
export function normaliseRequestId(raw: unknown): string {
  if (typeof raw !== 'string') {
    return generateRequestId();
  }
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    return generateRequestId();
  }
  // Reject anything with control characters or whitespace inside.
  if (/[\s\x00-\x1f\x7f]/.test(trimmed)) {
    return generateRequestId();
  }
  return trimmed;
}

export function isUlid(value: string): boolean {
  return ULID_RE.test(value);
}

/**
 * Extract the trace-id segment from a `traceparent` header
 * (`00-<trace-id>-<span-id>-<flags>`). Returns `undefined` if the header is
 * missing or malformed — we never fabricate a trace id from random bytes
 * because that would silently break correlation when OTel is wired up.
 */
export function extractTraceId(traceparent: unknown): string | undefined {
  if (typeof traceparent !== 'string') {
    return undefined;
  }
  const parts = traceparent.split('-');
  if (parts.length < 4) {
    return undefined;
  }
  const [version, traceId] = parts;
  if (version !== '00') {
    return undefined;
  }
  if (!/^[0-9a-f]{32}$/.test(traceId ?? '')) {
    return undefined;
  }
  return traceId;
}

/**
 * Fallback span id when a `traceparent` is absent but we need *something*
 * stable in tests. Not exported in production code paths — the real OTel
 * SDK will replace this.
 */
export function syntheticSpanId(): string {
  return randomBytes(8).toString('hex');
}
