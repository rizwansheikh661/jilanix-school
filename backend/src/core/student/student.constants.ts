/**
 * StudentPermissions — granular keys for the Student domain. Layout
 * mirrors `AcademicPermissions` (`<resource>.<action>`); each key is
 * registered by `StudentPermissionsSeeder` on every boot.
 *
 * The lifecycle endpoints (`deactivate`, `reactivate`, `assign-roll`)
 * stay separate from `update` so a school can grant a teacher the right
 * to change a roll number without exposing every other field. Built-in
 * roles still grant `*` / `*.read`, so no role-definition changes here.
 *
 * Sprint 18 adds the `student-user.*` lifecycle keys (invite / read /
 * suspend / reactivate / archive) plus `student.read-self` for the
 * `/me/*` student-portal endpoints.
 */
export const StudentPermissions = {
  READ: 'student.read',
  CREATE: 'student.create',
  UPDATE: 'student.update',
  DELETE: 'student.delete',
  DEACTIVATE: 'student.deactivate',
  REACTIVATE: 'student.reactivate',
  ASSIGN_ROLL: 'student.assign-roll',
  // Sprint 18 — StudentUser lifecycle (admin-side).
  INVITE_USER: 'student-user.invite',
  READ_USER: 'student-user.read',
  SUSPEND_USER: 'student-user.suspend',
  REACTIVATE_USER: 'student-user.reactivate',
  ARCHIVE_USER: 'student-user.archive',
  // Sprint 18 — Self-service read for /me/* endpoints. Mapped onto the
  // built-in `student` role.
  READ_SELF: 'student.read-self',
} as const;

export type StudentPermission = (typeof StudentPermissions)[keyof typeof StudentPermissions];

export const STUDENT_PERMISSION_DESCRIPTIONS: Readonly<Record<StudentPermission, string>> =
  Object.freeze({
    [StudentPermissions.READ]: 'List and read students.',
    [StudentPermissions.CREATE]: 'Create student records (typically via admission approval).',
    [StudentPermissions.UPDATE]: 'Update student profile and placement.',
    [StudentPermissions.DELETE]: 'Soft-delete student records.',
    [StudentPermissions.DEACTIVATE]: 'Set student status to INACTIVE.',
    [StudentPermissions.REACTIVATE]: 'Restore an INACTIVE student to ACTIVE.',
    [StudentPermissions.ASSIGN_ROLL]: 'Assign or change a student roll number.',
    [StudentPermissions.INVITE_USER]:
      'Invite a student (creates User + StudentUser + reset token, emits student.invited).',
    [StudentPermissions.READ_USER]: 'List or read StudentUser lifecycle rows.',
    [StudentPermissions.SUSPEND_USER]:
      'Suspend a StudentUser (blocks /me/* without touching the underlying User row).',
    [StudentPermissions.REACTIVATE_USER]: 'Reactivate a previously suspended StudentUser.',
    [StudentPermissions.ARCHIVE_USER]:
      'Archive a StudentUser (terminal, cancels outstanding reset tokens).',
    [StudentPermissions.READ_SELF]:
      'Read own student profile, placement, and notification preferences.',
  });

// Sprint 18 — feature-flag keys owned by the Student module.
export const StudentFeatureFlags = {
  /**
   * Master switch for the Student Portal. Gates both the admin student-user
   * endpoints and the `/me/*` self-service routes. Already declared as a
   * plan-mapped TOGGLE in `20260628000000_subscription_foundation` (see
   * `plan_features.student_portal`); the registry entry is still required
   * so `FeatureFlagService.assert(...)` accepts the key.
   */
  STUDENT_PORTAL: 'student_portal',
} as const;

export type StudentFeatureFlag = (typeof StudentFeatureFlags)[keyof typeof StudentFeatureFlags];

// Sprint 18 — outbox topics emitted by the Student module.
export const StudentOutboxTopics = {
  INVITED: 'student.invited',
  REINVITED: 'student.reinvited',
  LIFECYCLE_ACTIVATED: 'student.lifecycle.activated',
  LIFECYCLE_SUSPENDED: 'student.lifecycle.suspended',
  LIFECYCLE_REACTIVATED: 'student.lifecycle.reactivated',
  LIFECYCLE_ARCHIVED: 'student.lifecycle.archived',
} as const;

export type StudentOutboxTopic = (typeof StudentOutboxTopics)[keyof typeof StudentOutboxTopics];

// Sprint 18 — student-portal invite link TTL (7 days). Matches the parent
// invite TTL; both are longer than the 1-hour default for password resets.
export const STUDENT_INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
