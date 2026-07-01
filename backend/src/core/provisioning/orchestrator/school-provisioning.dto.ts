/**
 * DTOs for the orchestrator endpoints:
 *   - POST /v1/super-admin/schools           (ProvisionSchoolDto)
 *   - POST /v1/super-admin/schools/:id/plan  (AssignPlanDto)
 *
 * The one-time admin password returned by `ProvisionSchoolResponseDto` is
 * the *only* place the cleartext crosses the wire. Caller must communicate
 * it out-of-band; we do not persist it.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { SchoolResponseDto } from '../../school/school/school.dto';
import type { SchoolRootRow } from '../../school/school/school.types';
import { PLAN_TRIAL_DAYS_MAX, PLAN_TRIAL_DAYS_MIN } from '../provisioning.constants';
import type { PlanRow } from '../provisioning.types';
import type { ProvisionSchoolResult } from './school-provisioning.service';

const SCHOOL_SLUG_PATTERN = /^[a-z0-9-]+$/;

export class ProvisionSchoolDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 100,
    description: 'Tenant slug — lowercase alphanumerics + dashes only.',
  })
  @IsString()
  @Length(3, 100)
  @Matches(SCHOOL_SLUG_PATTERN, {
    message: 'slug must contain only lowercase letters, digits, and dashes',
  })
  public readonly slug!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  public readonly legalName!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  public readonly displayName!: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2, default: 'IN' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  public readonly countryCode?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 64, default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  public readonly timezone?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 16, default: 'en-IN' })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  public readonly localeDefault?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  public readonly contactEmail?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  public readonly contactPhone?: string;

  @ApiProperty({ description: 'Plan UUID to assign on provisioning.' })
  @IsUUID()
  public readonly planId!: string;

  @ApiPropertyOptional({
    minimum: PLAN_TRIAL_DAYS_MIN + 1,
    maximum: PLAN_TRIAL_DAYS_MAX,
    description: 'Override plan.defaultTrialDays. If omitted, the plan default is used.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PLAN_TRIAL_DAYS_MIN + 1)
  @Max(PLAN_TRIAL_DAYS_MAX)
  public readonly trialDays?: number;
}

export class AssignPlanDto {
  @ApiProperty()
  @IsUUID()
  public readonly planId!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PLAN_TRIAL_DAYS_MAX,
    description: 'Override plan expiry. If omitted, uses plan.defaultTrialDays from now.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PLAN_TRIAL_DAYS_MAX)
  public readonly expiresInDays?: number;
}

export class ProvisionedPlanRefDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;

  public static from(plan: PlanRow): ProvisionedPlanRefDto {
    return { id: plan.id, code: plan.code, name: plan.name };
  }
}

export class ProvisionSchoolResponseDto {
  @ApiProperty({ type: () => SchoolResponseDto })
  public readonly school!: SchoolResponseDto;

  @ApiProperty({ description: 'School-provisioning-run journal row ID.' })
  public readonly runId!: string;

  @ApiProperty({ description: 'Default super-admin email seeded during provisioning.' })
  public readonly adminEmail!: string;

  @ApiProperty({
    description:
      'ONE-TIME cleartext password for the seeded admin. The admin must change ' +
      'it on first login (must_change_password=true). This is the only place the ' +
      'cleartext appears — there is no read-back endpoint.',
  })
  public readonly adminTemporaryPassword!: string;

  @ApiProperty({ type: () => ProvisionedPlanRefDto })
  public readonly plan!: ProvisionedPlanRefDto;

  public static from(result: ProvisionSchoolResult): ProvisionSchoolResponseDto {
    return {
      school: SchoolResponseDto.from(result.school as SchoolRootRow),
      runId: result.runId,
      adminEmail: result.adminEmail,
      adminTemporaryPassword: result.adminTemporaryPassword,
      plan: ProvisionedPlanRefDto.from(result.plan),
    };
  }
}
