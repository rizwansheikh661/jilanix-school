/**
 * Provisioning domain type surface — service-layer shapes for the Sprint 14
 * provisioning module. Wave 2 only needs the Plan row; later waves add
 * SchoolLifecycleAction, ProvisioningRunStep, PasswordResetRequestRow, etc.
 */

export interface PlanRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly defaultTrialDays: number;
  readonly emailEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly pushEnabled: boolean;
  readonly inAppEnabled: boolean;
  readonly emailMonthlyLimit: number;
  readonly smsMonthlyLimit: number;
  readonly pushMonthlyLimit: number;
  readonly inAppMonthlyLimit: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}
