export const APP_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? 'Jilanix',
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
  env: process.env.NEXT_PUBLIC_APP_ENV ?? 'local',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1',
} as const;

/**
 * Auth-time configuration.
 *
 * Production: tenant is derived from `window.location.hostname` inside the
 * shared axios layer (`lib/api/client.ts`) — `abc.jilanix.com` → `abc`;
 * `admin.jilanix.com` → no header. The frontend bundle is tenant-agnostic;
 * the same artifact serves every school subdomain.
 *
 * Development: localhost has no DNS, so the dev supplies the tenant slug
 * via `NEXT_PUBLIC_DEV_SCHOOL_SLUG`. The axios layer reads `devSchoolSlug`
 * and attaches `X-Tenant-Slug` on every outbound request. This variable is
 * dev-only and must NOT be set in production.
 *
 * `defaultSchoolId` is the legacy F1.3 UUID injection point. It is kept on
 * the config surface for one migration cycle so any external import still
 * type-checks; the application no longer reads it.
 */
export const AUTH_CONFIG = {
  /**
   * Development-only tenant slug. Honoured by the axios interceptor when
   * `window.location.hostname` resolves to localhost. Never required, and
   * ignored entirely on production hosts.
   */
  devSchoolSlug: (process.env.NEXT_PUBLIC_DEV_SCHOOL_SLUG ?? '').trim() || null,
  /**
   * @deprecated Sprint F1.3 UUID injection. The frontend no longer reads
   * this value — tenant resolution moved to host/header. Slated for
   * removal in a future sprint.
   */
  defaultSchoolId: (process.env.NEXT_PUBLIC_DEFAULT_SCHOOL_ID ?? '').trim() || null,
} as const;

/**
 * Brand assets — single source of truth for the product wordmark and logo mark.
 * Change `APP_CONFIG.name` (or `NEXT_PUBLIC_APP_NAME`) to rebrand the UI; the
 * wordmark is composed from `name` at render time so no asset swap is needed.
 */
export const BRAND = {
  name: APP_CONFIG.name,
  markSrc: '/brand/mark.svg',
  markSize: 32,
} as const;

export const STORAGE_KEYS = {
  theme: 'schoolos.theme',
  sidebarCollapsed: 'schoolos.sidebar.collapsed',
  accessToken: 'schoolos.auth.accessToken',
  refreshToken: 'schoolos.auth.refreshToken',
  tokenExpiresAt: 'schoolos.auth.expiresAt',
  cmdkRecent: 'schoolos.cmdk.recent',
} as const;

export const BREAKPOINTS = {
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1280,
  xxl: 1440,
} as const;

export const QUERY_KEYS = {
  session: ['auth', 'session'] as const,
  permissions: ['auth', 'permissions'] as const,
  featureFlags: ['auth', 'feature-flags'] as const,
  unreadNotifications: ['notifications', 'unread-count'] as const,
};
