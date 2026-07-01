/**
 * ParentPermissions — granular keys for the Parent domain. Layout
 * mirrors `StudentPermissions`. The `link-student` and `unlink-student`
 * actions are split out so a school can delegate "associate a parent
 * with a child" without exposing parent profile mutation.
 *
 * Sprint 17 adds the `parent-user.*` lifecycle keys (invite / read /
 * suspend / reactivate / archive) plus `parent.read-self` for the
 * `/me/*` parent-portal endpoints. Built-in roles already grant `*` /
 * `*.read`, so no role-definition changes are needed when these keys
 * are seeded.
 */
export const ParentPermissions = {
  READ: 'parent.read',
  CREATE: 'parent.create',
  UPDATE: 'parent.update',
  DELETE: 'parent.delete',
  LINK_STUDENT: 'parent.link-student',
  UNLINK_STUDENT: 'parent.unlink-student',
  // Sprint 17 — ParentUser lifecycle (admin-side).
  INVITE_USER: 'parent-user.invite',
  READ_USER: 'parent-user.read',
  SUSPEND_USER: 'parent-user.suspend',
  REACTIVATE_USER: 'parent-user.reactivate',
  ARCHIVE_USER: 'parent-user.archive',
  // Sprint 17 — Self-service read for /me/* endpoints. Mapped onto the
  // built-in `parent` role.
  READ_SELF: 'parent.read-self',
} as const;

export type ParentPermission = (typeof ParentPermissions)[keyof typeof ParentPermissions];

export const PARENT_PERMISSION_DESCRIPTIONS: Readonly<Record<ParentPermission, string>> =
  Object.freeze({
    [ParentPermissions.READ]: 'List and read parent records.',
    [ParentPermissions.CREATE]: 'Create parent records.',
    [ParentPermissions.UPDATE]: 'Update parent details and address.',
    [ParentPermissions.DELETE]: 'Soft-delete parent records (blocked if linked to students).',
    [ParentPermissions.LINK_STUDENT]: 'Attach a parent to a student.',
    [ParentPermissions.UNLINK_STUDENT]: 'Remove a parent ↔ student link.',
    [ParentPermissions.INVITE_USER]:
      'Invite a parent (creates User + ParentUser + reset token, emits parent.invited).',
    [ParentPermissions.READ_USER]: 'List or read ParentUser lifecycle rows.',
    [ParentPermissions.SUSPEND_USER]:
      'Suspend a ParentUser (blocks /me/* without touching the underlying User row).',
    [ParentPermissions.REACTIVATE_USER]: 'Reactivate a previously suspended ParentUser.',
    [ParentPermissions.ARCHIVE_USER]:
      'Archive a ParentUser (terminal, cancels outstanding reset tokens).',
    [ParentPermissions.READ_SELF]:
      'Read own ParentUser profile, linked students, and notification preferences.',
  });

// Sprint 17 — feature-flag keys owned by the Parent module.
export const ParentFeatureFlags = {
  /**
   * Master switch for the Parent Portal. Gates both the admin parent-user
   * endpoints and the `/me/*` self-service routes. Already declared as a
   * plan-mapped TOGGLE in `20260628000000_subscription_foundation` (see
   * `plan_features.parent_portal`); the registry entry is still required
   * so `FeatureFlagService.assert(...)` accepts the key.
   */
  PARENT_PORTAL: 'parent_portal',
} as const;

export type ParentFeatureFlag = (typeof ParentFeatureFlags)[keyof typeof ParentFeatureFlags];

// Sprint 17 — outbox topics emitted by the Parent module.
export const ParentOutboxTopics = {
  INVITED: 'parent.invited',
  REINVITED: 'parent.reinvited',
  LIFECYCLE_ACTIVATED: 'parent.lifecycle.activated',
  LIFECYCLE_SUSPENDED: 'parent.lifecycle.suspended',
  LIFECYCLE_REACTIVATED: 'parent.lifecycle.reactivated',
  LIFECYCLE_ARCHIVED: 'parent.lifecycle.archived',
} as const;

export type ParentOutboxTopic = (typeof ParentOutboxTopics)[keyof typeof ParentOutboxTopics];

// Sprint 17 — parent-portal invite link TTL (7 days). Longer than the
// 1-hour default for password resets — deliberate user-facing convenience.
export const PARENT_INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
