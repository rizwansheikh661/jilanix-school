/**
 * Internal row interfaces and value enumerations for the Admission
 * domain. Mirrors student/parent type files.
 */

import type {
  AdmissionTypeValue,
  GenderValue,
  ReligionValue,
  SocialCategoryValue,
} from '../student/student.types';

export type AdmissionStatusValue =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export const ADMISSION_STATUS_VALUES: readonly AdmissionStatusValue[] = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

/** Terminal states — no further transitions permitted. */
export const ADMISSION_TERMINAL_STATES: readonly AdmissionStatusValue[] = Object.freeze([
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface AdmissionRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly status: AdmissionStatusValue;

  // Candidate snapshot.
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date;
  readonly gender: GenderValue;
  readonly bloodGroup: string | null;

  // Target placement.
  readonly targetAcademicYearId: string;
  readonly targetClassId: string;
  readonly targetSectionId: string;

  // Proposed identity.
  readonly admissionNo: string | null;
  readonly rollNo: string | null;

  // Parent snapshot — same shape as Parent for verbatim copy on approve.
  readonly fatherName: string | null;
  readonly fatherPhone: string | null;
  readonly fatherEmail: string | null;
  readonly fatherOccupation: string | null;
  readonly motherName: string | null;
  readonly motherPhone: string | null;
  readonly motherEmail: string | null;
  readonly motherOccupation: string | null;
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly guardianEmail: string | null;
  readonly guardianOccupation: string | null;
  readonly guardianRelation: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;

  // Decision metadata — populated when status moves to APPROVED/REJECTED.
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly decisionNote: string | null;

  // Linkage — populated only after APPROVED.
  readonly studentId: string | null;
  readonly parentId: string | null;

  // Indian-school snapshot — carried verbatim to Student on APPROVE.
  readonly religion: ReligionValue | null;
  readonly category: SocialCategoryValue | null;
  readonly nationality: string;
  readonly motherTongue: string | null;
  readonly aadhaarLast4: string | null;
  readonly apaarId: string | null;
  readonly isCwsn: boolean;
  readonly disabilityType: string | null;
  readonly isRte: boolean;
  readonly isMinority: boolean;
  readonly minorityCommunity: string | null;
  readonly isBpl: boolean;
  readonly previousSchoolName: string | null;
  readonly previousSchoolTcNo: string | null;
  readonly previousSchoolTcDate: Date | null;
  readonly admissionType: AdmissionTypeValue | null;
  readonly placeOfBirth: string | null;
  readonly birthCertNo: string | null;
}

export interface AdmissionDocumentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly admissionId: string;
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
  readonly uploadedBy: string | null;
  readonly uploadedAt: Date;
}

export interface AdmissionHistoryRow {
  readonly id: string;
  readonly schoolId: string;
  readonly admissionId: string;
  readonly fromStatus: AdmissionStatusValue | null;
  readonly toStatus: AdmissionStatusValue;
  readonly actorId: string | null;
  readonly note: string | null;
  readonly occurredAt: Date;
}
