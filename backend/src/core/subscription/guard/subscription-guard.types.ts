/**
 * Subscription guard types — value objects for the SubscriptionGuardService
 * return surface. Kept distinct from the row-level rows so the guard's
 * contract reads ergonomically at call sites.
 */
import type {
  FeatureModeValue,
  FeatureTypeValue,
  PlanFeatureRow,
  SchoolUsageRow,
  SubscriptionRow,
  UsageThresholdValue,
} from '../subscription.types';

export interface PlanStatusResult {
  readonly subscription: SubscriptionRow;
  /** True iff `status in (TRIAL, ACTIVE, EXPIRING)` — i.e. usable. */
  readonly isUsable: boolean;
}

export interface FeatureAvailabilityResult {
  readonly featureKey: string;
  readonly featureType: FeatureTypeValue;
  readonly mode: FeatureModeValue;
  readonly limit: number | null;
  readonly available: boolean;
  readonly feature: PlanFeatureRow | null;
}

export interface LimitAvailabilityResult {
  readonly featureKey: string;
  readonly used: number;
  readonly limit: number | null;
  /** null when mode is UNLIMITED; non-negative when LIMITED. */
  readonly remaining: number | null;
  readonly percent: number;
  /** True only when mode === LIMITED. */
  readonly capped: boolean;
}

export interface AssertAndConsumeResult {
  readonly featureKey: string;
  readonly newPercent: number;
  readonly remaining: number | null;
  readonly band: UsageThresholdValue | null;
  readonly bandCrossed: boolean;
  readonly usage: SchoolUsageRow;
}
