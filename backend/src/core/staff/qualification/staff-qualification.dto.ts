/**
 * DTOs for the StaffQualification sub-resource.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { StaffQualificationRow } from '../staff.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStaffQualificationDto {
  @ApiProperty({ maxLength: 40, description: 'DEGREE | CERTIFICATION | EXPERIENCE' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(40)
  public readonly qualificationType!: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly institution?: string;

  @ApiPropertyOptional({ minimum: 1900, maximum: 2100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2100)
  public readonly yearAwarded?: number;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40)
  public readonly gradeOrScore?: string;
}

export class StaffQualificationResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty() public readonly qualificationType!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ nullable: true }) public readonly institution!: string | null;
  @ApiProperty({ nullable: true }) public readonly yearAwarded!: number | null;
  @ApiProperty({ nullable: true }) public readonly gradeOrScore!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;

  public static from(row: StaffQualificationRow): StaffQualificationResponseDto {
    return {
      id: row.id,
      staffId: row.staffId,
      qualificationType: row.qualificationType,
      name: row.name,
      institution: row.institution,
      yearAwarded: row.yearAwarded,
      gradeOrScore: row.gradeOrScore,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    };
  }
}

export class StaffQualificationListResponseDto {
  @ApiProperty({ type: [StaffQualificationResponseDto] })
  public readonly items!: readonly StaffQualificationResponseDto[];
}
