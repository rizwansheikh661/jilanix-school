import type { SessionUser } from '@/types/domain';

/**
 * Map a freshly-bound session to its post-login landing route.
 *
 * Sprint F2.1 scope ships only the four authentication pages; no
 * persona-specific dashboards exist yet. The directive is to drive
 * routing from `/auth/me` data (`actorScope` + `roles[]`) — never from
 * a hard-coded role-to-URL table inside the LoginForm — so this helper
 * derives the path here and returns the same `/dashboard` placeholder
 * for every persona today. When per-persona dashboards land, only this
 * function changes.
 *
 * Server-side enforcement of `mustChangePassword` is deferred (freeze
 * cert §9), so the client routes users into the first-login page when
 * the flag is true rather than waiting for a backend redirect.
 */
const ROLE_LANDING: Readonly<Record<string, string>> = {
  platform_admin: '/dashboard',
  school_admin: '/dashboard',
  auditor: '/dashboard',
  teacher: '/dashboard',
  parent: '/dashboard',
  student: '/dashboard',
};

export function resolveLandingPath(user: Pick<SessionUser, 'actorScope' | 'roles' | 'mustChangePassword'>): string {
  if (user.mustChangePassword === true) {
    return '/first-login';
  }
  for (const role of user.roles ?? []) {
    const path = ROLE_LANDING[role];
    if (path) return path;
  }
  // Global actors without an explicit role key still belong somewhere.
  if (user.actorScope === 'global') return '/dashboard';
  return '/dashboard';
}
