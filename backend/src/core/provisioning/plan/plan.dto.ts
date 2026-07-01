/**
 * DTOs for `/super-admin/plans` CRUD endpoints. Service enforces uniqueness
 * + reference-counting; DTOs enforce field shape + max-length contracts.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  PLAN_CODE_MAX_LENGTH,
  PLAN_DESCRIPTION_MAX_LENGTH,
  PLAN_MONTHLY_LIMIT_MAX,
  PLAN_MONTHLY_LIMIT_MIN,
  PLAN_NAME_MAX_LENGTH,
  PLAN_TRIAL_DAYS_MAX,
  PLAN_TRIAL_DAYS_MIN,
} from '../provisioning.constants';
import type { PlanRow } from '../provisioning.types';

const PLAN_CODE_PATTERN = /^[A-Z][A-Z0-9_-]*$/;

export class CreatePlanDto {
  @ApiProperty({
    maxLength: PLAN_CODE_MAX_LENGTH,
    description: 'Stable plan code (uppercase, e.g. "STARTER").',
  })
  @IsString()
  @MaxLength(PLAN_CODE_MAX_LENGTH)
  @Matches(PLAN_CODE_PATTERN, {
    message: 'code must start with an uppercase letter and contain only A-Z, 0-9, _ or -',
  })
  public readonly code!: string;

  @ApiProperty({ maxLength: PLAN_NAME_MAX_LENGTH })
  @IsString()
  @MaxLength(PLAN_NAME_MAX_LENGTH)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: PLAN_DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(PLAN_DESCRIPTION_MAX_LENGTH)
  public readonly description?: string;

  @ApiPropertyOptional({ minimum: PLAN_TRIAL_DAYS_MIN, maximum: PLAN_TRIAL_DAYS_MAX, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_TRIAL_DAYS_MIN)
  @Max(PLAN_TRIAL_DAYS_MAX)
  public readonly defaultTrialDays?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  public readonly emailEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  public readonly smsEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  public readonly pushEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  public readonly inAppEnabled?: boolean;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly emailMonthlyLimit?: number;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly smsMonthlyLimit?: number;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly pushMonthlyLimit?: number;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly inAppMonthlyLimit?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ maxLength: PLAN_NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(PLAN_NAME_MAX_LENGTH)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: PLAN_DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(PLAN_DESCRIPTION_MAX_LENGTH)
  public readonly description?: string;

  @ApiPropertyOptional({ minimum: PLAN_TRIAL_DAYS_MIN, maximum: PLAN_TRIAL_DAYS_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_TRIAL_DAYS_MIN)
  @Max(PLAN_TRIAL_DAYS_MAX)
  public readonly defaultTrialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly emailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly smsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly pushEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly inAppEnabled?: boolean;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly emailMonthlyLimit?: number;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly smsMonthlyLimit?: number;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly pushMonthlyLimit?: number;

  @ApiPropertyOptional({ minimum: PLAN_MONTHLY_LIMIT_MIN, maximum: PLAN_MONTHLY_LIMIT_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_MONTHLY_LIMIT_MIN)
  @Max(PLAN_MONTHLY_LIMIT_MAX)
  public readonly inAppMonthlyLimit?: number;
}

export class PlanListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Include soft-deleted plans in the list (default false).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  public readonly includeDeleted?: boolean;
}

export class PlanResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty() public readonly defaultTrialDays!: number;
  @ApiProperty() public readonly emailEnabled!: boolean;
  @ApiProperty() public readonly smsEnabled!: boolean;
  @ApiProperty() public readonly pushEnabled!: boolean;
  @ApiProperty() public readonly inAppEnabled!: boolean;
  @ApiProperty() public readonly emailMonthlyLimit!: number;
  @ApiProperty() public readonly smsMonthlyLimit!: number;
  @ApiProperty() public readonly pushMonthlyLimit!: number;
  @ApiProperty() public readonly inAppMonthlyLimit!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly deletedAt!: string | null;

  public static from(row: PlanRow): PlanResponseDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      defaultTrialDays: row.defaultTrialDays,
      emailEnabled: row.emailEnabled,
      smsEnabled: row.smsEnabled,
      pushEnabled: row.pushEnabled,
      inAppEnabled: row.inAppEnabled,
      emailMonthlyLimit: row.emailMonthlyLimit,
      smsMonthlyLimit: row.smsMonthlyLimit,
      pushMonthlyLimit: row.pushMonthlyLimit,
      inAppMonthlyLimit: row.inAppMonthlyLimit,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
    };
  }
}

export class PlanListResponseDto {
  @ApiProperty({ type: () => [PlanResponseDto] })
  public readonly items!: readonly PlanResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
