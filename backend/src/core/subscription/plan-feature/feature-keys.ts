/**
 * BUILT_IN_FEATURE_KEYS — the canonical catalog of feature keys recognised
 * by the Sprint 15 subscription module.
 *
 *  - LIMIT keys (7) carry a numeric cap. The seeded mode tells the guard
 *    whether the cap applies (LIMITED), is removed (UNLIMITED) or the
 *    feature is off (DISABLED).
 *  - TOGGLE keys (7) are pure on/off bits; mode is ENABLED or DISABLED.
 *
 * Adding a new feature key:
 *   1. Add to BUILT_IN_FEATURE_KEYS_LIMIT / TOGGLE arrays.
 *   2. Extend PLAN_FEATURE_SEEDS in plan-feature.seeder.ts with the
 *      per-plan values.
 *   3. The seeder is idempotent — re-running asserts the new row exists.
 */
export const BUILT_IN_FEATURE_KEYS_LIMIT = [
  'student_count',
  'staff_count',
  'branch_count',
  'email_monthly',
  'sms_monthly',
  'whatsapp_monthly',
  'storage_bytes',
] as const;

export const BUILT_IN_FEATURE_KEYS_TOGGLE = [
  'parent_portal',
  'student_portal',
  'payroll',
  'accounting',
  'advanced_reporting',
  'multi_branch',
  'event_management',
] as const;

export const BUILT_IN_FEATURE_KEYS = [
  ...BUILT_IN_FEATURE_KEYS_LIMIT,
  ...BUILT_IN_FEATURE_KEYS_TOGGLE,
] as const;

export type BuiltInLimitFeatureKey = (typeof BUILT_IN_FEATURE_KEYS_LIMIT)[number];
export type BuiltInToggleFeatureKey = (typeof BUILT_IN_FEATURE_KEYS_TOGGLE)[number];
export type BuiltInFeatureKey = (typeof BUILT_IN_FEATURE_KEYS)[number];

/**
 * Mapping from canonical LIMIT feature keys to SchoolUsage column names.
 * The guard service uses this to read / increment the right counter.
 *
 * The codomain is the narrow `UsageCounterColumn` union — the set of
 * mutable counter columns on SchoolUsage. Keeping it narrow lets the
 * guard pass results straight into `SchoolUsageRepository.incrementColumn`
 * without re-asserting.
 */
export type UsageCounterColumnName =
  | 'studentCount'
  | 'staffCount'
  | 'branchCount'
  | 'smsUsedThisPeriod'
  | 'whatsappUsedThisPeriod'
  | 'emailUsedThisPeriod'
  | 'storageBytesUsed';

export const LIMIT_FEATURE_KEY_TO_USAGE_COLUMN: Readonly<
  Record<BuiltInLimitFeatureKey, UsageCounterColumnName>
> = Object.freeze({
  student_count: 'studentCount',
  staff_count: 'staffCount',
  branch_count: 'branchCount',
  email_monthly: 'emailUsedThisPeriod',
  sms_monthly: 'smsUsedThisPeriod',
  whatsapp_monthly: 'whatsappUsedThisPeriod',
  storage_bytes: 'storageBytesUsed',
});

export function isBuiltInFeatureKey(key: string): key is BuiltInFeatureKey {
  return (BUILT_IN_FEATURE_KEYS as readonly string[]).includes(key);
}

export function isLimitFeatureKey(key: string): key is BuiltInLimitFeatureKey {
  return (BUILT_IN_FEATURE_KEYS_LIMIT as readonly string[]).includes(key);
}
