/**
 * Subscription module domain types — service-layer shapes for Sprint 15.
 *
 * These mirror the Prisma rows but stay decoupled so callers depend only on
 * the service surface. Decimal columns surface as `number` (the price-grid
 * UX never needs more than 2 decimal places and JSON cannot carry Decimal
 * losslessly anyway).
 */

export type FeatureTypeValue = 'LIMIT' | 'TOGGLE';
export type FeatureModeValue = 'LIMITED' | 'UNLIMITED' | 'DISABLED' | 'ENABLED';
export type SubscriptionStatusValue =
  | 'PENDING'
  | 'TRIAL'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'CANCELLED';
export type BillingCycleValue = 'MONTHLY' | 'YEARLY' | 'TRIAL' | 'CUSTOM';
export type SubscriptionActionValue =
  | 'ASSIGNED'
  | 'ACTIVATED'
  | 'UPGRADED'
  | 'DOWNGRADED'
  | 'RENEWED'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REACTIVATED'
  | 'CANCELLED';
export type UsageThresholdValue = 'THRESHOLD_80' | 'THRESHOLD_90' | 'LIMIT_REACHED';

export interface PlanFeatureRow {
  readonly id: string;
  readonly planId: string;
  readonly featureKey: string;
  readonly featureType: FeatureTypeValue;
  readonly mode: FeatureModeValue;
  readonly limit: number | null;
  readonly sortOrder: number;
  readonly description: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface SubscriptionRow {
  readonly id: string;
  readonly schoolId: string;
  readonly planId: string;
  readonly status: SubscriptionStatusValue;
  readonly billingCycle: BillingCycleValue;
  readonly currency: string;
  readonly monthlyPrice: number;
  readonly yearlyPrice: number;
  readonly assignedBy: string | null;
  readonly assignedAt: Date | null;
  readonly startedAt: Date | null;
  readonly expiryDate: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
  readonly trialEndsAt: Date | null;
  readonly lastRenewedAt: Date | null;
  readonly nextRenewalAt: Date | null;
  readonly autoRenew: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface SubscriptionHistoryRow {
  readonly id: string;
  readonly schoolId: string;
  readonly subscriptionId: string;
  readonly action: SubscriptionActionValue;
  readonly fromPlanId: string | null;
  readonly toPlanId: string | null;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly actorUserId: string | null;
  readonly actorReason: string | null;
  readonly metadataJson: Record<string, unknown> | null;
  readonly occurredAt: Date;
}

export interface SchoolUsageRow {
  readonly id: string;
  readonly schoolId: string;
  readonly studentCount: number;
  readonly staffCount: number;
  readonly branchCount: number;
  readonly smsUsedThisPeriod: number;
  readonly whatsappUsedThisPeriod: number;
  readonly emailUsedThisPeriod: number;
  readonly storageBytesUsed: bigint;
  readonly usagePeriodStart: Date;
  readonly usagePeriodEnd: Date;
  readonly lastRecomputedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UsageEventRow {
  readonly id: string;
  readonly schoolId: string;
  readonly featureKey: string;
  readonly delta: number;
  readonly actorUserId: string | null;
  readonly sourceRef: string | null;
  readonly occurredAt: Date;
}

export interface UsageThresholdStateRow {
  readonly id: string;
  readonly schoolId: string;
  readonly featureKey: string;
  readonly lastNotifiedThreshold: UsageThresholdValue | null;
  readonly lastNotifiedAt: Date | null;
  readonly currentPercent: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
