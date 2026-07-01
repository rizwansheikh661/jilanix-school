/**
 * Examination domain row shapes. Repos map raw Prisma rows into these
 * interfaces so the rest of the module never imports Prisma directly.
 *
 * Decimal columns are surfaced as `number` after `toNumber()` conversion;
 * Date columns stay as JS `Date` (the controller layer ISO-formats them).
 * Time columns on ExamSchedule are emitted as `HH:MM:SS` strings.
 */
import type {
  ExamMarksChangeTypeValue,
  ExamResultStatusValue,
  ExamStatusValue,
  ExamTypeValue,
} from './examination.constants';

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

interface SoftDeleteTail {
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
}

// ---------------------------------------------------------------------------
// ExamScheme + bands
// ---------------------------------------------------------------------------
export interface ExamSchemeRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly name: string;
  readonly boardType: string | null;
  readonly passingPct: number;
  readonly marksEditWindowDays: number;
  readonly description: string | null;
}

export interface ExamSchemeBandRow {
  readonly id: string;
  readonly schoolId: string;
  readonly examSchemeId: string;
  readonly gradeLetter: string;
  readonly gradePoint: number | null;
  readonly minPct: number;
  readonly maxPct: number;
  readonly ordering: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface ExamSchemeWithBands extends ExamSchemeRow {
  readonly bands: readonly ExamSchemeBandRow[];
}

// ---------------------------------------------------------------------------
// Exam + maps
// ---------------------------------------------------------------------------
export interface ExamRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly academicYearId: string;
  readonly academicTermId: string | null;
  readonly examSchemeId: string;
  readonly name: string;
  readonly type: ExamTypeValue;
  readonly status: ExamStatusValue;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly defaultMaxMarks: number;
  readonly defaultPassMarks: number;
  readonly description: string | null;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
}

export interface ExamClassMapRow {
  readonly id: string;
  readonly schoolId: string;
  readonly examId: string;
  readonly classId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExamSectionMapRow {
  readonly id: string;
  readonly schoolId: string;
  readonly examId: string;
  readonly sectionId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExamWithMaps extends ExamRow {
  readonly classIds: readonly string[];
  readonly sectionIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
export interface ExamScheduleRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly examId: string;
  readonly subjectId: string;
  readonly sectionId: string;
  readonly roomId: string | null;
  readonly invigilatorStaffId: string | null;
  readonly date: Date;
  /** `HH:MM:SS` 24-hour. */
  readonly startTime: string;
  /** `HH:MM:SS` 24-hour. */
  readonly endTime: string;
  readonly maxMarks: number;
  readonly passMarks: number;
  readonly instructions: string | null;
}

// ---------------------------------------------------------------------------
// Marks + history
// ---------------------------------------------------------------------------
export interface ExamMarksRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly examId: string;
  readonly studentId: string;
  readonly subjectId: string;
  readonly sectionId: string;
  readonly marksObtained: number | null;
  readonly isAbsent: boolean;
  readonly remarks: string | null;
  readonly enteredAt: Date;
  readonly enteredBy: string | null;
}

export interface ExamMarksHistoryRow {
  readonly id: string;
  readonly schoolId: string;
  readonly examMarksId: string;
  readonly previousMarks: number | null;
  readonly newMarks: number | null;
  readonly previousIsAbsent: boolean;
  readonly newIsAbsent: boolean;
  readonly changeType: ExamMarksChangeTypeValue;
  readonly changedBy: string | null;
  readonly changedAt: Date;
  readonly reason: string | null;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
export interface ExamResultRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly examId: string;
  readonly studentId: string;
  readonly sectionId: string;
  readonly totalMarksObtained: number;
  readonly totalMaxMarks: number;
  readonly percentage: number;
  readonly gradeLetter: string | null;
  readonly gradePoint: number | null;
  readonly status: ExamResultStatusValue;
  readonly isPassed: boolean;
  readonly computedAt: Date;
  readonly computedBy: string | null;
}

export interface ExamSubjectResultRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly examResultId: string;
  readonly subjectId: string;
  readonly marksObtained: number | null;
  readonly maxMarks: number;
  readonly percentage: number | null;
  readonly isAbsent: boolean;
  readonly isPassed: boolean;
  readonly gradeLetter: string | null;
  readonly gradePoint: number | null;
}

export interface ExamResultWithSubjects extends ExamResultRow {
  readonly subjects: readonly ExamSubjectResultRow[];
}
