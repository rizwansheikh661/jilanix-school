export type DepartmentTypeValue =
  | 'ACADEMIC' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'HR' | 'IT';
export const DEPARTMENT_TYPE_VALUES: readonly DepartmentTypeValue[] = Object.freeze([
  'ACADEMIC', 'ADMIN', 'SUPPORT', 'FINANCE', 'HR', 'IT',
]);

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface DepartmentRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string | null;
  readonly parentDepartmentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly type: DepartmentTypeValue;
  readonly description: string | null;
  readonly headStaffId: string | null;
}

export interface DesignationRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly rank: number;
  readonly isTeaching: boolean;
  readonly isManagement: boolean;
  readonly description: string | null;
  readonly reportsToDesignationId: string | null;
}
