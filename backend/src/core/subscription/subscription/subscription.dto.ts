/**
 * Subscription DTOs — request validation + response shapes for the
 * `/v1/super-admin/schools/:schoolId/subscription*` and `/v1/me/subscription`
 * surfaces.
 */
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import {
  CANCELLATION_REASON_MAX_LENGTH,
  SUBSCRIPTION_DEFAULT_TRIAL_DAYS,
} from '../subscription.constants';
import type {
  BillingCycleValue,
  SubscriptionActionValue,
  SubscriptionHistoryRow,
  SubscriptionRow,
  SubscriptionStatusValue,
} from '../subscription.types';

const BILLING_CYCLES: readonly BillingCycleValue[] = ['MONTHLY', 'YEARLY', 'TRIAL', 'CUSTOM'];

export class AssignSubscriptionDto {
  @ApiProperty()
  @IsUUID()
  public planId!: string;

  @ApiProperty({ enum: BILLING_CYCLES })
  @IsEnum(['MONTHLY', 'YEARLY', 'TRIAL', 'CUSTOM'])
  public billingCycle!: BillingCycleValue;

  @ApiProperty({ required: false, minimum: 0, maximum: 365, default: SUBSCRIPTION_DEFAULT_TRIAL_DAYS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  public trialDays?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  public autoRenew?: boolean;
}

export class ChangePlanDto {
  @ApiProperty()
  @IsUUID()
  public newPlanId!: string;

  @ApiProperty({ required: false, enum: BILLING_CYCLES })
  @IsOptional()
  @IsEnum(['MONTHLY', 'YEARLY', 'TRIAL', 'CUSTOM'])
  public billingCycle?: BillingCycleValue;

  @ApiProperty({ required: false, nullable: true, maxLength: CANCELLATION_REASON_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(1, CANCELLATION_REASON_MAX_LENGTH)
  public reason?: string;
}

export class RenewSubscriptionDto {
  @ApiProperty({ minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  public extendDays!: number;

  @ApiProperty({ required: false, enum: BILLING_CYCLES })
  @IsOptional()
  @IsEnum(['MONTHLY', 'YEARLY', 'TRIAL', 'CUSTOM'])
  public billingCycle?: BillingCycleValue;
}

export class SuspendSubscriptionDto {
  @ApiProperty({ maxLength: CANCELLATION_REASON_MAX_LENGTH })
  @IsString()
  @Length(1, CANCELLATION_REASON_MAX_LENGTH)
  public reason!: string;
}

export class CancelSubscriptionDto {
  @ApiProperty({ maxLength: CANCELLATION_REASON_MAX_LENGTH })
  @IsString()
  @Length(1, CANCELLATION_REASON_MAX_LENGTH)
  public reason!: string;
}

export class SubscriptionResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public planId!: string;
  @ApiProperty() public status!: SubscriptionStatusValue;
  @ApiProperty() public billingCycle!: BillingCycleValue;
  @ApiProperty() public currency!: string;
  @ApiProperty() public monthlyPrice!: number;
  @ApiProperty() public yearlyPrice!: number;
  @ApiProperty({ nullable: true }) public assignedBy!: string | null;
  @ApiProperty({ nullable: true, type: String }) public assignedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public startedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public expiryDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) public cancelledAt!: string | null;
  @ApiProperty({ nullable: true }) public cancellationReason!: string | null;
  @ApiProperty({ nullable: true, type: String }) public trialEndsAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public lastRenewedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public nextRenewalAt!: string | null;
  @ApiProperty() public autoRenew!: boolean;
  @ApiProperty() public version!: number;

  public static from(row: SubscriptionRow): SubscriptionResponseDto {
    const dto = new SubscriptionResponseDto();
    dto.id = row.id;
    dto.schoolId = row.schoolId;
    dto.planId = row.planId;
    dto.status = row.status;
    dto.billingCycle = row.billingCycle;
    dto.currency = row.currency;
    dto.monthlyPrice = row.monthlyPrice;
    dto.yearlyPrice = row.yearlyPrice;
    dto.assignedBy = row.assignedBy;
    dto.assignedAt = row.assignedAt?.toISOString() ?? null;
    dto.startedAt = row.startedAt?.toISOString() ?? null;
    dto.expiryDate = row.expiryDate?.toISOString() ?? null;
    dto.cancelledAt = row.cancelledAt?.toISOString() ?? null;
    dto.cancellationReason = row.cancellationReason;
    dto.trialEndsAt = row.trialEndsAt?.toISOString() ?? null;
    dto.lastRenewedAt = row.lastRenewedAt?.toISOString() ?? null;
    dto.nextRenewalAt = row.nextRenewalAt?.toISOString() ?? null;
    dto.autoRenew = row.autoRenew;
    dto.version = row.version;
    return dto;
  }
}

export class SubscriptionListResponseDto {
  @ApiProperty({ type: [SubscriptionResponseDto] })
  public items!: SubscriptionResponseDto[];
}

export class SubscriptionHistoryResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public subscriptionId!: string;
  @ApiProperty() public action!: SubscriptionActionValue;
  @ApiProperty({ nullable: true }) public fromPlanId!: string | null;
  @ApiProperty({ nullable: true }) public toPlanId!: string | null;
  @ApiProperty({ nullable: true }) public fromStatus!: string | null;
  @ApiProperty({ nullable: true }) public toStatus!: string | null;
  @ApiProperty({ nullable: true }) public actorUserId!: string | null;
  @ApiProperty({ nullable: true }) public actorReason!: string | null;
  @ApiProperty({ nullable: true, type: Object }) public metadataJson!: Record<string, unknown> | null;
  @ApiProperty({ type: String }) public occurredAt!: string;

  public static from(row: SubscriptionHistoryRow): SubscriptionHistoryResponseDto {
    const dto = new SubscriptionHistoryResponseDto();
    dto.id = row.id;
    dto.subscriptionId = row.subscriptionId;
    dto.action = row.action;
    dto.fromPlanId = row.fromPlanId;
    dto.toPlanId = row.toPlanId;
    dto.fromStatus = row.fromStatus;
    dto.toStatus = row.toStatus;
    dto.actorUserId = row.actorUserId;
    dto.actorReason = row.actorReason;
    dto.metadataJson = row.metadataJson;
    dto.occurredAt = row.occurredAt.toISOString();
    return dto;
  }
}

export class SubscriptionHistoryListResponseDto {
  @ApiProperty({ type: [SubscriptionHistoryResponseDto] })
  public items!: SubscriptionHistoryResponseDto[];

  @ApiProperty({ nullable: true })
  public nextCursor!: string | null;
}
