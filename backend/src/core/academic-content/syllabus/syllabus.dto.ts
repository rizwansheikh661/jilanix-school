/**
 * DTOs for `/syllabi` + `/syllabi/:id/nodes` + `/syllabus-nodes/:id/complete`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  SYLLABUS_NODE_STATUS_VALUES,
  SYLLABUS_NODE_TYPE_VALUES,
  SYLLABUS_STATUS_VALUES,
  type SyllabusNodeStatusValue,
  type SyllabusNodeTypeValue,
  type SyllabusStatusValue,
} from '../academic-content.constants';
import type {
  SyllabusNodeRow,
  SyllabusRow,
} from '../academic-content.types';

// -------- syllabus header --------

export class SyllabusListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly classId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly subjectId?: string;

  @ApiPropertyOptional({ enum: SYLLABUS_STATUS_VALUES })
  @IsOptional() @IsEnum(SYLLABUS_STATUS_VALUES)
  public readonly status?: SyllabusStatusValue;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly ownedByStaffId?: string;
}

export class CreateSyllabusDto {
  @ApiProperty() @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty() @IsUUID()
  public readonly classId!: string;

  @ApiProperty() @IsUUID()
  public readonly subjectId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsISO8601()
  public readonly plannedCompletionDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly ownedByStaffId?: string | null;
}

export class UpdateSyllabusDto {
  @ApiPropertyOptional({ enum: SYLLABUS_STATUS_VALUES })
  @IsOptional() @IsEnum(SYLLABUS_STATUS_VALUES)
  public readonly status?: SyllabusStatusValue;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsISO8601()
  public readonly plannedCompletionDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsISO8601()
  public readonly actualCompletionDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly ownedByStaffId?: string | null;
}

export class SyllabusResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiProperty() public readonly classId!: string;
  @ApiProperty() public readonly subjectId!: string;
  @ApiProperty({ enum: SYLLABUS_STATUS_VALUES })
  public readonly status!: SyllabusStatusValue;
  @ApiPropertyOptional({ nullable: true }) public readonly plannedCompletionDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly actualCompletionDate!: string | null;
  @ApiProperty() public readonly completionPercent!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly ownedByStaffId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: SyllabusRow): SyllabusResponseDto {
    return {
      id: row.id,
      academicYearId: row.academicYearId,
      classId: row.classId,
      subjectId: row.subjectId,
      status: row.status,
      plannedCompletionDate:
        row.plannedCompletionDate === null
          ? null
          : row.plannedCompletionDate.toISOString().slice(0, 10),
      actualCompletionDate:
        row.actualCompletionDate === null
          ? null
          : row.actualCompletionDate.toISOString().slice(0, 10),
      completionPercent: row.completionPercent,
      ownedByStaffId: row.ownedByStaffId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class SyllabusListResponseDto {
  @ApiProperty({ type: () => [SyllabusResponseDto] })
  public readonly items!: readonly SyllabusResponseDto[];
  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

// -------- nodes --------

export class CreateSyllabusNodeDto {
  @ApiProperty({ enum: SYLLABUS_NODE_TYPE_VALUES })
  @IsEnum(SYLLABUS_NODE_TYPE_VALUES)
  public readonly nodeType!: SyllabusNodeTypeValue;

  @ApiPropertyOptional({
    description: 'Required for CHAPTER/TOPIC; must be null for UNIT.',
    nullable: true,
  })
  @IsOptional() @IsUUID()
  public readonly parentNodeId?: string | null;

  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200)
  public readonly name!: string;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number) @IsInt() @Min(0)
  public readonly sequence!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsISO8601()
  public readonly plannedCompletionDate?: string | null;
}

export class UpdateSyllabusNodeDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  public readonly name?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  public readonly sequence?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsISO8601()
  public readonly plannedCompletionDate?: string | null;

  @ApiPropertyOptional({ enum: SYLLABUS_NODE_STATUS_VALUES })
  @IsOptional() @IsEnum(SYLLABUS_NODE_STATUS_VALUES)
  public readonly status?: SyllabusNodeStatusValue;
}

export class CompleteSyllabusNodeDto {
  @ApiProperty() @IsUUID()
  public readonly completedByStaffId!: string;

  @ApiPropertyOptional({
    description: 'ISO date. Defaults to today.',
    nullable: true,
  })
  @IsOptional() @IsISO8601()
  public readonly actualCompletionDate?: string | null;
}

export class SyllabusNodeResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly syllabusId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly parentNodeId!: string | null;
  @ApiProperty({ enum: SYLLABUS_NODE_TYPE_VALUES })
  public readonly nodeType!: SyllabusNodeTypeValue;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly sequence!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly plannedCompletionDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly actualCompletionDate!: string | null;
  @ApiProperty({ enum: SYLLABUS_NODE_STATUS_VALUES })
  public readonly status!: SyllabusNodeStatusValue;
  @ApiPropertyOptional({ nullable: true }) public readonly completedByStaffId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: SyllabusNodeRow): SyllabusNodeResponseDto {
    return {
      id: row.id,
      syllabusId: row.syllabusId,
      parentNodeId: row.parentNodeId,
      nodeType: row.nodeType,
      name: row.name,
      sequence: row.sequence,
      plannedCompletionDate:
        row.plannedCompletionDate === null
          ? null
          : row.plannedCompletionDate.toISOString().slice(0, 10),
      actualCompletionDate:
        row.actualCompletionDate === null
          ? null
          : row.actualCompletionDate.toISOString().slice(0, 10),
      status: row.status,
      completedByStaffId: row.completedByStaffId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class SyllabusNodeListResponseDto {
  @ApiProperty({ type: () => [SyllabusNodeResponseDto] })
  public readonly items!: readonly SyllabusNodeResponseDto[];
}
