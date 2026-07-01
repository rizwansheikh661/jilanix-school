/**
 * Names of environment variables whose values must be redacted in any
 * boot-time log, error message, or exposed snapshot. Match is case-sensitive
 * on the full key name OR a case-insensitive suffix from SENSITIVE_SUFFIXES.
 *
 * Adding a key here is the responsibility of the developer who introduces it;
 * a unit test verifies that every SCHEMA key matching a sensitive-looking
 * pattern is either explicitly listed here or marked safe.
 */
export const REDACTED_KEYS: ReadonlySet<string> = new Set([
  'JWT_PRIVATE_KEY_BASE64',
  'JWT_PUBLIC_KEY_BASE64',
  'AUTH_PASSWORD_PEPPER',
  'AWS_S3_KMS_KEY_ID',
  'PII_AES_KEY_B64',
]);

const SENSITIVE_SUFFIXES = ['_SECRET', '_KEY', '_TOKEN', '_PASSWORD', '_DSN', '_PEPPER'];

const ALLOW_NON_SENSITIVE = new Set([
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'JWT_ACCESS_TTL_SECONDS',
  'JWT_REFRESH_TTL_SECONDS',
  'REDIS_KEY_PREFIX',
  'AWS_S3_KMS_KEY_ID',
]);

export function isSensitiveKey(key: string): boolean {
  if (REDACTED_KEYS.has(key)) {
    return true;
  }
  if (ALLOW_NON_SENSITIVE.has(key)) {
    return REDACTED_KEYS.has(key);
  }
  const upper = key.toUpperCase();
  if (SENSITIVE_SUFFIXES.some((suffix) => upper.endsWith(suffix))) {
    return true;
  }
  // Also match flattened camelCase paths like `jwt.privateKeyBase64` or
  // `aws.s3KmsKeyId` which never line up with the env-style suffixes above.
  const tail = key.split('.').pop() ?? key;
  const SENSITIVE_TOKENS = ['secret', 'password', 'pepper', 'token', 'privatekey', 'kmskey', 'apikey', 'dsn'];
  const lowered = tail.toLowerCase();
  return SENSITIVE_TOKENS.some((token) => lowered.includes(token));
}

/**
 * Mask a value for safe display. Empty/undefined → "<unset>". Short values
 * fully masked. Long values reveal length + last 4 chars to aid debugging
 * without leaking material.
 */
export function maskValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '<unset>';
  }
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s.length === 0) {
    return '<empty>';
  }
  if (s.length <= 8) {
    return '***';
  }
  return `***${s.slice(-4)} (len=${s.length})`;
}
