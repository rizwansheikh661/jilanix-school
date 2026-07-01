/**
 * Internal row interfaces for the Staff domain. Mirrors `student.types.ts` /
 * `admission.types.ts` — services + controllers consume these, never the
 * Prisma-generated model types, so accidental leakage of PII (Aadhaar /
 * PAN / bank account encrypted bytes) is caught at the type system.
 */

import type { GenderValue } from '../student/student.types';

export type StaffStatusValue =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ON_LEAVE'
  | 'RESIGNED'
  | 'TERMINATED'
  | 'RETIRED';

export const STAFF_STATUS_VALUES: readonly StaffStatusValue[] = Object.freeze([
  'ACTIVE',
  'INACTIVE',
  'ON_LEAVE',
  'RESIGNED',
  'TERMINATED',
  'RETIRED',
]);

export type EmploymentEventValue =
  | 'JOINED'
  | 'ROLE_CHANGED'
  | 'DEPARTMENT_CHANGED'
  | 'PROMOTED'
  | 'DEMOTED'
  | 'RESIGNED'
  | 'TERMINATED'
  | 'RETIRED'
  | 'REJOINED';

export const EMPLOYMENT_EVENT_VALUES: readonly EmploymentEventValue[] = Object.freeze([
  'JOINED',
  'ROLE_CHANGED',
  'DEPARTMENT_CHANGED',
  'PROMOTED',
  'DEMOTED',
  'RESIGNED',
  'TERMINATED',
  'RETIRED',
  'REJOINED',
]);

export type LeaveStatusValue =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export const LEAVE_STATUS_VALUES: readonly LeaveStatusValue[] = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export type LeaveTypeValue =
  | 'CASUAL'
  | 'SICK'
  | 'EARNED'
  | 'MATERNITY'
  | 'PATERNITY'
  | 'UNPAID'
  | 'OTHER';

export const LEAVE_TYPE_VALUES: readonly LeaveTypeValue[] = Object.freeze([
  'CASUAL',
  'SICK',
  'EARNED',
  'MATERNITY',
  'PATERNITY',
  'UNPAID',
  'OTHER',
]);

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

/**
 * Master staff row. Aadhaar / PAN / Bank account columns are present on the
 * row in the *encrypted* form so the service can decrypt on the PII
 * endpoint. Standard response DTOs strip them and surface `_last4` only.
 */
export interface StaffRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;

  // Profile
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date | null;
  readonly gender: GenderValue;
  readonly bloodGroup: string | null;
  readonly photoUrl: string | null;

  // Contact
  readonly email: string | null;
  readonly phone: string;
  readonly alternatePhone: string | null;

  // PII — encrypted at rest
  readonly panEncrypted: string | null;
  readonly panLast4: string | null;
  readonly aadhaarEncrypted: string | null;
  readonly aadhaarLast4: string | null;

  // Address
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;

  // Employment
  readonly employeeCode: string;
  readonly designation: string;
  readonly department: string | null;
  readonly departmentId: string | null;
  readonly designationId: string | null;
  readonly dateOfJoining: Date;
  readonly dateOfLeaving: Date | null;
  readonly status: StaffStatusValue;

  // Bank
  readonly bankAccountEncrypted: string | null;
  readonly bankAccountLast4: string | null;
  readonly bankIfsc: string | null;

  readonly userId: string | null;
}

export interface StaffEmploymentHistoryRow {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly event: EmploymentEventValue;
  readonly effectiveDate: Date;
  readonly fromValue: string | null;
  readonly toValue: string | null;
  readonly note: string | null;
  readonly actorId: string | null;
  readonly occurredAt: Date;
}

export interface StaffQualificationRow {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly qualificationType: string;
  readonly name: string;
  readonly institution: string | null;
  readonly yearAwarded: number | null;
  readonly gradeOrScore: string | null;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

export interface StaffSubjectQualificationRow {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly subjectId: string;
  readonly proficiency: string | null;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

export interface StaffSectionAssignmentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly academicYearId: string;
  readonly periodsPerWeek: number | null;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

export interface ClassTeacherRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly sectionId: string;
  readonly academicYearId: string;
  readonly assignedOn: Date;
  readonly revokedOn: Date | null;
}

export interface StaffLeaveRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly leaveType: LeaveTypeValue;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly days: number;
  readonly reason: string;
  readonly status: LeaveStatusValue;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly decisionNote: string | null;
}

export interface StaffDocumentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
  readonly uploadedBy: string | null;
  readonly uploadedAt: Date;
}

/** Public-safe view of a Staff row — PII columns are stripped, last4 kept. */
export type StaffPublicRow = Omit<
  StaffRow,
  'panEncrypted' | 'aadhaarEncrypted' | 'bankAccountEncrypted'
>;

/** PII-enriched view returned by `/staff/:id/pii` (gated by `staff.pii.read`). */
export interface StaffPiiRow extends StaffPublicRow {
  readonly pan: string | null;
  readonly aadhaar: string | null;
  readonly bankAccount: string | null;
}
