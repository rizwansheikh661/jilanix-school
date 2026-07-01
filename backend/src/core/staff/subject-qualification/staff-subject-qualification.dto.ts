/**
 * DTOs for the StaffSubjectQualification sub-resource (replace-set).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import type { StaffSubjectQualificationRow } from '../staff.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SubjectQualificationItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiPropertyOptional({ maxLength: 20, description: 'PRIMARY | SECONDARY' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20)
  public readonly proficiency?: string;
}

export class ReplaceStaffSubjectQualificationsDto {
  @ApiProperty({ type: [SubjectQualificationItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubjectQualificationItemDto)
  @ArrayUnique((i: SubjectQualificationItemDto) => i.subjectId)
  public readonly items!: SubjectQualificationItemDto[];
}

export class StaffSubjectQualificationResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly subjectId!: string;
  @ApiProperty({ nullable: true }) public readonly proficiency!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;

  public static from(row: StaffSubjectQualificationRow): StaffSubjectQualificationResponseDto {
    return {
      id: row.id,
      staffId: row.staffId,
      subjectId: row.subjectId,
      proficiency: row.proficiency,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    };
  }
}

export class StaffSubjectQualificationListResponseDto {
  @ApiProperty({ type: [StaffSubjectQualificationResponseDto] })
  public readonly items!: readonly StaffSubjectQualificationResponseDto[];
}
