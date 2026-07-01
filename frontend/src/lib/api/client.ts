import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { APP_CONFIG, AUTH_CONFIG } from '@/lib/config/app';
import { clearTokens, getAccessToken, readTokens, writeTokens } from '@/lib/auth/token-storage';
import { ApiError } from './errors';
import { newRequestId } from './trace-id';
import { uuid } from '@/lib/utils/uuid';
import type { ApiErrorEnvelope, FieldIssue } from '@/types/api';

declare module 'axios' {
  // Per-call hints — call sites can opt into idempotency keys, attach
  // If-Match, or mark requests as already-attempted-refresh.
  export interface AxiosRequestConfig {
    idempotent?: boolean;
    ifMatch?: string | number | null;
    skipAuth?: boolean;
    _retriedAfterRefresh?: boolean;
  }
}

const REQUEST_ID_HEADER = 'X-Request-Id';
const TENANT_SLUG_HEADER = 'X-Tenant-Slug';

/**
 * Single source of truth for tenant resolution on the frontend.
 *
 * Production: derive from `window.location.hostname`.
 *   `abc.jilanix.com`   → `abc`
 *   `admin.jilanix.com` → null (platform admin sends no header)
 *
 * Development: localhost has no DNS, so fall back to
 * `NEXT_PUBLIC_DEV_SCHOOL_SLUG`. Unset in production builds.
 *
 * Returning `null` means "do not attach the header" — the backend will
 * either resolve the tenant from its own host parsing (`schoolos.in`
 * subdomain branch) or treat the request as platform-scoped.
 */
function resolveTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('127.')
  ) {
    return AUTH_CONFIG.devSchoolSlug;
  }

  const labels = host.split('.');
  if (labels.length < 3) return null;
  const first = labels[0]?.toLowerCase() ?? '';
  if (first === '' || first === 'admin' || first === 'www') return null;
  return first;
}

/**
 * Shape of `/api/v1/auth/refresh` response envelope.
 * Source: backend/src/core/auth/auth.dto.ts (AuthTokensDto).
 */
interface RefreshEnvelope {
  data: {
    accessToken: string;
    accessTokenExpiresAt: string; // ISO 8601
    refreshToken: string;
    refreshTokenExpiresAt: string; // ISO 8601
    tokenType: 'Bearer';
    mustChangePassword: boolean;
  };
}

let refreshInFlight: Promise<string | null> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function registerUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const slug = resolveTenantSlug();
    const refreshHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      [REQUEST_ID_HEADER]: newRequestId(),
    };
    if (slug) refreshHeaders[TENANT_SLUG_HEADER] = slug;
    const response = await axios.post<RefreshEnvelope>(
      `${APP_CONFIG.apiBaseUrl}/auth/refresh`,
      { refreshToken: tokens.refreshToken },
      { headers: refreshHeaders },
    );
    const payload = response.data?.data;
    if (!payload?.accessToken) return null;
    const expiresAt = Date.parse(payload.accessTokenExpiresAt);
    if (Number.isNaN(expiresAt)) return null;
    writeTokens({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ?? tokens.refreshToken,
      expiresAt,
    });
    return payload.accessToken;
  } catch {
    return null;
  }
}

function attachInterceptors(client: AxiosInstance): void {
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    // Request id — matches backend correlation header (X-Request-Id).
    config.headers.set(REQUEST_ID_HEADER, config.headers.get(REQUEST_ID_HEADER) ?? newRequestId());

    // Tenant slug — derived from window.location.hostname in production,
    // or NEXT_PUBLIC_DEV_SCHOOL_SLUG on localhost. Single source of truth;
    // no other layer should set this header.
    if (!config.headers.get(TENANT_SLUG_HEADER)) {
      const slug = resolveTenantSlug();
      if (slug) config.headers.set(TENANT_SLUG_HEADER, slug);
    }

    // Auth bearer
    if (!config.skipAuth) {
      const token = getAccessToken();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    }

    // Optimistic concurrency — backend expects a positive integer (quoted
    // ETag form is also accepted: backend strips surrounding quotes).
    if (config.ifMatch !== undefined && config.ifMatch !== null) {
      config.headers.set('If-Match', `"${config.ifMatch}"`);
    }

    // Idempotency — backend honours this header on POST/PUT/PATCH.
    const method = (config.method ?? '').toUpperCase();
    if (config.idempotent && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      if (!config.headers.get('Idempotency-Key')) {
        config.headers.set('Idempotency-Key', uuid());
      }
    }

    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiErrorEnvelope>) => {
      const original = error.config as InternalAxiosRequestConfig | undefined;
      const status = error.response?.status ?? 0;
      const envelope = error.response?.data;
      const isRefreshCall = (original?.url ?? '').endsWith('/auth/refresh');

      // Try refresh on first 401 (skip if the refresh call itself failed).
      if (
        status === 401 &&
        original &&
        !original._retriedAfterRefresh &&
        !original.skipAuth &&
        !isRefreshCall
      ) {
        original._retriedAfterRefresh = true;
        if (!refreshInFlight) {
          refreshInFlight = refreshAccessToken().finally(() => {
            refreshInFlight = null;
          });
        }
        const newToken = await refreshInFlight;
        if (newToken) {
          original.headers.set('Authorization', `Bearer ${newToken}`);
          return client.request(original);
        }
        clearTokens();
        unauthorizedHandler?.();
      }

      const payload = envelope?.error;
      const fields = (payload?.details?.fields as FieldIssue[] | undefined) ?? undefined;
      const requestId =
        payload?.requestId ??
        (error.response?.headers?.['x-request-id'] as string | undefined);

      const apiError = new ApiError({
        code: payload?.code ?? `HTTP_${status || 'UNKNOWN'}`,
        message: payload?.message ?? error.message ?? 'Network request failed',
        status,
        requestId,
        fields,
        details: payload?.details,
        raw: envelope,
      });

      return Promise.reject(apiError);
    },
  );
}

/**
 * Singleton axios instance pointing at the SchoolOS backend at `/api/v1`.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: APP_CONFIG.apiBaseUrl,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

attachInterceptors(apiClient);

export type { AxiosRequestConfig };
