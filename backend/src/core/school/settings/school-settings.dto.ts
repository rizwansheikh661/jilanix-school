/**
 * DTOs for `/school/settings`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { DEFAULT_WORKING_DAYS, type SchoolSettingsRow, type WorkingDaysJson } from './school-settings.types';

const TIME_HHMMSS = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

class WorkingDaysDto implements WorkingDaysJson {
  @ApiProperty() @IsBoolean() public readonly mon!: boolean;
  @ApiProperty() @IsBoolean() public readonly tue!: boolean;
  @ApiProperty() @IsBoolean() public readonly wed!: boolean;
  @ApiProperty() @IsBoolean() public readonly thu!: boolean;
  @ApiProperty() @IsBoolean() public readonly fri!: boolean;
  @ApiProperty() @IsBoolean() public readonly sat!: boolean;
  @ApiProperty() @IsBoolean() public readonly sun!: boolean;
}

export class UpdateSchoolSettingsDto {
  @ApiPropertyOptional({ type: () => WorkingDaysDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WorkingDaysDto)
  public readonly workingDaysJson?: WorkingDaysDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 720 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  public readonly attendanceWindowHours?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 720 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  public readonly examEditWindowHours?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public readonly invoiceNumberFormat?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  public readonly defaultCommunicationLanguage?: string;

  @ApiPropertyOptional({ nullable: true, description: 'HH:MM or HH:MM:SS' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMMSS, { message: 'quietHoursStart must be HH:MM or HH:MM:SS' })
  public readonly quietHoursStart?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'HH:MM or HH:MM:SS' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMMSS, { message: 'quietHoursEnd must be HH:MM or HH:MM:SS' })
  public readonly quietHoursEnd?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  public readonly privacyPolicyVersion?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  public readonly privacyPolicyAcceptedAt?: string | null;
}

export class SchoolSettingsResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty({ type: () => WorkingDaysDto }) public readonly workingDaysJson!: WorkingDaysJson;
  @ApiProperty() public readonly attendanceWindowHours!: number;
  @ApiProperty() public readonly examEditWindowHours!: number;
  @ApiProperty() public readonly invoiceNumberFormat!: string;
  @ApiProperty() public readonly defaultCommunicationLanguage!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly quietHoursStart!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly quietHoursEnd!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly privacyPolicyVersion!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly privacyPolicyAcceptedAt!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiProperty() public readonly version!: number;

  public static from(row: SchoolSettingsRow): SchoolSettingsResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      workingDaysJson: row.workingDaysJson ?? DEFAULT_WORKING_DAYS,
      attendanceWindowHours: row.attendanceWindowHours,
      examEditWindowHours: row.examEditWindowHours,
      invoiceNumberFormat: row.invoiceNumberFormat,
      defaultCommunicationLanguage: row.defaultCommunicationLanguage,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      privacyPolicyVersion: row.privacyPolicyVersion,
      privacyPolicyAcceptedAt:
        row.privacyPolicyAcceptedAt === null ? null : row.privacyPolicyAcceptedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}
