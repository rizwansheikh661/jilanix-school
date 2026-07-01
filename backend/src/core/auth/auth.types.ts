/**
 * Cross-cutting auth types — JWT claim shape, the lightweight principal that
 * lives on `req.user` and in `RequestContext`, and the token-pair payload
 * returned from login / refresh.
 *
 * Claim names follow API_STANDARDS §6 (snake_case in the JWT itself; the
 * camelCase shape is on the request principal). RBAC role IDs ride in the
 * JWT but Sprint 1 always emits `[]` until Module 10 lands.
 */
import type { AuthMeDto } from './auth.dto';

/**
 * The scope an *authenticated* principal can have. Note this is narrower
 * than RequestContext's ActorScope (which also includes 'public') — an
 * authenticated user is by definition not public.
 */
export type AuthenticatedScope = 'tenant' | 'global';

/**
 * The wire JWT payload — what we actually sign.
 *   sub        — user id (uuid).
 *   tenant_id  — school id, or `null` for global scope.
 *   scope      — `tenant` | `global`.
 *   role_ids   — RBAC role identifiers; empty until Module 10.
 *   sid        — UserSession.id of the chain root (rotation-stable).
 *   chain_id   — UserSession.chainId (lets the API revoke the chain).
 *   jti        — unique JWT id (denylist hook).
 */
export interface JwtClaims {
  readonly sub: string;
  readonly tenant_id: string | null;
  readonly scope: AuthenticatedScope;
  readonly role_ids: readonly string[];
  readonly sid: string;
  readonly chain_id: string;
  readonly jti: string;
  readonly iat: number;
  readonly exp: number;
  readonly iss: string;
  readonly aud: string;
}

/**
 * Lightweight principal — what JwtAuthGuard attaches to `req.user` and what
 * `@CurrentUser()` returns. We deliberately don't include the full user row
 * so handlers don't accidentally serialise it.
 */
export interface AuthPrincipal {
  readonly userId: string;
  readonly schoolId: string | null;
  readonly actorScope: AuthenticatedScope;
  readonly roleIds: readonly string[];
  readonly sessionId: string;
  readonly chainId: string;
  readonly tokenId: string;
}

export interface AuthTokenPair {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
  readonly tokenType: 'Bearer';
  /**
   * Sprint 14.1 — when true the caller MUST navigate to a forced
   * password-change flow before any other action. Defaults to `false`
   * for tokens minted via paths that don't carry the user flag
   * (e.g. refresh — the access token is already trusted).
   */
  readonly mustChangePassword: boolean;
  /**
   * W1.4 — optional principal-introspection summary, same shape as
   * `GET /auth/me`. Populated by `AuthService.login` so the client can
   * skip a follow-up `/me` round trip. Absent on the refresh path
   * because the principal is already trusted there.
   */
  readonly user?: AuthMeDto;
}

export interface LoginContext {
  readonly ip?: string;
  readonly userAgent?: string;
  readonly deviceId?: string;
}
