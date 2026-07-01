/**
 * DTOs for `/timetable/availability`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  TEACHER_AVAILABILITY_KIND_VALUES,
  type TeacherAvailabilityKindValue,
} from '../timetable.constants';
import type { TeacherAvailabilityRow } from '../timetable.types';

export class CreateTeacherAvailabilityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly staffId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty({ enum: TEACHER_AVAILABILITY_KIND_VALUES as unknown as string[] })
  @IsEnum(TEACHER_AVAILABILITY_KIND_VALUES as unknown as object)
  public readonly kind!: TeacherAvailabilityKindValue;

  @ApiProperty({ minimum: 1, maximum: 7 })
  @IsInt() @Min(1) @Max(7)
  public readonly dayOfWeek!: number;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsOptional() @IsInt() @Min(1)
  public readonly periodIndex?: number | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @IsString() @MaxLength(255)
  public readonly reason?: string | null;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @IsDateString()
  public readonly effectiveTo?: string | null;
}

export class UpdateTeacherAvailabilityDto {
  @ApiPropertyOptional({ enum: TEACHER_AVAILABILITY_KIND_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(TEACHER_AVAILABILITY_KIND_VALUES as unknown as object)
  public readonly kind?: TeacherAvailabilityKindValue;

  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional() @IsInt() @Min(1) @Max(7)
  public readonly dayOfWeek?: number;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsOptional() @IsInt() @Min(1)
  public readonly periodIndex?: number | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @IsString() @MaxLength(255)
  public readonly reason?: string | null;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly effectiveFrom?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @IsDateString()
  public readonly effectiveTo?: string | null;
}

export class TeacherAvailabilityListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly staffId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional() @IsInt() @Min(1) @Max(7)
  @Type(() => Number)
  public readonly dayOfWeek?: number;

  @ApiPropertyOptional({ enum: TEACHER_AVAILABILITY_KIND_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(TEACHER_AVAILABILITY_KIND_VALUES as unknown as object)
  public readonly kind?: TeacherAvailabilityKindValue;
}

export class TeacherAvailabilityResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly staffId!: string;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiProperty({ enum: TEACHER_AVAILABILITY_KIND_VALUES as unknown as string[] })
  public readonly kind!: TeacherAvailabilityKindValue;
  @ApiProperty() public readonly dayOfWeek!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly periodIndex!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly reason!: string | null;
  @ApiProperty({ format: 'date' }) public readonly effectiveFrom!: string;
  @ApiPropertyOptional({ format: 'date', nullable: true })
  public readonly effectiveTo!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: TeacherAvailabilityRow): TeacherAvailabilityResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      staffId: row.staffId,
      academicYearId: row.academicYearId,
      kind: row.kind,
      dayOfWeek: row.dayOfWeek,
      periodIndex: row.periodIndex,
      reason: row.reason,
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo === null ? null : row.effectiveTo.toISOString().slice(0, 10),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class TeacherAvailabilityListResponseDto {
  @ApiProperty({ type: () => [TeacherAvailabilityResponseDto] })
  public readonly items!: readonly TeacherAvailabilityResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
