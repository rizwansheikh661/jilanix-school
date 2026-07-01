/**
 * DTOs for the ClassTeacher (homeroom) sub-resource.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

import type { ClassTeacherRow } from '../staff.types';

export class AssignClassTeacherDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly staffId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly assignedOn!: string;
}

export class RevokeClassTeacherDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly revokedOn!: string;
}

export class ClassTeacherResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly sectionId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly academicYearId!: string;
  @ApiProperty({ format: 'date' }) public readonly assignedOn!: string;
  @ApiProperty({ nullable: true, format: 'date' }) public readonly revokedOn!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly updatedBy!: string | null;

  public static from(row: ClassTeacherRow): ClassTeacherResponseDto {
    return {
      id: row.id,
      staffId: row.staffId,
      sectionId: row.sectionId,
      academicYearId: row.academicYearId,
      assignedOn: toIsoDate(row.assignedOn),
      revokedOn: row.revokedOn === null ? null : toIsoDate(row.revokedOn),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class ClassTeacherListResponseDto {
  @ApiProperty({ type: [ClassTeacherResponseDto] })
  public readonly items!: readonly ClassTeacherResponseDto[];
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
