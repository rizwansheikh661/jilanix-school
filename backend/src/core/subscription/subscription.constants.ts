/**
 * Subscription module constants — permission keys (24), outbox topics,
 * notification event keys, feature flags, job handler names, and field
 * guardrails for Sprint 15 SaaS Subscription & Plan Management Foundation.
 *
 * NO billing / invoicing / payments — explicitly OUT of scope.
 */

// ---------------------------------------------------------------------------
// Permissions — 24 keys
// ---------------------------------------------------------------------------
export const SubscriptionPermissions = {
  // plan-feature (5)
  PLAN_FEATURE_READ: 'subscription.plan_feature.read',
  PLAN_FEATURE_CREATE: 'subscription.plan_feature.create',
  PLAN_FEATURE_UPDATE: 'subscription.plan_feature.update',
  PLAN_FEATURE_DELETE: 'subscription.plan_feature.delete',
  PLAN_FEATURE_BULK_REPLACE: 'subscription.plan_feature.bulk_replace',

  // subscription super-admin (10)
  SUBSCRIPTION_READ: 'subscription.subscription.read',
  SUBSCRIPTION_HISTORY_READ: 'subscription.subscription.history.read',
  SUBSCRIPTION_ASSIGN: 'subscription.subscription.assign',
  SUBSCRIPTION_ACTIVATE: 'subscription.subscription.activate',
  SUBSCRIPTION_UPGRADE: 'subscription.subscription.upgrade',
  SUBSCRIPTION_DOWNGRADE: 'subscription.subscription.downgrade',
  SUBSCRIPTION_RENEW: 'subscription.subscription.renew',
  SUBSCRIPTION_SUSPEND: 'subscription.subscription.suspend',
  SUBSCRIPTION_REACTIVATE: 'subscription.subscription.reactivate',
  SUBSCRIPTION_CANCEL: 'subscription.subscription.cancel',

  // subscription tenant (1)
  SUBSCRIPTION_SELF_READ: 'subscription.subscription.self_read',

  // usage super-admin (3)
  USAGE_READ: 'subscription.usage.read',
  USAGE_RECOMPUTE: 'subscription.usage.recompute',
  USAGE_EVENTS_READ: 'subscription.usage.events.read',

  // usage tenant (1)
  USAGE_SELF_READ: 'subscription.usage.self_read',

  // feature-flag (2)
  FEATURE_FLAG_READ: 'subscription.feature_flag.read',
  FEATURE_FLAG_UPDATE: 'subscription.feature_flag.update',

  // guard introspection (2)
  GUARD_CHECK_PLAN: 'subscription.guard.check_plan',
  GUARD_CHECK_FEATURE: 'subscription.guard.check_feature',
} as const;

export type SubscriptionPermission =
  (typeof SubscriptionPermissions)[keyof typeof SubscriptionPermissions];

export const SUBSCRIPTION_PERMISSION_DESCRIPTIONS: Readonly<
  Record<SubscriptionPermission, string>
> = Object.freeze({
  [SubscriptionPermissions.PLAN_FEATURE_READ]: 'List plan features.',
  [SubscriptionPermissions.PLAN_FEATURE_CREATE]: 'Create a plan feature row.',
  [SubscriptionPermissions.PLAN_FEATURE_UPDATE]: 'Update an existing plan feature row.',
  [SubscriptionPermissions.PLAN_FEATURE_DELETE]: 'Soft-delete a plan feature row.',
  [SubscriptionPermissions.PLAN_FEATURE_BULK_REPLACE]:
    'Bulk-replace the plan feature matrix for a plan.',
  [SubscriptionPermissions.SUBSCRIPTION_READ]: 'Read a school subscription.',
  [SubscriptionPermissions.SUBSCRIPTION_HISTORY_READ]: 'Read subscription history.',
  [SubscriptionPermissions.SUBSCRIPTION_ASSIGN]: 'Assign a plan to a school as a subscription.',
  [SubscriptionPermissions.SUBSCRIPTION_ACTIVATE]: 'Activate a pending/trial subscription.',
  [SubscriptionPermissions.SUBSCRIPTION_UPGRADE]: 'Upgrade a school to a higher plan.',
  [SubscriptionPermissions.SUBSCRIPTION_DOWNGRADE]: 'Downgrade a school to a lower plan.',
  [SubscriptionPermissions.SUBSCRIPTION_RENEW]: 'Renew an active subscription.',
  [SubscriptionPermissions.SUBSCRIPTION_SUSPEND]: 'Suspend an active subscription.',
  [SubscriptionPermissions.SUBSCRIPTION_REACTIVATE]: 'Reactivate a suspended subscription.',
  [SubscriptionPermissions.SUBSCRIPTION_CANCEL]: 'Cancel (terminal) a subscription.',
  [SubscriptionPermissions.SUBSCRIPTION_SELF_READ]:
    "Read the tenant's own subscription and feature matrix.",
  [SubscriptionPermissions.USAGE_READ]: 'Read aggregate usage for a school.',
  [SubscriptionPermissions.USAGE_RECOMPUTE]: 'Recompute SchoolUsage from canonical tables.',
  [SubscriptionPermissions.USAGE_EVENTS_READ]: 'Read the per-school usage event ledger.',
  [SubscriptionPermissions.USAGE_SELF_READ]: "Read the tenant's own usage snapshot.",
  [SubscriptionPermissions.FEATURE_FLAG_READ]: 'Read subscription module feature flags.',
  [SubscriptionPermissions.FEATURE_FLAG_UPDATE]: 'Toggle subscription module feature flags.',
  [SubscriptionPermissions.GUARD_CHECK_PLAN]: 'Introspect plan status via the guard service.',
  [SubscriptionPermissions.GUARD_CHECK_FEATURE]:
    'Introspect a single feature availability via the guard service.',
});

// ---------------------------------------------------------------------------
// Outbox topics
// ---------------------------------------------------------------------------
export const SubscriptionOutboxTopics = {
  SUBSCRIPTION_ASSIGNED: 'subscription.subscription.assigned',
  SUBSCRIPTION_ACTIVATED: 'subscription.subscription.activated',
  SUBSCRIPTION_EXPIRING: 'subscription.subscription.expiring',
  SUBSCRIPTION_EXPIRED: 'subscription.subscription.expired',
  SUBSCRIPTION_SUSPENDED: 'subscription.subscription.suspended',
  SUBSCRIPTION_REACTIVATED: 'subscription.subscription.reactivated',
  SUBSCRIPTION_CANCELLED: 'subscription.subscription.cancelled',
  PLAN_UPGRADED: 'subscription.plan.upgraded',
  PLAN_DOWNGRADED: 'subscription.plan.downgraded',
  PLAN_RENEWED: 'subscription.plan.renewed',
  PLAN_FEATURE_CHANGED: 'subscription.plan_feature.changed',
  USAGE_THRESHOLD_REACHED: 'subscription.usage.threshold_reached',
  USAGE_LIMIT_EXCEEDED: 'subscription.usage.limit_exceeded',
  USAGE_RECOMPUTED: 'subscription.usage.recomputed',
} as const;

export type SubscriptionOutboxTopic =
  (typeof SubscriptionOutboxTopics)[keyof typeof SubscriptionOutboxTopics];

// ---------------------------------------------------------------------------
// Notification event keys
// ---------------------------------------------------------------------------
export const SubscriptionNotificationEventKeys = {
  // lifecycle (9)
  SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_EXPIRING: 'SUBSCRIPTION_EXPIRING',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_SUSPENDED: 'SUBSCRIPTION_SUSPENDED',
  SUBSCRIPTION_REACTIVATED: 'SUBSCRIPTION_REACTIVATED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  PLAN_UPGRADED: 'PLAN_UPGRADED',
  PLAN_DOWNGRADED: 'PLAN_DOWNGRADED',
  PLAN_RENEWED: 'PLAN_RENEWED',
  // usage (2)
  USAGE_THRESHOLD_REACHED: 'USAGE_THRESHOLD_REACHED',
  USAGE_LIMIT_EXCEEDED: 'USAGE_LIMIT_EXCEEDED',
} as const;

export type SubscriptionNotificationEventKey =
  (typeof SubscriptionNotificationEventKeys)[keyof typeof SubscriptionNotificationEventKeys];

// ---------------------------------------------------------------------------
// Feature flags — 4 keys
// ---------------------------------------------------------------------------
export const SubscriptionFeatureFlags = {
  /** Master switch — when off the module's controllers refuse all writes. */
  MODULE: 'module.subscription',
  /** Gate upgrade/downgrade endpoints. */
  ALLOW_PLAN_CHANGE: 'subscription.allow_plan_change',
  /**
   * Gate `assertAndConsume`. When off the guard logs the over-limit attempt
   * but does NOT throw — useful during a billing experiment.
   */
  ENFORCE_LIMITS: 'subscription.enforce_limits',
  /** Gate the 80/90/100% threshold notification dispatch. */
  NOTIFY_THRESHOLDS: 'subscription.notify_thresholds',
} as const;

export type SubscriptionFeatureFlag =
  (typeof SubscriptionFeatureFlags)[keyof typeof SubscriptionFeatureFlags];

// ---------------------------------------------------------------------------
// Job handler names
// ---------------------------------------------------------------------------
export const SubscriptionJobHandlers = {
  SUBSCRIPTION_EXPIRY_SCAN: 'subscription.expiry-scan',
} as const;

// ---------------------------------------------------------------------------
// Field guardrails
// ---------------------------------------------------------------------------
export const FEATURE_KEY_MAX_LENGTH = 80;
export const FEATURE_DESCRIPTION_MAX_LENGTH = 500;
export const FEATURE_LIMIT_MIN = 0;
export const FEATURE_LIMIT_MAX = 2_147_483_647;
export const CANCELLATION_REASON_MAX_LENGTH = 500;
export const SUBSCRIPTION_DEFAULT_TRIAL_DAYS = 30;

// ---------------------------------------------------------------------------
// Threshold band thresholds (percent)
// ---------------------------------------------------------------------------
export const USAGE_THRESHOLD_PERCENT_80 = 80;
export const USAGE_THRESHOLD_PERCENT_90 = 90;
export const USAGE_THRESHOLD_PERCENT_100 = 100;
