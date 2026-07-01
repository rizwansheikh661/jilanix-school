/**
 * DTOs for `/dashboards` and `/dashboards/:id/widgets`. Service enforces
 * tenant scope, widget count cap, and feature-flag gating.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  DASHBOARD_WIDGET_KIND_VALUES,
  DESCRIPTION_MAX_LENGTH,
  MAX_WIDGET_POSITION,
  NAME_MAX_LENGTH,
  type DashboardWidgetKindValue,
} from '../reporting.constants';
import type { DashboardRow, DashboardWidgetRow } from '../reporting.types';

export class CreateDashboardDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  public readonly description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  public readonly isDefault?: boolean;
}

export class UpdateDashboardDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly isDefault?: boolean;
}

export class DashboardListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly ownedByUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  public readonly isDefault?: boolean;
}

export class DashboardResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty() public readonly isDefault!: boolean;
  @ApiProperty() public readonly ownedByUserId!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: DashboardRow): DashboardResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      description: row.description,
      isDefault: row.isDefault,
      ownedByUserId: row.ownedByUserId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class DashboardListResponseDto {
  @ApiProperty({ type: () => [DashboardResponseDto] })
  public readonly items!: readonly DashboardResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class CreateDashboardWidgetDto {
  @ApiProperty({ enum: DASHBOARD_WIDGET_KIND_VALUES })
  @IsEnum(DASHBOARD_WIDGET_KIND_VALUES)
  public readonly kind!: DashboardWidgetKindValue;

  @ApiProperty({ minimum: 0, maximum: MAX_WIDGET_POSITION })
  @IsInt()
  @Min(0)
  @Max(MAX_WIDGET_POSITION)
  public readonly position!: number;

  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  public readonly title!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly config!: Record<string, unknown>;
}

export class UpdateDashboardWidgetDto {
  @ApiPropertyOptional({ enum: DASHBOARD_WIDGET_KIND_VALUES })
  @IsOptional()
  @IsEnum(DASHBOARD_WIDGET_KIND_VALUES)
  public readonly kind?: DashboardWidgetKindValue;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_WIDGET_POSITION })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_WIDGET_POSITION)
  public readonly position?: number;

  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  public readonly title?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly config?: Record<string, unknown>;
}

export class DashboardWidgetResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly dashboardId!: string;
  @ApiProperty({ enum: DASHBOARD_WIDGET_KIND_VALUES })
  public readonly kind!: DashboardWidgetKindValue;
  @ApiProperty() public readonly position!: number;
  @ApiProperty() public readonly title!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly config!: Record<string, unknown>;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: DashboardWidgetRow): DashboardWidgetResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      dashboardId: row.dashboardId,
      kind: row.kind,
      position: row.position,
      title: row.title,
      config: row.config,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class DashboardWidgetListResponseDto {
  @ApiProperty({ type: () => [DashboardWidgetResponseDto] })
  public readonly items!: readonly DashboardWidgetResponseDto[];
}
