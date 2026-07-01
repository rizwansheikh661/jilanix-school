/**
 * Attendance domain row shapes. Repos map raw Prisma rows into these
 * interfaces so the rest of the module never imports Prisma directly.
 */
import type {
  AttendanceCorrectionStatusValue,
  AttendanceHistoryChangeTypeValue,
  AttendanceLockScopeValue,
  AttendanceSourceValue,
  AttendanceStatusValue,
} from './attendance.constants';

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface AttendanceDailyRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly academicYearId: string;
  readonly sectionId: string;
  readonly studentId: string;
  readonly date: Date;
  readonly status: AttendanceStatusValue;
  readonly source: AttendanceSourceValue;
  readonly markedAt: Date;
  readonly markedBy: string | null;
  readonly checkInTime: Date | null;
  readonly checkOutTime: Date | null;
  readonly remarks: string | null;
  readonly mode: 'DAILY' | 'PERIOD';
  readonly periodNumber: number | null;
  readonly subjectId: string | null;
}

export interface StaffAttendanceRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly staffId: string;
  readonly date: Date;
  readonly status: AttendanceStatusValue;
  readonly source: AttendanceSourceValue;
  readonly markedAt: Date;
  readonly markedBy: string | null;
  readonly checkInTime: Date | null;
  readonly checkOutTime: Date | null;
  readonly remarks: string | null;
}

export interface AttendanceLockWindowRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly scope: AttendanceLockScopeValue;
  readonly branchId: string | null;
  readonly sectionId: string | null;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason: string | null;
  readonly lockedBy: string | null;
  readonly lockedAt: Date;
}

export interface AttendanceCorrectionRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly attendanceDailyId: string;
  readonly requestedBy: string;
  readonly requestedAt: Date;
  readonly previousStatus: AttendanceStatusValue;
  readonly newStatus: AttendanceStatusValue;
  readonly reason: string;
  readonly supportingFileId: string | null;
  readonly status: AttendanceCorrectionStatusValue;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly decisionReason: string | null;
}

export interface AttendanceStatusHistoryRow {
  readonly id: string;
  readonly schoolId: string;
  readonly attendanceDailyId: string;
  readonly previousStatus: AttendanceStatusValue | null;
  readonly newStatus: AttendanceStatusValue;
  readonly changeType: AttendanceHistoryChangeTypeValue;
  readonly changedBy: string | null;
  readonly changedAt: Date;
  readonly reason: string | null;
  readonly correctionId: string | null;
}

export interface AttendanceConfigRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly editWindowHours: number;
  readonly lateThresholdMinutes: number;
  readonly correctionsRequireApproval: boolean;
  readonly allowedSources: readonly AttendanceSourceValue[];
  readonly holidayAutoMark: boolean;
}
