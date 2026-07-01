import { STORAGE_KEYS } from '@/lib/config/app';
import type { AuthTokens } from '@/types/domain';

/**
 * Auth token storage layer. Centralized so we can swap to HttpOnly cookies
 * later without touching call sites. v1 uses localStorage per FRONTEND_FREEZE
 * (NextAuth explicitly excluded).
 */

const isBrowser = (): boolean => typeof window !== 'undefined';

export function readTokens(): AuthTokens | null {
  if (!isBrowser()) return null;
  try {
    const accessToken = window.localStorage.getItem(STORAGE_KEYS.accessToken);
    const refreshToken = window.localStorage.getItem(STORAGE_KEYS.refreshToken);
    const expiresAtRaw = window.localStorage.getItem(STORAGE_KEYS.tokenExpiresAt);
    if (!accessToken || !refreshToken || !expiresAtRaw) return null;
    const expiresAt = Number.parseInt(expiresAtRaw, 10);
    if (Number.isNaN(expiresAt)) return null;
    return { accessToken, refreshToken, expiresAt };
  } catch {
    return null;
  }
}

export function writeTokens(tokens: AuthTokens): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
    window.localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
    window.localStorage.setItem(STORAGE_KEYS.tokenExpiresAt, String(tokens.expiresAt));
  } catch {
    // storage may be unavailable (private mode); fail silent
  }
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.accessToken);
    window.localStorage.removeItem(STORAGE_KEYS.refreshToken);
    window.localStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);
  } catch {
    // ignore
  }
}

export function getAccessToken(): string | null {
  return readTokens()?.accessToken ?? null;
}

export function isTokenExpired(tokens: AuthTokens | null, skewMs = 30_000): boolean {
  if (!tokens) return true;
  return Date.now() + skewMs >= tokens.expiresAt;
}
