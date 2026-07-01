/**
 * DTOs for `/report-templates`. Service enforces tenant scope, ownership,
 * and feature-flag gating.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  REPORT_KIND_VALUES,
  type ReportKindValue,
} from '../reporting.constants';
import type { ReportTemplateRow } from '../reporting.types';

export class CreateReportTemplateDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  public readonly description?: string;

  @ApiProperty({ enum: REPORT_KIND_VALUES })
  @IsEnum(REPORT_KIND_VALUES)
  public readonly reportKind!: ReportKindValue;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly params!: Record<string, unknown>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  public readonly isShared?: boolean;
}

export class UpdateReportTemplateDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  public readonly description?: string;

  @ApiPropertyOptional({ enum: REPORT_KIND_VALUES })
  @IsOptional()
  @IsEnum(REPORT_KIND_VALUES)
  public readonly reportKind?: ReportKindValue;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly params?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly isShared?: boolean;
}

export class ReportTemplateListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_KIND_VALUES })
  @IsOptional()
  @IsEnum(REPORT_KIND_VALUES)
  public readonly reportKind?: ReportKindValue;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  public readonly isShared?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  public readonly mineOnly?: boolean;
}

export class ReportTemplateResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty({ enum: REPORT_KIND_VALUES })
  public readonly reportKind!: ReportKindValue;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly params!: Record<string, unknown>;
  @ApiProperty() public readonly isShared!: boolean;
  @ApiProperty() public readonly ownedByUserId!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: ReportTemplateRow): ReportTemplateResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      description: row.description,
      reportKind: row.reportKind,
      params: row.params,
      isShared: row.isShared,
      ownedByUserId: row.ownedByUserId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class ReportTemplateListResponseDto {
  @ApiProperty({ type: () => [ReportTemplateResponseDto] })
  public readonly items!: readonly ReportTemplateResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
