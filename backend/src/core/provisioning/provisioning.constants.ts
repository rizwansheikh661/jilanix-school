/**
 * Provisioning module constants — permission keys + outbox topics for the
 * Sprint 14 Super-Admin & School-Provisioning Foundation.
 *
 * Wave 2 introduced Plan-CRUD keys; Waves 4-7 add school lifecycle, trial
 * management, orchestrator, and password-reset keys. Sprint 14 closes with
 * ~20 permission keys total.
 */

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
export const ProvisioningPermissions = {
  // Plan catalog (5)
  PLAN_READ: 'provisioning.plan.read',
  PLAN_CREATE: 'provisioning.plan.create',
  PLAN_UPDATE: 'provisioning.plan.update',
  PLAN_DELETE: 'provisioning.plan.delete',
  PLAN_ASSIGN: 'provisioning.plan.assign',

  // School provisioning lifecycle (7) — read, create (orchestrator entry),
  // update (legal/contact patch), and the four explicit lifecycle actions.
  SCHOOL_READ: 'provisioning.school.read',
  SCHOOL_CREATE: 'provisioning.school.create',
  SCHOOL_UPDATE: 'provisioning.school.update',
  SCHOOL_SUSPEND: 'provisioning.school.suspend',
  SCHOOL_REACTIVATE: 'provisioning.school.reactivate',
  SCHOOL_ACTIVATE: 'provisioning.school.activate',
  SCHOOL_CANCEL: 'provisioning.school.cancel',

  // Trial management (2) — read trial state; extend trial length.
  TRIAL_READ: 'provisioning.trial.read',
  TRIAL_EXTEND: 'provisioning.trial.extend',

  // Password reset / first-login (2) — super-admin initiates a reset; the
  // user themselves consumes the token (handled by Public endpoints, no
  // permission needed there).
  PASSWORD_RESET_REQUEST: 'provisioning.password_reset.request',
  PASSWORD_RESET_CANCEL: 'provisioning.password_reset.cancel',
} as const;

export type ProvisioningPermission =
  (typeof ProvisioningPermissions)[keyof typeof ProvisioningPermissions];

export const PROVISIONING_PERMISSION_DESCRIPTIONS: Readonly<
  Record<ProvisioningPermission, string>
> = Object.freeze({
  [ProvisioningPermissions.PLAN_READ]: 'List or read plan catalog entries.',
  [ProvisioningPermissions.PLAN_CREATE]: 'Create a new plan in the catalog.',
  [ProvisioningPermissions.PLAN_UPDATE]: 'Update an existing plan in the catalog.',
  [ProvisioningPermissions.PLAN_DELETE]: 'Soft-delete (retire) a plan from the catalog.',
  [ProvisioningPermissions.PLAN_ASSIGN]: 'Assign a plan to a school.',
  [ProvisioningPermissions.SCHOOL_READ]: 'Read the super-admin school list / single school.',
  [ProvisioningPermissions.SCHOOL_CREATE]: 'Provision (create) a new school via the orchestrator.',
  [ProvisioningPermissions.SCHOOL_UPDATE]: 'Update legal / contact fields of a school.',
  [ProvisioningPermissions.SCHOOL_SUSPEND]: 'Suspend an active school (block all logins).',
  [ProvisioningPermissions.SCHOOL_REACTIVATE]: 'Reactivate a previously suspended school.',
  [ProvisioningPermissions.SCHOOL_ACTIVATE]: 'Transition a school from TRIAL to ACTIVE.',
  [ProvisioningPermissions.SCHOOL_CANCEL]: 'Cancel a school (terminal, write-once).',
  [ProvisioningPermissions.TRIAL_READ]: 'Read trial state and history.',
  [ProvisioningPermissions.TRIAL_EXTEND]: 'Extend a school trial (max 3 extensions).',
  [ProvisioningPermissions.PASSWORD_RESET_REQUEST]: 'Issue a password-reset link for a user.',
  [ProvisioningPermissions.PASSWORD_RESET_CANCEL]: 'Cancel an unused password-reset request.',
});

// ---------------------------------------------------------------------------
// Outbox topics
// ---------------------------------------------------------------------------
export const ProvisioningOutboxTopics = {
  // Plan (4)
  PLAN_CREATED: 'provisioning.plan.created',
  PLAN_UPDATED: 'provisioning.plan.updated',
  PLAN_DELETED: 'provisioning.plan.deleted',
  PLAN_ASSIGNED: 'provisioning.plan.assigned',

  // School lifecycle (8)
  SCHOOL_UPDATED: 'provisioning.school.updated',
  SCHOOL_SETTINGS_UPDATED: 'provisioning.school.settings.updated',
  SCHOOL_PROVISIONED: 'provisioning.school.provisioned',
  SCHOOL_ACTIVATED: 'provisioning.school.activated',
  SCHOOL_SUSPENDED: 'provisioning.school.suspended',
  SCHOOL_REACTIVATED: 'provisioning.school.reactivated',
  SCHOOL_CANCELLED: 'provisioning.school.cancelled',
  SCHOOL_TRIAL_EXPIRED: 'provisioning.school.trial_expired',

  // Trial (3)
  TRIAL_STARTED: 'provisioning.trial.started',
  TRIAL_EXTENDED: 'provisioning.trial.extended',
  TRIAL_EXPIRY_WARNING: 'provisioning.trial.expiry_warning',

  // Password reset (1) — confirm/cancel surface tracked as state diffs in
  // audit; only the initial request fires an outbox event so the email
  // worker can deliver the link.
  PASSWORD_RESET_REQUESTED: 'provisioning.password_reset.requested',

  // Sprint 17 — generic activation hook. Emitted by PasswordResetService.confirm
  // (and the parallel first-login path) whenever a User completes their first
  // post-invite password rotation. Downstream domains (e.g. ParentModule) hang
  // off this to flip their lifecycle rows from PENDING_INVITE → ACTIVE without
  // password-reset having to know about parent-portal semantics.
  PASSWORD_FIRST_LOGIN_COMPLETED: 'provisioning.password.first_login.completed',
} as const;

export type ProvisioningOutboxTopic =
  (typeof ProvisioningOutboxTopics)[keyof typeof ProvisioningOutboxTopics];

// ---------------------------------------------------------------------------
// Job handler names — registered with JobHandlerRegistry.
// ---------------------------------------------------------------------------
export const ProvisioningJobHandlers = {
  TRIAL_EXPIRY_SCAN: 'provisioning.trial.expiry-scan',
} as const;

// ---------------------------------------------------------------------------
// Field-size guardrails — kept here so DTOs and Prisma schema stay in sync.
// ---------------------------------------------------------------------------
export const PLAN_CODE_MAX_LENGTH = 40;
export const PLAN_NAME_MAX_LENGTH = 120;
export const PLAN_DESCRIPTION_MAX_LENGTH = 1000;
export const PLAN_TRIAL_DAYS_MIN = 0;
export const PLAN_TRIAL_DAYS_MAX = 365;
export const PLAN_MONTHLY_LIMIT_MIN = 0;
export const PLAN_MONTHLY_LIMIT_MAX = 100_000_000;

// ---------------------------------------------------------------------------
// Trial / lifecycle invariants
// ---------------------------------------------------------------------------
/** Max number of trial extensions allowed per school (hard cap). */
export const TRIAL_EXTENSION_MAX_COUNT = 3;
/** Default plan code seeded for the canary tenant. */
export const DEFAULT_TRIAL_PLAN_CODE = 'trial';

// ---------------------------------------------------------------------------
// Feature flags (Wave 8)
// ---------------------------------------------------------------------------
export const ProvisioningFeatureFlags = {
  /** Master switch — when off the module's controllers refuse all writes. */
  MODULE: 'module.provisioning',
  /** Allow new tenant provisioning via the orchestrator. */
  ALLOW_PROVISIONING: 'provisioning.allow_provisioning',
  /** Allow trial extensions (otherwise the endpoint returns 409). */
  ALLOW_TRIAL_EXTENSION: 'provisioning.allow_trial_extension',
  /** Allow super-admin-initiated password resets (anti-abuse kill switch). */
  ALLOW_PASSWORD_RESET: 'provisioning.allow_password_reset',
} as const;

export type ProvisioningFeatureFlag =
  (typeof ProvisioningFeatureFlags)[keyof typeof ProvisioningFeatureFlags];

// ---------------------------------------------------------------------------
// Notification event keys emitted by the provisioning lifecycle. Bootstrapped
// into the NotificationEventRegistry so per-tenant templates may render them.
// ---------------------------------------------------------------------------
export const ProvisioningNotificationEventKeys = {
  SCHOOL_PROVISIONED: 'SCHOOL_PROVISIONED',
  SCHOOL_ACTIVATED: 'SCHOOL_ACTIVATED',
  SCHOOL_SUSPENDED: 'SCHOOL_SUSPENDED',
  // Sprint 14.1 — paired with TRIAL_EXPIRED. SCHOOL_EXPIRED carries the
  // tenant-level "we just transitioned you to EXPIRED" surface for cross-
  // cutting alerting; TRIAL_EXPIRED is the user-facing variant.
  SCHOOL_EXPIRED: 'SCHOOL_EXPIRED',
  // Sprint 14.1 — paired with TRIAL_EXPIRY_WARNING. TRIAL_EXPIRING is the
  // canonical key used by the daily scheduler when a school's trial falls
  // within the warning window (default 7 days).
  TRIAL_EXPIRING: 'TRIAL_EXPIRING',
  TRIAL_EXPIRY_WARNING: 'TRIAL_EXPIRY_WARNING',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
} as const;

export type ProvisioningNotificationEventKey =
  (typeof ProvisioningNotificationEventKeys)[keyof typeof ProvisioningNotificationEventKeys];
