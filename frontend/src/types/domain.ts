// ============================================================================
// Domain types — session, permission, feature flag, tenant
// Shapes mirror the backend wire contracts frozen in AUTHENTICATION_FREEZE_V1.
// ============================================================================

export type ActorScope = 'tenant' | 'global' | 'public';

/**
 * The shape returned by GET /api/v1/auth/me.
 *
 * Source of truth: AUTHENTICATION_FREEZE_V1.md §5 + AUTH_FINAL_RUNTIME_VERIFICATION.md §6
 * (verified runtime payload from a live backend) and backend
 * `src/core/auth/auth.dto.ts` (`AuthMeDto`).
 *
 * Fields populated by the live `/auth/me` response:
 *   - userId, schoolId, actorScope, roleIds, sessionId
 *   - displayName, email
 *   - roles      — role keys (e.g. 'platform_admin', 'school_admin', 'teacher',
 *                  'parent', 'student'). Drives client-side routing.
 *   - permissions — expanded permission keys (wildcards already resolved).
 *   - featureFlags — per-session boolean map (module.*, comms.*, examination.*, …).
 *   - mustChangePassword — flag also echoed on the login response.
 */
export interface SessionUser {
  userId: string;
  schoolId: string | null;
  actorScope: ActorScope;
  roleIds: readonly string[];
  sessionId: string;
  displayName?: string;
  email?: string;
  roles: readonly string[];
  permissions: readonly string[];
  featureFlags: Readonly<Record<string, boolean>>;
  mustChangePassword?: boolean;
}

/**
 * Local token bundle persisted in storage. `expiresAt` is a unix millis
 * timestamp derived from backend `accessTokenExpiresAt` (ISO).
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export type PermissionKey = string;

export interface FeatureFlag {
  key: string;
  enabled: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  subdomain?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'TRIAL';
}
