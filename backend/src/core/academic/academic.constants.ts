/**
 * AcademicPermissions — the granular permission keys for the Academic
 * Foundation domain (AcademicYear / Class / Section / Subject).
 *
 * Catalog shape follows the same `<resource>.<action>` convention as
 * `rbac.constants.ts:70-82`. The cross-cutting `Permissions` constant
 * declares baseline RBAC + identity keys; each feature module contributes
 * its own catalog through a dedicated seeder. Built-in roles
 * (`platform_admin`, `school_admin`) already grant the `*` wildcard and
 * `auditor` grants `*.read`, so adding new permissions here does not
 * require touching `BUILT_IN_ROLE_DEFINITIONS`.
 */
export const AcademicPermissions = {
  // AcademicYear — no DELETE per REST_API_DESIGN §3.3; rollover deferred
  // to the Students sprint.
  YEAR_READ: 'academic-year.read',
  YEAR_CREATE: 'academic-year.create',
  YEAR_UPDATE: 'academic-year.update',
  YEAR_ACTIVATE: 'academic-year.activate',

  // Class — full CRUD.
  CLASS_READ: 'class.read',
  CLASS_CREATE: 'class.create',
  CLASS_UPDATE: 'class.update',
  CLASS_DELETE: 'class.delete',

  // Section — full CRUD plus the dedicated assign-class-teacher endpoint.
  SECTION_READ: 'section.read',
  SECTION_CREATE: 'section.create',
  SECTION_UPDATE: 'section.update',
  SECTION_DELETE: 'section.delete',
  SECTION_ASSIGN_TEACHER: 'section.assign-teacher',

  // Subject — full CRUD.
  SUBJECT_READ: 'subject.read',
  SUBJECT_CREATE: 'subject.create',
  SUBJECT_UPDATE: 'subject.update',
  SUBJECT_DELETE: 'subject.delete',

  // ---------------------------------------------------------------------
  // Sprint 4 additions
  // ---------------------------------------------------------------------

  // AcademicTerm — full CRUD with soft delete.
  TERM_READ: 'academic-term.read',
  TERM_CREATE: 'academic-term.create',
  TERM_UPDATE: 'academic-term.update',
  TERM_DELETE: 'academic-term.delete',

  // ClassSubject — read + replace-set (PUT) only; no individual CREATE/UPDATE.
  CLASS_SUBJECT_READ: 'class-subject.read',
  CLASS_SUBJECT_SET: 'class-subject.set',

  // SectionSubject — read overrides + effective; create/delete individual overrides.
  SECTION_SUBJECT_READ: 'section-subject.read',
  SECTION_SUBJECT_CREATE: 'section-subject.create',
  SECTION_SUBJECT_DELETE: 'section-subject.delete',

  // AcademicYearPromotion — schema-only this sprint; bulk-promotion job lands in Sprint 9.
  PROMOTION_READ: 'academic-promotion.read',
  PROMOTION_CREATE: 'academic-promotion.create',
  PROMOTION_CANCEL: 'academic-promotion.cancel',
} as const;

export type AcademicPermission =
  (typeof AcademicPermissions)[keyof typeof AcademicPermissions];

/**
 * Human-readable descriptions seeded onto the `permissions` table. Surfaced
 * by the future admin UI ("what does this permission do?").
 */
export const ACADEMIC_PERMISSION_DESCRIPTIONS: Readonly<
  Record<AcademicPermission, string>
> = Object.freeze({
  [AcademicPermissions.YEAR_READ]: 'List and read academic years.',
  [AcademicPermissions.YEAR_CREATE]: 'Create academic years.',
  [AcademicPermissions.YEAR_UPDATE]: 'Update academic year details.',
  [AcademicPermissions.YEAR_ACTIVATE]: 'Mark an academic year current (only one per school).',
  [AcademicPermissions.CLASS_READ]: 'List and read classes (grade levels).',
  [AcademicPermissions.CLASS_CREATE]: 'Create classes.',
  [AcademicPermissions.CLASS_UPDATE]: 'Update class details.',
  [AcademicPermissions.CLASS_DELETE]: 'Soft-delete classes (blocked if sections exist).',
  [AcademicPermissions.SECTION_READ]: 'List and read sections.',
  [AcademicPermissions.SECTION_CREATE]: 'Create sections under a class.',
  [AcademicPermissions.SECTION_UPDATE]: 'Update section details.',
  [AcademicPermissions.SECTION_DELETE]: 'Soft-delete sections.',
  [AcademicPermissions.SECTION_ASSIGN_TEACHER]: 'Assign or unassign a section class teacher.',
  [AcademicPermissions.SUBJECT_READ]: 'List and read subjects.',
  [AcademicPermissions.SUBJECT_CREATE]: 'Create subjects.',
  [AcademicPermissions.SUBJECT_UPDATE]: 'Update subject details.',
  [AcademicPermissions.SUBJECT_DELETE]: 'Soft-delete subjects.',
  // Sprint 4 additions
  [AcademicPermissions.TERM_READ]: 'List and read academic terms.',
  [AcademicPermissions.TERM_CREATE]: 'Create academic terms.',
  [AcademicPermissions.TERM_UPDATE]: 'Update academic term details.',
  [AcademicPermissions.TERM_DELETE]: 'Soft-delete academic terms.',
  [AcademicPermissions.CLASS_SUBJECT_READ]: 'List default subjects offered to a class.',
  [AcademicPermissions.CLASS_SUBJECT_SET]:
    'Replace the set of default subjects offered to a class (idempotent).',
  [AcademicPermissions.SECTION_SUBJECT_READ]:
    'List section subject overrides and resolved effective subjects.',
  [AcademicPermissions.SECTION_SUBJECT_CREATE]:
    'Add a section-level subject override (ADD / REMOVE / REPLACE).',
  [AcademicPermissions.SECTION_SUBJECT_DELETE]:
    'Remove a section-level subject override.',
  [AcademicPermissions.PROMOTION_READ]: 'List and read academic year promotion jobs.',
  [AcademicPermissions.PROMOTION_CREATE]:
    'Schedule an academic year promotion job (creates PENDING record).',
  [AcademicPermissions.PROMOTION_CANCEL]: 'Cancel a pending or running promotion job.',
});
