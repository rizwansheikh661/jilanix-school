/**
 * Internal row interfaces returned by the academic repositories. Mirrors
 * the rbac.types.ts pattern: services and controllers consume these, never
 * Prisma's generated model types, so accidentally leaking infra-only
 * columns onto the wire requires an explicit edit here.
 */

export type SubjectTypeValue = 'CORE' | 'ELECTIVE' | 'LANGUAGE' | 'OTHER';

export const SUBJECT_TYPE_VALUES: readonly SubjectTypeValue[] = Object.freeze([
  'CORE',
  'ELECTIVE',
  'LANGUAGE',
  'OTHER',
]);

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface AcademicYearRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly name: string;
  /** ISO date (no time component). */
  readonly startDate: Date;
  readonly endDate: Date;
  readonly isCurrent: boolean;
}

export interface ClassRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly name: string;
  readonly gradeLevel: number;
  readonly displayOrder: number;
}

export interface SectionRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly classId: string;
  readonly name: string;
  readonly capacity: number | null;
  readonly classTeacherId: string | null;
}

export interface SubjectRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly name: string;
  readonly code: string;
  readonly type: SubjectTypeValue;
}

// ---------------------------------------------------------------------------
// Sprint 4 additions
// ---------------------------------------------------------------------------

export interface AcademicTermRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly academicYearId: string;
  readonly name: string;
  readonly sequence: number;
  readonly startDate: Date;
  readonly endDate: Date;
}

interface AuditTailNoVersion {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface ClassSubjectRow extends AuditTailNoVersion {
  readonly id: string;
  readonly schoolId: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly isOptional: boolean;
  readonly weeklyPeriods: number | null;
}

export type SectionSubjectMode = 'ADD' | 'REMOVE' | 'REPLACE';

export const SECTION_SUBJECT_MODES: readonly SectionSubjectMode[] = Object.freeze([
  'ADD',
  'REMOVE',
  'REPLACE',
]);

export interface SectionSubjectRow extends AuditTailNoVersion {
  readonly id: string;
  readonly schoolId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly mode: SectionSubjectMode;
  readonly replacesSubjectId: string | null;
}

export type PromotionStatusValue =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export const PROMOTION_STATUS_VALUES: readonly PromotionStatusValue[] = Object.freeze([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export interface AcademicYearPromotionRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly sourceAcademicYearId: string;
  readonly targetAcademicYearId: string;
  readonly status: PromotionStatusValue;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly summaryJson: unknown;
  readonly triggeredBy: string | null;
}
