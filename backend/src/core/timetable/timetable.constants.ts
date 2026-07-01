/**
 * Timetable module constants — permission keys, outbox topics, feature
 * flag keys, and shared enum value tuples. Imported by every sub-module.
 */

export const TimetablePermissions = {
  // Period template / configuration
  CONFIG_READ: 'timetable.config.read',
  CONFIG_CREATE: 'timetable.config.create',
  CONFIG_UPDATE: 'timetable.config.update',
  CONFIG_DELETE: 'timetable.config.delete',
  // Versions
  VERSION_READ: 'timetable.version.read',
  VERSION_CREATE: 'timetable.version.create',
  VERSION_UPDATE: 'timetable.version.update',
  VERSION_DELETE: 'timetable.version.delete',
  VERSION_ACTIVATE: 'timetable.version.activate',
  VERSION_ARCHIVE: 'timetable.version.archive',
  // Entries
  ENTRY_READ: 'timetable.entry.read',
  ENTRY_CREATE: 'timetable.entry.create',
  ENTRY_UPDATE: 'timetable.entry.update',
  ENTRY_DELETE: 'timetable.entry.delete',
  ENTRY_BULK: 'timetable.entry.bulk',
  // Teacher views + load + availability
  TEACHER_READ: 'timetable.teacher.read',
  TEACHER_LOAD_READ: 'timetable.teacher.load.read',
  AVAILABILITY_READ: 'timetable.availability.read',
  AVAILABILITY_CREATE: 'timetable.availability.create',
  AVAILABILITY_UPDATE: 'timetable.availability.update',
  AVAILABILITY_DELETE: 'timetable.availability.delete',
  // Conflicts (read-only ledger)
  CONFLICT_READ: 'timetable.conflict.read',
  // Section/room views
  VIEW_SECTION: 'timetable.view.section',
  VIEW_ROOM: 'timetable.view.room',
} as const;

export type TimetablePermission =
  (typeof TimetablePermissions)[keyof typeof TimetablePermissions];

export const TIMETABLE_PERMISSION_DESCRIPTIONS: Readonly<
  Record<TimetablePermission, string>
> = Object.freeze({
  [TimetablePermissions.CONFIG_READ]: 'Read period templates and their period rows.',
  [TimetablePermissions.CONFIG_CREATE]: 'Create a new period template.',
  [TimetablePermissions.CONFIG_UPDATE]: 'Update an existing period template.',
  [TimetablePermissions.CONFIG_DELETE]: 'Soft-delete a period template.',
  [TimetablePermissions.VERSION_READ]: 'List or read timetable versions.',
  [TimetablePermissions.VERSION_CREATE]: 'Create a new DRAFT timetable version.',
  [TimetablePermissions.VERSION_UPDATE]: 'Edit metadata on an existing timetable version.',
  [TimetablePermissions.VERSION_DELETE]: 'Soft-delete a non-ACTIVE timetable version.',
  [TimetablePermissions.VERSION_ACTIVATE]: 'Activate a DRAFT version (archives any current ACTIVE).',
  [TimetablePermissions.VERSION_ARCHIVE]: 'Archive an ACTIVE timetable version.',
  [TimetablePermissions.ENTRY_READ]: 'List or read timetable entries.',
  [TimetablePermissions.ENTRY_CREATE]: 'Create a single timetable entry on a DRAFT version.',
  [TimetablePermissions.ENTRY_UPDATE]: 'Update a timetable entry on a DRAFT version.',
  [TimetablePermissions.ENTRY_DELETE]: 'Soft-delete a timetable entry on a DRAFT version.',
  [TimetablePermissions.ENTRY_BULK]: 'Bulk-create timetable entries (≤500 per request).',
  [TimetablePermissions.TEACHER_READ]: 'Read derived teacher timetable views.',
  [TimetablePermissions.TEACHER_LOAD_READ]: 'Read teacher load metrics per version.',
  [TimetablePermissions.AVAILABILITY_READ]: 'List or read teacher availability rows.',
  [TimetablePermissions.AVAILABILITY_CREATE]: 'Declare a teacher availability/unavailability window.',
  [TimetablePermissions.AVAILABILITY_UPDATE]: 'Update an existing teacher availability row.',
  [TimetablePermissions.AVAILABILITY_DELETE]: 'Soft-delete a teacher availability row.',
  [TimetablePermissions.CONFLICT_READ]: 'Read the append-only timetable conflict ledger.',
  [TimetablePermissions.VIEW_SECTION]: 'Read a section\u2019s full weekly timetable.',
  [TimetablePermissions.VIEW_ROOM]: 'Read a room\u2019s full weekly timetable.',
});

export const TimetableFeatureFlags = {
  MODULE: 'module.timetable',
  AUTO_GENERATE: 'timetable.auto_generate',
  SUBSTITUTION: 'timetable.substitution',
  SUBSTITUTION_NOTIFICATIONS: 'timetable.substitution.notifications',
  ALLOW_UNQUALIFIED_TEACHER: 'timetable.allow_unqualified_teacher',
} as const;

export const TimetableOutboxTopics = {
  PERIOD_TEMPLATE_CREATED: 'timetable.period_template.created',
  PERIOD_TEMPLATE_UPDATED: 'timetable.period_template.updated',
  PERIOD_TEMPLATE_DELETED: 'timetable.period_template.deleted',

  VERSION_CREATED: 'timetable.version.created',
  VERSION_UPDATED: 'timetable.version.updated',
  VERSION_ACTIVATED: 'timetable.version.activated',
  VERSION_ARCHIVED: 'timetable.version.archived',
  VERSION_DELETED: 'timetable.version.deleted',

  ENTRY_CREATED: 'timetable.entry.created',
  ENTRY_UPDATED: 'timetable.entry.updated',
  ENTRY_DELETED: 'timetable.entry.deleted',
  ENTRY_BULK_CREATED: 'timetable.entries.bulk_created',

  TEACHER_LOAD_RECOMPUTED: 'timetable.teacher_load.recomputed',
  AVAILABILITY_CHANGED: 'timetable.availability.changed',

  CONFLICT_DETECTED: 'timetable.conflict.detected',

  // Scaffold only — not published this sprint.
  SUBSTITUTION_REQUESTED: 'timetable.substitution.requested',
  SUBSTITUTION_DECIDED: 'timetable.substitution.decided',
} as const;

export const PERIOD_TYPE_VALUES = [
  'TEACHING',
  'BREAK',
  'ASSEMBLY',
  'LUNCH',
  'OTHER',
] as const;
export type PeriodTypeValue = (typeof PERIOD_TYPE_VALUES)[number];

export const TIMETABLE_VERSION_STATUS_VALUES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type TimetableVersionStatusValue = (typeof TIMETABLE_VERSION_STATUS_VALUES)[number];

export const TEACHER_AVAILABILITY_KIND_VALUES = ['AVAILABLE', 'UNAVAILABLE'] as const;
export type TeacherAvailabilityKindValue =
  (typeof TEACHER_AVAILABILITY_KIND_VALUES)[number];

export const TIMETABLE_CONFLICT_TYPE_VALUES = [
  'TEACHER_DOUBLE_BOOKED',
  'ROOM_DOUBLE_BOOKED',
  'SECTION_DOUBLE_BOOKED',
  'TEACHER_NOT_QUALIFIED',
  'ROOM_DISALLOWED_TYPE',
  'PERIOD_OUT_OF_TEMPLATE',
  'NON_WORKING_DAY',
  'TEACHER_UNAVAILABLE',
] as const;
export type TimetableConflictTypeValue = (typeof TIMETABLE_CONFLICT_TYPE_VALUES)[number];

export const SUBSTITUTION_STATUS_VALUES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXECUTED',
] as const;
export type SubstitutionStatusValue = (typeof SUBSTITUTION_STATUS_VALUES)[number];

/** Bulk-entries hard cap. Plan §7.4. */
export const TIMETABLE_BULK_MAX_ENTRIES = 500;

/** Max number of periods that may sit in a single PeriodTemplate. */
export const PERIOD_TEMPLATE_MAX_PERIODS = 30;

/** ISO day-of-week values accepted across the module. 1=Monday, 7=Sunday. */
export const ISO_DAYS_OF_WEEK = [1, 2, 3, 4, 5, 6, 7] as const;
