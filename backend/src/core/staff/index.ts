/**
 * Staff domain — public barrel. Exposes the module + service for cross-module
 * wiring (Sprint 8 Attendance will inject `StaffService`), the permission
 * catalog, the typed error classes, and the public Row / status types.
 */
export { StaffModule } from './staff.module';
export { StaffService } from './staff/staff.service';
export type {
  CreateStaffArgs,
  ListStaffArgs,
  UpdateStaffArgs,
} from './staff/staff.service';
export {
  STAFF_PERMISSION_DESCRIPTIONS,
  StaffPermissions,
  type StaffPermission,
} from './staff.constants';
export {
  ClassTeacherAlreadyAssignedError,
  ClassTeacherAlreadyRevokedError,
  LeaveDatesInvalidError,
  LeaveDaysInvalidError,
  LeaveInvalidStateTransitionError,
  SectionAssignmentDuplicateError,
  StaffError,
  StaffStatusInvalidTransitionError,
  SubjectQualificationDuplicateError,
  SubjectQualificationSubjectNotFoundError,
  type StaffErrorReason,
} from './staff.errors';
export {
  EMPLOYMENT_EVENT_VALUES,
  LEAVE_STATUS_VALUES,
  LEAVE_TYPE_VALUES,
  STAFF_STATUS_VALUES,
  type ClassTeacherRow,
  type EmploymentEventValue,
  type LeaveStatusValue,
  type LeaveTypeValue,
  type StaffDocumentRow,
  type StaffEmploymentHistoryRow,
  type StaffLeaveRow,
  type StaffPiiRow,
  type StaffPublicRow,
  type StaffQualificationRow,
  type StaffRow,
  type StaffSectionAssignmentRow,
  type StaffStatusValue,
  type StaffSubjectQualificationRow,
} from './staff.types';
