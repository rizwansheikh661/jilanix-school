/**
 * RefreshTokenService — generate, parse, and hash refresh tokens.
 *
 * Wire format: `rft_<26-char-ulid>`. The opaque ULID body gives 130 bits
 * of monotonic random entropy (more than enough; ULIDs are cryptographically
 * random in their last 80 bits, plus 48 bits of timestamp).
 *
 * Why not a JWT for refresh?
 *   - We want the refresh token to be revocable on a single indexed write.
 *     JWT refresh tokens force a denylist or short TTL — both worse.
 *   - We rotate the refresh token on every use; an opaque DB row is the
 *     simplest source of truth for "this rotation already happened".
 *
 * At rest we store ONLY `sha256(token)` (hex). Hashing a 130-bit secret
 * doesn't need PBKDF/argon2 — it's already a random secret, not a guessable
 * password — so a fast SHA-2 is correct.
 */
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';

import { ConfigService } from '../../config';
import { RefreshInvalidError } from '../auth.errors';
import {
  REFRESH_TOKEN_LENGTH,
  REFRESH_TOKEN_PREFIX,
} from './token.constants';

export interface GeneratedRefreshToken {
  readonly token: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/**
 * W1.2 additive options bag for `generate()`. All fields are optional.
 *
 * Backward-compatibility rules:
 *   - `generate()` (no args) keeps the legacy behaviour: TTL is read from
 *     `config.jwt.refreshTtlSeconds`. Existing call sites (AuthService
 *     login / refresh paths) do not change.
 *   - When ANY option is supplied, the service consults `config.auth.*`
 *     for the W1.1 TTL keys instead of the legacy `jwt.refreshTtlSeconds`.
 *     This lets future auth waves opt in incrementally without touching
 *     present-day callers.
 *
 * Field semantics:
 *   - `rememberMe`        — when true, pick `auth.refreshTtlRememberMeSeconds`;
 *                           otherwise `auth.refreshTtlDefaultSeconds`.
 *   - `ttlOverrideSeconds`— overrides the rememberMe-derived TTL when the
 *                           caller knows the exact duration it wants (e.g.
 *                           tests, password-reset flows in later waves).
 *   - `chainExpiresAt`    — caps the expiry to preserve the original chain
 *                           deadline across a rotation. The final
 *                           `expiresAt` is `min(now + ttl, chainExpiresAt)`
 *                           so a rotated session can never outlive the
 *                           chain it inherits from.
 */
export interface GenerateRefreshTokenOptions {
  readonly rememberMe?: boolean;
  readonly ttlOverrideSeconds?: number;
  readonly chainExpiresAt?: Date;
}

@Injectable()
export class RefreshTokenService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Mint a new opaque refresh token + the hash to persist.
   *
   * No-arg call: legacy behaviour — TTL from `jwt.refreshTtlSeconds`. This
   * preserves backward compatibility for existing AuthService callers.
   *
   * With options: TTL is resolved from `auth.refreshTtl*` keys; if
   * `chainExpiresAt` is supplied the expiry is clamped so a rotated
   * session never outlives its chain.
   */
  public generate(options?: GenerateRefreshTokenOptions): GeneratedRefreshToken {
    const body = ulid();
    const token = `${REFRESH_TOKEN_PREFIX}${body}`;
    const now = Date.now();
    const ttlSeconds = this.resolveTtlSeconds(options);
    let expiresAtMs = now + ttlSeconds * 1000;

    if (options?.chainExpiresAt !== undefined) {
      const chainMs = options.chainExpiresAt.getTime();
      if (chainMs < expiresAtMs) {
        expiresAtMs = chainMs;
      }
    }

    return {
      token,
      tokenHash: this.hash(token),
      expiresAt: new Date(expiresAtMs),
    };
  }

  private resolveTtlSeconds(options?: GenerateRefreshTokenOptions): number {
    if (options === undefined) {
      // Legacy path — preserves the pre-W1.2 contract verbatim.
      return this.config.jwt.refreshTtlSeconds;
    }
    if (options.ttlOverrideSeconds !== undefined) {
      return options.ttlOverrideSeconds;
    }
    const auth = this.config.auth;
    return options.rememberMe === true
      ? auth.refreshTtlRememberMeSeconds
      : auth.refreshTtlDefaultSeconds;
  }

  /**
   * Hash a wire token to the form we store in `user_sessions.refresh_token_hash`.
   * Validates shape first — a malformed token never reaches the DB.
   */
  public hash(token: string): string {
    if (!isWellFormed(token)) {
      throw new RefreshInvalidError();
    }
    return sha256Hex(token);
  }

  /** Cheap shape guard — does NOT touch the DB. */
  public isWellFormed(token: unknown): token is string {
    return isWellFormed(token);
  }
}

function isWellFormed(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === REFRESH_TOKEN_LENGTH &&
    value.startsWith(REFRESH_TOKEN_PREFIX)
  );
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
