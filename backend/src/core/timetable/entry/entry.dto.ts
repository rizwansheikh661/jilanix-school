/**
 * DTOs for `/timetable/entries`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import { TIMETABLE_BULK_MAX_ENTRIES } from '../timetable.constants';
import type { TimetableEntryRow } from '../timetable.types';

export class CreateTimetableEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly timetableVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly staffId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly roomId?: string | null;

  @ApiProperty({ minimum: 1, maximum: 7 })
  @IsInt() @Min(1) @Max(7)
  public readonly dayOfWeek!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1)
  public readonly periodIndex!: number;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class UpdateTimetableEntryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly staffId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly roomId?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional() @IsInt() @Min(1) @Max(7)
  public readonly dayOfWeek?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional() @IsInt() @Min(1)
  public readonly periodIndex?: number;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class BulkTimetableEntryItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly staffId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly roomId?: string | null;

  @ApiProperty({ minimum: 1, maximum: 7 })
  @IsInt() @Min(1) @Max(7)
  public readonly dayOfWeek!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1)
  public readonly periodIndex!: number;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class BulkTimetableEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly timetableVersionId!: string;

  @ApiProperty({ type: () => [BulkTimetableEntryItemDto], maxItems: TIMETABLE_BULK_MAX_ENTRIES })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TIMETABLE_BULK_MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => BulkTimetableEntryItemDto)
  public readonly entries!: readonly BulkTimetableEntryItemDto[];
}

export class TimetableEntryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly timetableVersionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly staffId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly roomId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional() @IsInt() @Min(1) @Max(7)
  @Type(() => Number)
  public readonly dayOfWeek?: number;
}

export class TimetableEntryResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly timetableVersionId!: string;
  @ApiProperty() public readonly sectionId!: string;
  @ApiProperty() public readonly subjectId!: string;
  @ApiProperty() public readonly staffId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly roomId!: string | null;
  @ApiProperty() public readonly dayOfWeek!: number;
  @ApiProperty() public readonly periodIndex!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly notes!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: TimetableEntryRow): TimetableEntryResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      timetableVersionId: row.timetableVersionId,
      sectionId: row.sectionId,
      subjectId: row.subjectId,
      staffId: row.staffId,
      roomId: row.roomId,
      dayOfWeek: row.dayOfWeek,
      periodIndex: row.periodIndex,
      notes: row.notes,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class TimetableEntryListResponseDto {
  @ApiProperty({ type: () => [TimetableEntryResponseDto] })
  public readonly items!: readonly TimetableEntryResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class BulkTimetableEntryResultDto {
  @ApiProperty() public readonly index!: number;
  @ApiProperty() public readonly sectionId!: string;
  @ApiProperty() public readonly dayOfWeek!: number;
  @ApiProperty() public readonly periodIndex!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly id!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly error!: string | null;
}

export class BulkTimetableEntryResponseDto {
  @ApiProperty() public readonly created!: number;
  @ApiProperty() public readonly failed!: number;
  @ApiProperty({ type: () => [BulkTimetableEntryResultDto] })
  public readonly results!: readonly BulkTimetableEntryResultDto[];
}
