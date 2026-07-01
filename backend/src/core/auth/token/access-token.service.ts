/**
 * AccessTokenService — sign + verify the short-lived JWT access token.
 *
 * Why hand-rolled with `jsonwebtoken` (via @nestjs/jwt) instead of the
 * passport strategy doing both?
 *   - Sign and verify happen in different control flows. Login + refresh
 *     SIGN; the strategy + audit lookups VERIFY. Putting them in one
 *     service centralises the claim shape so they can't drift.
 *   - The strategy needs only verify; we don't want it to depend on
 *     `JWT_PRIVATE_KEY_BASE64` (services that only verify can run on
 *     hosts that hold the public key only — a useful future split).
 *
 * Claim contract (must match auth.types.ts JwtClaims):
 *   sub        — user id (uuid)
 *   tenant_id  — school id, or null for global
 *   scope      — 'tenant' | 'global'
 *   role_ids   — RBAC ids; [] until Module 10
 *   sid        — UserSession.id of the chain root
 *   chain_id   — UserSession.chainId
 *   jti        — uuid (per-token denylist hook)
 *   iat/exp/iss/aud — standard
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import { ConfigService } from '../../config';
import { TokenExpiredError, TokenMalformedError } from '../auth.errors';
import type { JwtClaims } from '../auth.types';
import { JWT_ALGORITHM } from './token.constants';
import { JwtKeysService } from './jwt-keys.service';

export interface SignAccessTokenInput {
  readonly userId: string;
  readonly schoolId: string | null;
  readonly actorScope: 'tenant' | 'global';
  readonly roleIds: readonly string[];
  readonly sessionId: string;
  readonly chainId: string;
}

export interface SignedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
  readonly tokenId: string;
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly keys: JwtKeysService,
    private readonly config: ConfigService,
  ) {}

  public async sign(input: SignAccessTokenInput): Promise<SignedAccessToken> {
    const tokenId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const ttl = this.config.jwt.accessTtlSeconds;
    const exp = now + ttl;

    const payload: Omit<JwtClaims, 'iat' | 'exp'> = {
      sub: input.userId,
      tenant_id: input.schoolId,
      scope: input.actorScope,
      role_ids: [...input.roleIds],
      sid: input.sessionId,
      chain_id: input.chainId,
      jti: tokenId,
      iss: this.config.jwt.issuer,
      aud: this.config.jwt.audience,
    };

    const token = await this.jwt.signAsync(payload, {
      algorithm: JWT_ALGORITHM,
      privateKey: this.keys.privateKey,
      keyid: this.keys.kid,
      expiresIn: ttl,
      // We embed iss/aud in the payload directly so the verify path checks
      // them as claims (not as JWT options) — the typings stay simple.
      noTimestamp: false,
    });

    return {
      token,
      tokenId,
      expiresAt: new Date(exp * 1000),
    };
  }

  /**
   * Verify a bearer token. Throws domain auth errors mapped to 401:
   *   - TokenExpiredError    on `exp` past now
   *   - TokenMalformedError  on signature, format, iss/aud mismatch
   */
  public async verify(token: string): Promise<JwtClaims> {
    let decoded: JwtClaims;
    try {
      decoded = await this.jwt.verifyAsync<JwtClaims>(token, {
        algorithms: [JWT_ALGORITHM],
        publicKey: this.keys.publicKey,
      });
    } catch (err) {
      const name = (err as Error & { name?: string }).name;
      if (name === 'TokenExpiredError') {
        throw new TokenExpiredError();
      }
      throw new TokenMalformedError();
    }

    if (decoded.iss !== this.config.jwt.issuer || decoded.aud !== this.config.jwt.audience) {
      throw new TokenMalformedError();
    }
    return decoded;
  }
}
