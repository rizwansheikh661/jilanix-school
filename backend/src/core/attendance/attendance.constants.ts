/**
 * Attendance module constants — permission keys, outbox topics, feature
 * flag keys, and defaults. Shared across every sub-module.
 */

export const AttendancePermissions = {
  // Student attendance
  MARK: 'attendance.mark',
  READ: 'attendance.read',
  UPDATE: 'attendance.update',
  DELETE: 'attendance.delete',
  BULK: 'attendance.bulk',
  // Staff attendance
  STAFF_MARK: 'staff_attendance.mark',
  STAFF_READ: 'staff_attendance.read',
  STAFF_UPDATE: 'staff_attendance.update',
  STAFF_DELETE: 'staff_attendance.delete',
  STAFF_BULK: 'staff_attendance.bulk',
  // Lock windows
  LOCK_CREATE: 'attendance.lock.create',
  LOCK_READ: 'attendance.lock.read',
  LOCK_DELETE: 'attendance.lock.delete',
  // Corrections
  CORRECTION_CREATE: 'attendance.correction.create',
  CORRECTION_READ: 'attendance.correction.read',
  CORRECTION_APPROVE: 'attendance.correction.approve',
  CORRECTION_REJECT: 'attendance.correction.reject',
  // History
  HISTORY_READ: 'attendance.history.read',
  // Config
  CONFIG_READ: 'attendance.config.read',
  CONFIG_UPDATE: 'attendance.config.update',
  // Reports
  REPORT_READ: 'attendance.report.read',
} as const;

export type AttendancePermission =
  (typeof AttendancePermissions)[keyof typeof AttendancePermissions];

export const ATTENDANCE_PERMISSION_DESCRIPTIONS: Readonly<
  Record<AttendancePermission, string>
> = Object.freeze({
  [AttendancePermissions.MARK]: 'Mark daily attendance for a student.',
  [AttendancePermissions.READ]: 'List or read student attendance entries.',
  [AttendancePermissions.UPDATE]: 'Edit a student attendance entry within the edit window.',
  [AttendancePermissions.DELETE]: 'Soft-delete a student attendance entry within the edit window.',
  [AttendancePermissions.BULK]: 'Bulk-mark attendance for a class/section.',
  [AttendancePermissions.STAFF_MARK]: 'Mark daily attendance for a staff member.',
  [AttendancePermissions.STAFF_READ]: 'List or read staff attendance entries.',
  [AttendancePermissions.STAFF_UPDATE]: 'Edit a staff attendance entry within the edit window.',
  [AttendancePermissions.STAFF_DELETE]: 'Soft-delete a staff attendance entry within the edit window.',
  [AttendancePermissions.STAFF_BULK]: 'Bulk-mark attendance for staff.',
  [AttendancePermissions.LOCK_CREATE]: 'Create an attendance lock window.',
  [AttendancePermissions.LOCK_READ]: 'List or read attendance lock windows.',
  [AttendancePermissions.LOCK_DELETE]: 'Unlock (soft-delete) an attendance lock window.',
  [AttendancePermissions.CORRECTION_CREATE]: 'Request a correction to an existing attendance entry.',
  [AttendancePermissions.CORRECTION_READ]: 'List or read attendance correction requests.',
  [AttendancePermissions.CORRECTION_APPROVE]: 'Approve a pending attendance correction.',
  [AttendancePermissions.CORRECTION_REJECT]: 'Reject a pending attendance correction.',
  [AttendancePermissions.HISTORY_READ]: 'Read the append-only status history for an attendance entry.',
  [AttendancePermissions.CONFIG_READ]: 'Read attendance configuration.',
  [AttendancePermissions.CONFIG_UPDATE]: 'Update attendance configuration.',
  [AttendancePermissions.REPORT_READ]: 'Read attendance reports and analytics.',
});

export const AttendanceFeatureFlags = {
  MODULE: 'module.attendance',
  PERIOD_WISE: 'attendance.period_wise',
  SUBJECT_WISE: 'attendance.subject_wise',
  BIOMETRIC: 'attendance.biometric',
  MOBILE_APP: 'attendance.mobile_app',
} as const;

export const AttendanceOutboxTopics = {
  MARKED: 'attendance.marked',
  CHANGED: 'attendance.changed',
  CORRECTED: 'attendance.corrected',
  LOCKED: 'attendance.locked',
  UNLOCKED: 'attendance.unlocked',
  STAFF_MARKED: 'staff_attendance.marked',
  STAFF_CHANGED: 'staff_attendance.changed',
} as const;

export const ATTENDANCE_STATUS_VALUES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'LEAVE',
  'HOLIDAY',
] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUS_VALUES)[number];

export const ATTENDANCE_SOURCE_VALUES = [
  'MANUAL',
  'BIOMETRIC',
  'RFID',
  'FACE_RECOGNITION',
  'MOBILE_APP',
] as const;
export type AttendanceSourceValue = (typeof ATTENDANCE_SOURCE_VALUES)[number];

export const ATTENDANCE_CORRECTION_STATUS_VALUES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
] as const;
export type AttendanceCorrectionStatusValue = (typeof ATTENDANCE_CORRECTION_STATUS_VALUES)[number];

export const ATTENDANCE_LOCK_SCOPE_VALUES = ['SCHOOL', 'BRANCH', 'SECTION'] as const;
export type AttendanceLockScopeValue = (typeof ATTENDANCE_LOCK_SCOPE_VALUES)[number];

export const ATTENDANCE_HISTORY_CHANGE_TYPE_VALUES = [
  'MARKED',
  'EDITED',
  'CORRECTED',
  'SYSTEM',
] as const;
export type AttendanceHistoryChangeTypeValue =
  (typeof ATTENDANCE_HISTORY_CHANGE_TYPE_VALUES)[number];

/** Bulk-mark hard cap. Plan §Service-level rule 7. */
export const ATTENDANCE_BULK_MAX_ENTRIES = 1000;

/** Default `editWindowHours` used when no AttendanceConfig row exists. */
export const ATTENDANCE_DEFAULT_EDIT_WINDOW_HOURS = 24;

/** Default `lateThresholdMinutes` used when no AttendanceConfig row exists. */
export const ATTENDANCE_DEFAULT_LATE_THRESHOLD_MINUTES = 15;
