export const CalendarPermissions = {
  EVENT_READ: 'calendar.event.read',
  EVENT_CREATE: 'calendar.event.create',
  EVENT_UPDATE: 'calendar.event.update',
  EVENT_DELETE: 'calendar.event.delete',
  HOLIDAY_READ: 'holiday.read',
  HOLIDAY_CREATE: 'holiday.create',
  HOLIDAY_UPDATE: 'holiday.update',
  HOLIDAY_DELETE: 'holiday.delete',
  WORKING_DAYS_READ: 'working_days.read',
  WORKING_DAYS_UPDATE: 'working_days.update',
} as const;

export type CalendarPermission = (typeof CalendarPermissions)[keyof typeof CalendarPermissions];

export const CALENDAR_PERMISSION_DESCRIPTIONS: Readonly<Record<CalendarPermission, string>> =
  Object.freeze({
    [CalendarPermissions.EVENT_READ]: 'List or read calendar events.',
    [CalendarPermissions.EVENT_CREATE]: 'Create a calendar event.',
    [CalendarPermissions.EVENT_UPDATE]: 'Update a calendar event.',
    [CalendarPermissions.EVENT_DELETE]: 'Delete a calendar event.',
    [CalendarPermissions.HOLIDAY_READ]: 'List or read holidays.',
    [CalendarPermissions.HOLIDAY_CREATE]: 'Create a holiday.',
    [CalendarPermissions.HOLIDAY_UPDATE]: 'Update a holiday.',
    [CalendarPermissions.HOLIDAY_DELETE]: 'Delete a holiday.',
    [CalendarPermissions.WORKING_DAYS_READ]: 'Read working-days configuration.',
    [CalendarPermissions.WORKING_DAYS_UPDATE]: 'Update working-days configuration.',
  });

export const SESSION_TYPE_VALUES = [
  'FULL',
  'HALF',
  'ALTERNATE_SAT',
  'FIRST_THIRD_SAT',
  'SECOND_FOURTH_SAT',
] as const;
export type SessionTypeValue = (typeof SESSION_TYPE_VALUES)[number];

export const CALENDAR_EVENT_TYPE_VALUES = [
  'EVENT',
  'PTM',
  'EXAM_WINDOW',
  'TERM_START',
  'TERM_END',
  'OTHER',
] as const;
export type CalendarEventTypeValue = (typeof CALENDAR_EVENT_TYPE_VALUES)[number];

export const HOLIDAY_TYPE_VALUES = [
  'NATIONAL',
  'STATE',
  'SCHOOL',
  'RELIGIOUS',
  'OPTIONAL',
] as const;
export type HolidayTypeValue = (typeof HOLIDAY_TYPE_VALUES)[number];

export const HALF_DAY_SESSION_VALUES = ['FIRST_HALF', 'SECOND_HALF'] as const;
export type HalfDaySessionValue = (typeof HALF_DAY_SESSION_VALUES)[number];

export const ATTENDANCE_TREATMENT_VALUES = ['HOLIDAY', 'WORKING_DAY'] as const;
export type AttendanceTreatmentValue = (typeof ATTENDANCE_TREATMENT_VALUES)[number];

export const CALENDAR_AUDIENCE_VALUES = ['STUDENT', 'PARENT', 'STAFF'] as const;
export type CalendarAudienceValue = (typeof CALENDAR_AUDIENCE_VALUES)[number];
