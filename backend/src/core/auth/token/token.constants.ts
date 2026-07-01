/**
 * Token constants — JWT claim keys and token-format constants.
 *
 * Centralised here so the strategy, signer, and refresh-rotation code can't
 * disagree about, say, the `tenant_id` vs `tenantId` claim name.
 */

export const JWT_ALGORITHM = 'RS256' as const;

/**
 * Refresh token wire format: `rft_<26-char-ulid>`. The `rft_` prefix lets
 * client/server log scrubbers recognise refresh tokens by shape and
 * scrub them (vs. confusing them for short opaque ids).
 */
export const REFRESH_TOKEN_PREFIX = 'rft_';
export const REFRESH_TOKEN_LENGTH = REFRESH_TOKEN_PREFIX.length + 26;

/** Header used to carry the access token. Bearer scheme per API_STANDARDS §6. */
export const AUTH_HEADER = 'authorization';
export const AUTH_SCHEME = 'Bearer';

/** Reflector keys for `@Public()` and similar opt-outs. */
export const IS_PUBLIC_METADATA_KEY = 'auth:is_public';
