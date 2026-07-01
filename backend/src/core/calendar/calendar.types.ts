import type {
  AttendanceTreatmentValue,
  CalendarAudienceValue,
  CalendarEventTypeValue,
  HalfDaySessionValue,
  HolidayTypeValue,
  SessionTypeValue,
} from './calendar.constants';

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface WorkingDaysConfigurationRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly dayOfWeek: number;
  readonly isWorking: boolean;
  readonly sessionType: SessionTypeValue;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly note: string | null;
}

export interface CalendarEventRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly academicYearId: string | null;
  readonly type: CalendarEventTypeValue;
  readonly title: string;
  readonly description: string | null;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly allDay: boolean;
  readonly startTime: Date | null;
  readonly endTime: Date | null;
  readonly audienceJson: readonly CalendarAudienceValue[] | null;
  readonly colorHex: string | null;
  readonly isRecurring: boolean;
  readonly recurrenceRule: string | null;
}

export interface HolidayRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly name: string;
  readonly date: Date;
  readonly type: HolidayTypeValue;
  readonly isFullDay: boolean;
  readonly halfDaySession: HalfDaySessionValue | null;
  readonly attendanceTreatment: AttendanceTreatmentValue;
  readonly notes: string | null;
}

export type WorkingDayResolutionSource = 'holiday' | 'branch' | 'school' | 'fallback';

export interface WorkingDayResolution {
  readonly date: Date;
  readonly isWorking: boolean;
  readonly sessionType: SessionTypeValue;
  readonly source: WorkingDayResolutionSource;
  readonly holidayId: string | null;
}
