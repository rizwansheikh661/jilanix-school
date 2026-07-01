import { apiClient } from '@/lib/api/client';
import { apiGet, apiPost } from '@/lib/api/http';
import type { SessionUser } from '@/types/domain';
import { writeTokens, clearTokens } from '@/lib/auth/token-storage';

/**
 * Auth API surface — wraps the eight frozen `/api/v1/auth/*` endpoints from
 * AUTHENTICATION_FREEZE_V1.md §5. Verified against
 * `backend/src/core/auth/auth.controller.ts` + `auth.dto.ts`.
 *
 * Contract notes (Sprint F2.2):
 *   - Tenant is resolved by the shared axios layer from
 *     `window.location.hostname` in production and from
 *     `NEXT_PUBLIC_DEV_SCHOOL_SLUG` on localhost. The login body therefore
 *     carries only `{ email, password, rememberMe? }`. The legacy
 *     `schoolId` field remains accepted by the backend and by this client
 *     for one migration cycle (deprecated; do not set in new code).
 *   - Access token expiry arrives as an ISO timestamp; parsed to unix-ms
 *     for `expiresAt`.
 *   - `rememberMe: true` bumps the refresh token TTL from 1 day to 30 days
 *     (verified §6 — `rememberMe` edge in AUTH_FINAL_RUNTIME_VERIFICATION).
 *   - All POSTs that mutate state pass `idempotent: true` so the client
 *     stamps an `Idempotency-Key` header (honoured by the backend).
 */

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
  deviceId?: string;
  /**
   * @deprecated F1.3-era body field. The backend now resolves tenant from
   * host/`X-Tenant-Slug` header; new code must not set this. Kept optional
   * for one migration cycle so any external caller still type-checks.
   */
  schoolId?: string;
  /**
   * @deprecated F1.3-era body field. Tenant comes from the axios header.
   */
  tenantSlug?: string;
}

interface AuthTokensDto {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: 'Bearer';
  mustChangePassword: boolean;
}

export interface LoginResult {
  mustChangePassword: boolean;
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  const tokens = await apiPost<AuthTokensDto, LoginPayload>('/auth/login', payload, {
    idempotent: true,
  });
  const expiresAt = Date.parse(tokens.accessTokenExpiresAt);
  writeTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Number.isNaN(expiresAt) ? Date.now() + 15 * 60_000 : expiresAt,
  });
  return { mustChangePassword: tokens.mustChangePassword };
}

export async function fetchSession(): Promise<SessionUser> {
  return apiGet<SessionUser>('/auth/me');
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout', {}, { idempotent: true });
  } catch {
    // Best-effort: server-side revoke may fail (e.g. platform admin path
    // hits a tenant-scoped query). Local tokens are still cleared below,
    // so the user is signed out regardless.
  } finally {
    clearTokens();
  }
}

export interface LogoutAllResult {
  revokedSessions: number;
}

export async function logoutAll(): Promise<LogoutAllResult> {
  try {
    return await apiPost<LogoutAllResult, Record<string, never>>(
      '/auth/logout-all',
      {},
      { idempotent: true },
    );
  } finally {
    clearTokens();
  }
}

export interface PasswordResetRequestPayload {
  email: string;
  /**
   * @deprecated F1.3-era field. Tenant is resolved by the axios layer.
   */
  schoolId?: string;
}

export interface PasswordResetRequestResult {
  accepted: true;
}

/**
 * Endpoint always returns `{ accepted: true }` regardless of whether the
 * email matches (no enumeration leak — freeze cert §5).
 */
export async function requestPasswordReset(
  payload: PasswordResetRequestPayload,
): Promise<PasswordResetRequestResult> {
  return apiPost<PasswordResetRequestResult, PasswordResetRequestPayload>(
    '/auth/password-reset/request',
    payload,
    { idempotent: true },
  );
}

export interface PasswordResetConfirmPayload {
  token: string;
  newPassword: string;
}

export async function confirmPasswordReset(
  payload: PasswordResetConfirmPayload,
): Promise<void> {
  await apiPost<void, PasswordResetConfirmPayload>(
    '/auth/password-reset/confirm',
    payload,
    { idempotent: true },
  );
}

export interface FirstLoginChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export async function firstLoginChangePassword(
  payload: FirstLoginChangePasswordPayload,
): Promise<void> {
  await apiPost<void, FirstLoginChangePasswordPayload>(
    '/auth/first-login/change-password',
    payload,
    { idempotent: true },
  );
}
