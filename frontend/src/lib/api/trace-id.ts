/**
 * Per-request correlation id. The backend reads/echoes header `X-Request-Id`
 * (lowercased `x-request-id`). See backend/src/core/logger/correlation.ts.
 *
 * Returns a 26-character Crockford base32 ULID — the same shape the backend
 * mints when no upstream id is present, and exactly what fits the audit
 * log's `request_id Char(26)` column. Using `web-<uuid>` (40 chars) here
 * blows up the audit insert with Prisma P2000.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(now: number): string {
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    const mod = now % 32;
    out = CROCKFORD[mod] + out;
    now = (now - mod) / 32;
  }
  return out;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += CROCKFORD[bytes[i]! % 32];
  }
  return out;
}

export function newRequestId(): string {
  return encodeTime(Date.now()) + encodeRandom();
}

