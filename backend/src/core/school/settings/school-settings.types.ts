/**
 * Row shape + canonical defaults for `school_settings`. Working-days bitmap
 * is a Mon-Sun keyed object stored as JSON; the canary seed and this module
 * agree on the same shape.
 */
export interface WorkingDaysJson {
  readonly mon: boolean;
  readonly tue: boolean;
  readonly wed: boolean;
  readonly thu: boolean;
  readonly fri: boolean;
  readonly sat: boolean;
  readonly sun: boolean;
}

export const DEFAULT_WORKING_DAYS: WorkingDaysJson = Object.freeze({
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: false,
});

export interface SchoolSettingsRow {
  readonly id: string;
  readonly schoolId: string;
  readonly workingDaysJson: WorkingDaysJson;
  readonly attendanceWindowHours: number;
  readonly examEditWindowHours: number;
  readonly invoiceNumberFormat: string;
  readonly defaultCommunicationLanguage: string;
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
  readonly privacyPolicyVersion: string | null;
  readonly privacyPolicyAcceptedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}
