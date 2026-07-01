/**
 * lifecycle-transitions.ts — pure state machine for the `schools.lifecycle_status`
 * column.
 *
 * The matrix is intentionally narrow:
 *
 *      from / to →     TRIAL  ACTIVE  SUSPENDED  EXPIRED  CANCELLED
 *      TRIAL                  ✓                  ✓        ✓
 *      ACTIVE                          ✓                  ✓
 *      SUSPENDED              ✓                           ✓
 *      EXPIRED                ✓                           ✓
 *      CANCELLED                                          (terminal)
 *
 * Rules captured:
 *   - TRIAL → ACTIVE on plan activation, → EXPIRED on trial-end batch job,
 *     → CANCELLED if the super-admin abandons the school.
 *   - ACTIVE → SUSPENDED for billing / contract issues, → CANCELLED only.
 *   - SUSPENDED → ACTIVE on reactivation, → CANCELLED only.
 *   - EXPIRED → ACTIVE on plan assignment (re-activation), → CANCELLED only.
 *   - CANCELLED is terminal — no transitions allowed.
 *
 * Reactivating a cancelled school is *not* a lifecycle transition; the
 * super-admin must provision a brand new school. We enforce that here so
 * the service layer can stay branch-free.
 */
import type { SchoolLifecycleStatusValue } from '../../school/school/school.types';
import { InvalidLifecycleTransitionError } from '../provisioning.errors';

/**
 * Allowed `from → to[]` transitions. A target listed here may be applied
 * via `assertLifecycleTransition`. Anything else throws.
 */
export const LIFECYCLE_TRANSITIONS: Readonly<
  Record<SchoolLifecycleStatusValue, ReadonlyArray<SchoolLifecycleStatusValue>>
> = Object.freeze({
  TRIAL: Object.freeze(['ACTIVE', 'EXPIRED', 'CANCELLED'] as const),
  ACTIVE: Object.freeze(['SUSPENDED', 'CANCELLED'] as const),
  SUSPENDED: Object.freeze(['ACTIVE', 'CANCELLED'] as const),
  EXPIRED: Object.freeze(['ACTIVE', 'CANCELLED'] as const),
  CANCELLED: Object.freeze([] as const),
});

export function isLifecycleTransitionAllowed(
  from: SchoolLifecycleStatusValue,
  to: SchoolLifecycleStatusValue,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function assertLifecycleTransition(
  from: SchoolLifecycleStatusValue,
  to: SchoolLifecycleStatusValue,
): void {
  if (!isLifecycleTransitionAllowed(from, to)) {
    throw new InvalidLifecycleTransitionError(from, to);
  }
}
