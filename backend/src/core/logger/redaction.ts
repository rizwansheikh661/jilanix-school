/**
 * Pino redaction paths. The list is intentionally exhaustive — adding a path
 * here is far cheaper than the cost of a single PII leak in a log file.
 *
 * Paths are evaluated against the entire log object, including the `req` /
 * `res` sub-objects that pino-http injects, so headers, cookies, and body
 * fields all need their own entries.
 *
 * Two flavours of path:
 *   - Property paths:  `req.headers.authorization`
 *   - Wildcard paths:  `*.password`, `*.token` — match any depth
 *
 * Pino's redact path grammar uses `[*]` for arrays and `*` for property
 * wildcards. See https://getpino.io/#/docs/redaction.
 *
 * The censor is `[REDACTED]` so logs remain valid JSON. Length is preserved
 * for headers we know are bearer tokens — that helps detect "stuck" tokens
 * without revealing material.
 */

const REQUEST_HEADER_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  'req.headers["proxy-authorization"]',
];

const RESPONSE_HEADER_PATHS = [
  'res.headers["set-cookie"]',
  'res.headers["x-api-key"]',
];

const BODY_PII_PATHS = [
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.currentPassword',
  '*.newPassword',
  '*.confirmPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.access_token',
  '*.refresh_token',
  '*.id_token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.privateKey',
  '*.private_key',
  '*.mfaSecret',
  '*.mfa_secret',
  '*.mfaCode',
  '*.otp',
  '*.pin',
  '*.cvv',
  '*.aadhaar',
  '*.aadhaarNumber',
  '*.pan',
  '*.panNumber',
  '*.dob',
  '*.dateOfBirth',
  '*.cardNumber',
  '*.card_number',
  '*.card.number',
  '*.card.cvv',
  '*.card.expiry',
  '*.cookie',
  '*.authorization',
];

/**
 * The list pino consumes. Order does not matter.
 */
export const PINO_REDACT_PATHS: readonly string[] = Object.freeze([
  ...REQUEST_HEADER_PATHS,
  ...RESPONSE_HEADER_PATHS,
  ...BODY_PII_PATHS,
]);

export const PINO_REDACT_CENSOR = '[REDACTED]';
