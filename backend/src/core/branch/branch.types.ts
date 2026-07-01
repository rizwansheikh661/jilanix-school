export type BranchStatusValue = 'ACTIVE' | 'INACTIVE' | 'CLOSED';
export const BRANCH_STATUS_VALUES: readonly BranchStatusValue[] = Object.freeze([
  'ACTIVE', 'INACTIVE', 'CLOSED',
]);

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface BranchRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly parentBranchId: string | null;
  readonly code: string;
  readonly name: string;
  readonly isPrimary: boolean;
  readonly status: BranchStatusValue;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly stateCode: string | null;
  readonly pincode: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly establishedDate: Date | null;
  readonly managerStaffId: string | null;
}

export interface BranchSettingsRow extends AuditTail {
  readonly schoolId: string;
  readonly branchId: string;
  readonly workingDaysJson: unknown | null;
  readonly periodSettingsJson: unknown | null;
  readonly attendanceWindowOverrideHours: number | null;
  readonly primaryLanguage: string | null;
}
