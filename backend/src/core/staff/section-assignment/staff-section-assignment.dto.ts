/**
 * DTOs for the StaffSectionAssignment sub-resource.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import type { StaffSectionAssignmentRow } from '../staff.types';

export class CreateStaffSectionAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60)
  public readonly periodsPerWeek?: number;
}

export class StaffSectionAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly sectionId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly subjectId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly academicYearId!: string;
  @ApiProperty({ nullable: true }) public readonly periodsPerWeek!: number | null;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;

  public static from(row: StaffSectionAssignmentRow): StaffSectionAssignmentResponseDto {
    return {
      id: row.id,
      staffId: row.staffId,
      sectionId: row.sectionId,
      subjectId: row.subjectId,
      academicYearId: row.academicYearId,
      periodsPerWeek: row.periodsPerWeek,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    };
  }
}

export class StaffSectionAssignmentListResponseDto {
  @ApiProperty({ type: [StaffSectionAssignmentResponseDto] })
  public readonly items!: readonly StaffSectionAssignmentResponseDto[];
}
