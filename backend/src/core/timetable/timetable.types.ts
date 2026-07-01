/**
 * Timetable domain row shapes. Repos map raw Prisma rows into these
 * interfaces so the rest of the module never imports Prisma directly.
 *
 * Times on `PeriodTemplatePeriod` arrive from Prisma as `Date` (db.Time)
 * with year/month/day = 1970-01-01; only the H:M:S portion is semantic.
 * Repos expose them as `HH:MM:SS` strings to insulate callers from the
 * stub-date quirk.
 */
import type {
  PeriodTypeValue,
  SubstitutionStatusValue,
  TeacherAvailabilityKindValue,
  TimetableConflictTypeValue,
  TimetableVersionStatusValue,
} from './timetable.constants';

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

export interface PeriodTemplateRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string;
  readonly academicYearId: string;
  readonly name: string;
  readonly description: string | null;
  readonly days: readonly number[];
  readonly isDefault: boolean;
}

export interface PeriodTemplatePeriodRow {
  readonly id: string;
  readonly schoolId: string;
  readonly periodTemplateId: string;
  readonly index: number;
  readonly label: string;
  readonly type: PeriodTypeValue;
  /** `HH:MM:SS` in 24-hour clock. */
  readonly startTime: string;
  /** `HH:MM:SS` in 24-hour clock. */
  readonly endTime: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface PeriodTemplateWithPeriods extends PeriodTemplateRow {
  readonly periods: readonly PeriodTemplatePeriodRow[];
}

export interface TimetableVersionRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string;
  readonly academicYearId: string;
  readonly periodTemplateId: string;
  readonly name: string;
  readonly status: TimetableVersionStatusValue;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly activatedAt: Date | null;
  readonly archivedAt: Date | null;
}

export interface TimetableEntryRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly timetableVersionId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly staffId: string;
  readonly roomId: string | null;
  readonly dayOfWeek: number;
  readonly periodIndex: number;
  readonly notes: string | null;
}

export interface TeacherLoadRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly timetableVersionId: string;
  readonly staffId: string;
  readonly periodsPerWeek: number;
  readonly maxConsecutive: number;
  /** Day-of-week (1..7) → count of TEACHING periods that day. */
  readonly dailyCounts: Readonly<Record<string, number>>;
  /** Subject id → count of periods. */
  readonly subjectMix: Readonly<Record<string, number>>;
  readonly computedAt: Date;
}

export interface TeacherAvailabilityRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly staffId: string;
  readonly academicYearId: string;
  readonly kind: TeacherAvailabilityKindValue;
  readonly dayOfWeek: number;
  readonly periodIndex: number | null;
  readonly reason: string | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface TimetableConflictRow {
  readonly id: string;
  readonly schoolId: string;
  readonly timetableVersionId: string;
  readonly type: TimetableConflictTypeValue;
  readonly contextJson: Readonly<Record<string, unknown>>;
  readonly entryAId: string;
  readonly entryBId: string | null;
  readonly detectedAt: Date;
  readonly detectedBy: string | null;
}

export interface TimetableSubstitutionRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly timetableVersionId: string;
  readonly originalEntryId: string;
  readonly date: Date;
  readonly substituteStaffId: string | null;
  readonly reason: string | null;
  readonly status: SubstitutionStatusValue;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
}
