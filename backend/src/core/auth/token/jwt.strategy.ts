/**
 * JwtStrategy — Passport strategy for RS256 bearer tokens.
 *
 * The strategy's `validate(payload)` runs AFTER passport-jwt has verified
 * the signature, exp, iss, and aud. We still cross-check on every
 * authenticated request:
 *   - The session must still be active. A revoked session (logout,
 *     password change, reuse cascade) must invalidate the token NOW —
 *     not at its `exp`.
 *   - The user must still be `active`. Disabled / locked users have all
 *     their tokens turned into 401s.
 *
 * Two extra DB reads per request is the price for "logout takes effect
 * immediately." A Redis hot-path denylist can land later without
 * touching this strategy.
 */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '../../config';
import { RequestContextRegistry } from '../../request-context';
import {
  SessionRevokedError,
  TokenMalformedError,
  UserDisabledError,
} from '../auth.errors';
import type { AuthPrincipal, JwtClaims } from '../auth.types';
import { SessionRepository } from '../repositories/session.repository';
import { UserRepository } from '../repositories/user.repository';
import { JwtKeysService } from './jwt-keys.service';
import { JWT_ALGORITHM } from './token.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    keys: JwtKeysService,
    config: ConfigService,
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: [JWT_ALGORITHM],
      secretOrKey: keys.publicKey,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  }

  public async validate(payload: JwtClaims): Promise<AuthPrincipal> {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.chain_id !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw new TokenMalformedError();
    }

    const schoolId = payload.tenant_id;

    // Upgrade the RequestContext BEFORE the tenant-scoped DB reads below.
    // The repository calls (`sessions.isActiveById`, `users.findActiveById`)
    // hit TENANT_OWNED tables, and the Prisma `tenantScopeExt` rejects
    // them unless `ctx.schoolId` is bound. Passport invokes this strategy
    // before `JwtAuthGuard.handleRequest` runs — which is where the
    // upgrade used to live — so the upgrade has to happen here, ahead of
    // the first repo call. Guarded so unit tests that exercise
    // `validate()` outside an HTTP context (no bound ALS frame) still
    // work. The guard's own upgrade is idempotent and left in place.
    if (RequestContextRegistry.peek() !== undefined) {
      RequestContextRegistry.upgrade({
        schoolId: schoolId ?? undefined,
        userId: payload.sub,
        actorScope: payload.scope,
        roleIds: [...payload.role_ids],
      });
    }

    if (schoolId !== null) {
      const sessionActive = await this.sessions.isActiveById({
        schoolId,
        sessionId: payload.sid,
      });
      if (!sessionActive) {
        throw new SessionRevokedError();
      }

      const user = await this.users.findActiveById(schoolId, payload.sub);
      if (user === null) {
        throw new TokenMalformedError();
      }
      if (user.status === 'disabled' || user.status === 'locked') {
        throw new UserDisabledError();
      }
    }

    return {
      userId: payload.sub,
      schoolId,
      actorScope: payload.scope,
      roleIds: [...payload.role_ids],
      sessionId: payload.sid,
      chainId: payload.chain_id,
      tokenId: payload.jti,
    };
  }
}
