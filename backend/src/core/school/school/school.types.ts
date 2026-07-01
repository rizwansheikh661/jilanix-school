/**
 * Row shape for the platform `schools` table, surfaced by the Sprint 14
 * super-admin / lifecycle paths. Kept in this sub-module (not in the
 * domain-wide `school.types.ts`) because the sibling tables don't need it
 * and exposing the platform row at the top level would invite tenant-scoped
 * callers to query the root by mistake.
 */
export type SchoolLifecycleStatusValue =
  | 'TRIAL'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED';
export const SCHOOL_LIFECYCLE_STATUS_VALUES: readonly SchoolLifecycleStatusValue[] = Object.freeze([
  'TRIAL',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'CANCELLED',
]);

export type SchoolPlanStatusValue = 'ACTIVE' | 'ASSIGNED' | 'EXPIRED' | 'CANCELLED';
export const SCHOOL_PLAN_STATUS_VALUES: readonly SchoolPlanStatusValue[] = Object.freeze([
  'ACTIVE',
  'ASSIGNED',
  'EXPIRED',
  'CANCELLED',
]);

export interface SchoolRootRow {
  readonly id: string;
  readonly slug: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly countryCode: string;
  readonly gstin: string | null;
  readonly pan: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly stateCode: string | null;
  readonly pincode: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
  readonly timezone: string;
  readonly localeDefault: string;
  readonly status: string;
  readonly onboardedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly lifecycleStatus: SchoolLifecycleStatusValue;
  readonly trialStartDate: Date | null;
  readonly trialEndDate: Date | null;
  readonly trialExtendedCount: number;
  readonly planId: string | null;
  readonly planAssignedAt: Date | null;
  readonly planExpiresAt: Date | null;
  readonly planStatus: SchoolPlanStatusValue | null;
  readonly suspendedAt: Date | null;
  readonly suspendedReason: string | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}
