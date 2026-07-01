/**
 * Permission glob matcher — the core of the RBAC check.
 *
 * Matching rules:
 *
 *   1. `*`              matches every permission key.
 *   2. `<resource>.*`   matches any key whose resource segment equals
 *                        `<resource>` (and that has at least one trailing
 *                        segment — `students.*` does NOT match `students`).
 *   3. `*.<action>`     matches any key whose final segment equals
 *                        `<action>` (and that has at least two segments).
 *   4. Exact equality   `students.read` matches `students.read`.
 *
 * The matcher rejects anything more exotic — no `students.*.read`, no
 * regex, no negation. Keep the surface small so reasoning about a denied
 * request doesn't require running the matcher in your head.
 *
 * Performance: this runs in the request hot path. Implementation is plain
 * string ops, no allocations beyond the slice-on-prefix path.
 */
import {
  PERMISSION_WILDCARD_ALL,
  PERMISSION_WILDCARD_PREFIX,
  PERMISSION_WILDCARD_SUFFIX,
} from './rbac.constants';

/**
 * Returns true iff the `granted` permission entry covers `required`.
 * `required` should be a literal permission key (no wildcards). Wildcards
 * on the required side would let a caller probe for "any of these" without
 * stating their intent — use `hasAnyPermission` instead.
 */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === PERMISSION_WILDCARD_ALL) {
    return true;
  }
  if (granted === required) {
    return true;
  }
  if (granted.endsWith(PERMISSION_WILDCARD_SUFFIX)) {
    // `students.*` → `students.<something>`. The grant's prefix must
    // include the dot so we don't accidentally match `studentsfoo.read`.
    const prefix = granted.slice(0, -1); // 'students.'
    return required.length > prefix.length && required.startsWith(prefix);
  }
  if (granted.startsWith(PERMISSION_WILDCARD_PREFIX)) {
    const suffix = granted.slice(1); // '.read'
    return required.length > suffix.length && required.endsWith(suffix);
  }
  return false;
}

/** Does the granted set cover the single required permission? */
export function hasPermission(
  granted: readonly string[],
  required: string,
): boolean {
  for (const g of granted) {
    if (permissionMatches(g, required)) {
      return true;
    }
  }
  return false;
}

/** AND-semantics: granted must cover every entry in `required`. */
export function hasAllPermissions(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  for (const r of required) {
    if (!hasPermission(granted, r)) {
      return false;
    }
  }
  return true;
}

/** OR-semantics: granted must cover at least one entry in `required`. */
export function hasAnyPermission(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0) {
    return true;
  }
  for (const r of required) {
    if (hasPermission(granted, r)) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a permission key shape. Used at write time (RoleService /
 * seeder) so a typo doesn't sit in the DB undetected. The matcher would
 * silently never match such an entry.
 *
 * Allowed:
 *   - `*`
 *   - `<segment>.*`            (one resource then `.*`)
 *   - `*.<segment>`            (`*.` then one action)
 *   - `<segment>.<segment>...` (two or more segments, no wildcards inside)
 *
 * Each segment is `[a-z][a-z0-9_]*`. Numbers / underscores allowed; dashes
 * and uppercase aren't — this is enforced at write time so the catalog
 * stays normalised.
 */
const SEGMENT_RE = /^[a-z][a-z0-9_]*$/;

export function isValidPermissionKey(key: string): boolean {
  if (key === PERMISSION_WILDCARD_ALL) {
    return true;
  }
  if (key.endsWith(PERMISSION_WILDCARD_SUFFIX)) {
    const head = key.slice(0, -PERMISSION_WILDCARD_SUFFIX.length);
    return head.length > 0 && SEGMENT_RE.test(head);
  }
  if (key.startsWith(PERMISSION_WILDCARD_PREFIX)) {
    const tail = key.slice(PERMISSION_WILDCARD_PREFIX.length);
    return tail.length > 0 && SEGMENT_RE.test(tail);
  }
  if (key.includes('*')) {
    // No internal or trailing wildcards beyond the two patterns above.
    return false;
  }
  const parts = key.split('.');
  if (parts.length < 2) {
    return false;
  }
  return parts.every((p) => SEGMENT_RE.test(p));
}
