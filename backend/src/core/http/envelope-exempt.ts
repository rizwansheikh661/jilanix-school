/**
 * Paths that bypass the standard `{ data, meta }` / `{ error }` envelope.
 *
 * These are version-neutral probes registered outside the `/api/v1`
 * prefix. They return raw bodies that probe agents and orchestrators
 * (Kubernetes, monitoring) parse directly. Wrapping them would break
 * those integrations.
 *
 * Both `GlobalExceptionFilter` and `ResponseEnvelopeInterceptor` consult
 * this list. If you add a new exempt route, register it here.
 */
export const ENVELOPE_EXEMPT_PATHS = ['/health', '/ready', '/version'] as const;

export function isEnvelopeExemptPath(path: string | undefined): boolean {
  if (path === undefined) return false;
  return (ENVELOPE_EXEMPT_PATHS as readonly string[]).includes(path);
}
