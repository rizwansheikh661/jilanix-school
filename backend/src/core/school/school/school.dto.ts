/**
 * DTOs for `/super-admin/schools` — list / get / update (legal+contact).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  SCHOOL_LIFECYCLE_STATUS_VALUES,
  type SchoolLifecycleStatusValue,
  type SchoolPlanStatusValue,
  type SchoolRootRow,
} from './school.types';

export class SchoolListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SCHOOL_LIFECYCLE_STATUS_VALUES })
  @IsOptional()
  @IsIn(SCHOOL_LIFECYCLE_STATUS_VALUES as readonly string[])
  public readonly lifecycleStatus?: SchoolLifecycleStatusValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly planId?: string;

  @ApiPropertyOptional({
    description: 'Sub-string match against slug (case-insensitive on MySQL ci collation).',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public readonly slugSearch?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  public readonly includeDeleted?: boolean;
}

export class UpdateSchoolDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public readonly legalName?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public readonly displayName?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 15 })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  public readonly gstin?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  public readonly pan?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public readonly addressLine1?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public readonly addressLine2?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public readonly city?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  public readonly stateCode?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  public readonly pincode?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  public readonly phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  public readonly email?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public readonly website?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 64 })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  public readonly timezone?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 16 })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  public readonly localeDefault?: string;
}

export class SuspendSchoolDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  public readonly reason!: string;
}

export class CancelSchoolDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  public readonly reason!: string;
}

export class SchoolResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly slug!: string;
  @ApiProperty() public readonly legalName!: string;
  @ApiProperty() public readonly displayName!: string;
  @ApiProperty() public readonly countryCode!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly gstin!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly pan!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly addressLine1!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly addressLine2!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly city!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly stateCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly pincode!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly email!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly website!: string | null;
  @ApiProperty() public readonly timezone!: string;
  @ApiProperty() public readonly localeDefault!: string;
  @ApiProperty() public readonly status!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly onboardedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly archivedAt!: string | null;
  @ApiProperty({ enum: SCHOOL_LIFECYCLE_STATUS_VALUES })
  public readonly lifecycleStatus!: SchoolLifecycleStatusValue;
  @ApiPropertyOptional({ nullable: true }) public readonly trialStartDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly trialEndDate!: string | null;
  @ApiProperty() public readonly trialExtendedCount!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly planId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly planAssignedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly planExpiresAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly planStatus!: SchoolPlanStatusValue | null;
  @ApiPropertyOptional({ nullable: true }) public readonly suspendedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly suspendedReason!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly cancelledAt!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiProperty() public readonly version!: number;

  public static from(row: SchoolRootRow): SchoolResponseDto {
    return {
      id: row.id,
      slug: row.slug,
      legalName: row.legalName,
      displayName: row.displayName,
      countryCode: row.countryCode,
      gstin: row.gstin,
      pan: row.pan,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      stateCode: row.stateCode,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      website: row.website,
      timezone: row.timezone,
      localeDefault: row.localeDefault,
      status: row.status,
      onboardedAt: row.onboardedAt === null ? null : row.onboardedAt.toISOString(),
      archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
      lifecycleStatus: row.lifecycleStatus,
      trialStartDate: row.trialStartDate === null ? null : row.trialStartDate.toISOString(),
      trialEndDate: row.trialEndDate === null ? null : row.trialEndDate.toISOString(),
      trialExtendedCount: row.trialExtendedCount,
      planId: row.planId,
      planAssignedAt: row.planAssignedAt === null ? null : row.planAssignedAt.toISOString(),
      planExpiresAt: row.planExpiresAt === null ? null : row.planExpiresAt.toISOString(),
      planStatus: row.planStatus,
      suspendedAt: row.suspendedAt === null ? null : row.suspendedAt.toISOString(),
      suspendedReason: row.suspendedReason,
      cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}

export class SchoolListResponseDto {
  @ApiProperty({ type: () => [SchoolResponseDto] })
  public readonly items!: readonly SchoolResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
