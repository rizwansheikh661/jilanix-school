/**
 * Internal row interfaces and value enumerations for the Student domain.
 * Mirrors `academic.types.ts` — services and controllers consume these
 * narrow shapes instead of Prisma's generated model types so that
 * accidentally leaking infra-only columns onto the wire requires an
 * explicit edit here.
 */

export type GenderValue = 'MALE' | 'FEMALE' | 'OTHER';

export const GENDER_VALUES: readonly GenderValue[] = Object.freeze([
  'MALE',
  'FEMALE',
  'OTHER',
]);

export type StudentStatusValue =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'GRADUATED'
  | 'TC_ISSUED'
  | 'EXPELLED';

export const STUDENT_STATUS_VALUES: readonly StudentStatusValue[] = Object.freeze([
  'ACTIVE',
  'INACTIVE',
  'GRADUATED',
  'TC_ISSUED',
  'EXPELLED',
]);

export type ReligionValue =
  | 'HINDU'
  | 'MUSLIM'
  | 'CHRISTIAN'
  | 'SIKH'
  | 'BUDDHIST'
  | 'JAIN'
  | 'PARSI'
  | 'JEWISH'
  | 'OTHER'
  | 'NOT_DECLARED';

export const RELIGION_VALUES: readonly ReligionValue[] = Object.freeze([
  'HINDU',
  'MUSLIM',
  'CHRISTIAN',
  'SIKH',
  'BUDDHIST',
  'JAIN',
  'PARSI',
  'JEWISH',
  'OTHER',
  'NOT_DECLARED',
]);

export type SocialCategoryValue = 'GENERAL' | 'OBC' | 'SC' | 'ST' | 'EWS' | 'NOT_DECLARED';

export const SOCIAL_CATEGORY_VALUES: readonly SocialCategoryValue[] = Object.freeze([
  'GENERAL',
  'OBC',
  'SC',
  'ST',
  'EWS',
  'NOT_DECLARED',
]);

export type AdmissionTypeValue = 'FRESH' | 'TRANSFER' | 'RTE' | 'MANAGEMENT';

export const ADMISSION_TYPE_VALUES: readonly AdmissionTypeValue[] = Object.freeze([
  'FRESH',
  'TRANSFER',
  'RTE',
  'MANAGEMENT',
]);

export interface EmergencyContact {
  readonly name: string;
  readonly phone: string;
  readonly relation: string;
}

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface StudentRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date;
  readonly gender: GenderValue;
  readonly bloodGroup: string | null;
  readonly photoUrl: string | null;
  readonly admissionNo: string;
  readonly rollNo: string | null;
  readonly academicYearId: string;
  readonly classId: string;
  readonly sectionId: string;
  readonly status: StudentStatusValue;
  readonly admittedOn: Date;
  readonly emergencyContacts: readonly EmergencyContact[];
  // Indian-school compliance fields. Aadhaar plaintext never lives on this
  // row; only `aadhaarLast4` is surfaced. Full Aadhaar reveal is a separate
  // service path (Sprint 5).
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
  readonly houseId: string | null;
}

/** Sprint 18 — StudentUser lifecycle status (portal/login state). Distinct
 *  from the academic `StudentStatusValue` enum above. */
export type StudentUserStatusValue = 'PENDING_INVITE' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export const STUDENT_USER_STATUS_VALUES: readonly StudentUserStatusValue[] = Object.freeze([
  'PENDING_INVITE',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
]);

/** Sprint 18 — StudentUser junction row shape returned by repo / service. */
export interface StudentUserRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly studentId: string;
  readonly userId: string;
  readonly status: StudentUserStatusValue;
  readonly invitedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly lastInviteAt: Date | null;
}
