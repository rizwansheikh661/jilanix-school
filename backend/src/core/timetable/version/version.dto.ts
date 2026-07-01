/**
 * DTOs for `/timetable/versions`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  TIMETABLE_VERSION_STATUS_VALUES,
  type TimetableVersionStatusValue,
} from '../timetable.constants';
import type { TimetableVersionRow } from '../timetable.types';

export class CreateTimetableVersionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly branchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly periodTemplateId!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString() @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ format: 'date', example: '2026-04-01' })
  @IsDateString()
  public readonly effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true, example: '2027-03-31' })
  @IsOptional() @IsDateString()
  public readonly effectiveTo?: string | null;
}

export class UpdateTimetableVersionDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly effectiveFrom?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @IsDateString()
  public readonly effectiveTo?: string | null;
}

export class TimetableVersionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional({ enum: TIMETABLE_VERSION_STATUS_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(TIMETABLE_VERSION_STATUS_VALUES as unknown as object)
  public readonly status?: TimetableVersionStatusValue;
}

export class TimetableVersionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly branchId!: string;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiProperty() public readonly periodTemplateId!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: TIMETABLE_VERSION_STATUS_VALUES as unknown as string[] })
  public readonly status!: TimetableVersionStatusValue;
  @ApiProperty({ format: 'date' }) public readonly effectiveFrom!: string;
  @ApiPropertyOptional({ format: 'date', nullable: true })
  public readonly effectiveTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly activatedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly archivedAt!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: TimetableVersionRow): TimetableVersionResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      academicYearId: row.academicYearId,
      periodTemplateId: row.periodTemplateId,
      name: row.name,
      status: row.status,
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo:
        row.effectiveTo === null ? null : row.effectiveTo.toISOString().slice(0, 10),
      activatedAt: row.activatedAt === null ? null : row.activatedAt.toISOString(),
      archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class TimetableVersionListResponseDto {
  @ApiProperty({ type: () => [TimetableVersionResponseDto] })
  public readonly items!: readonly TimetableVersionResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

// Re-exported so `Type(() => Number)` import isn't tree-shaken from
// transformer metadata.
export const __dtoUsesType = Type;
