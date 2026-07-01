/**
 * Plan-feature DTOs — request validation and response shapes for the
 * `/v1/super-admin/plans/:planId/features` controller.
 */
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import {
  FEATURE_DESCRIPTION_MAX_LENGTH,
  FEATURE_KEY_MAX_LENGTH,
  FEATURE_LIMIT_MAX,
  FEATURE_LIMIT_MIN,
} from '../subscription.constants';
import type {
  FeatureModeValue,
  FeatureTypeValue,
  PlanFeatureRow,
} from '../subscription.types';

const FEATURE_TYPES: readonly FeatureTypeValue[] = ['LIMIT', 'TOGGLE'];
const FEATURE_MODES: readonly FeatureModeValue[] = [
  'LIMITED',
  'UNLIMITED',
  'DISABLED',
  'ENABLED',
];

export class CreatePlanFeatureDto {
  @ApiProperty({ maxLength: FEATURE_KEY_MAX_LENGTH })
  @IsString()
  @Length(1, FEATURE_KEY_MAX_LENGTH)
  public featureKey!: string;

  @ApiProperty({ enum: FEATURE_TYPES })
  @IsEnum(['LIMIT', 'TOGGLE'])
  public featureType!: FeatureTypeValue;

  @ApiProperty({ enum: FEATURE_MODES })
  @IsEnum(['LIMITED', 'UNLIMITED', 'DISABLED', 'ENABLED'])
  public mode!: FeatureModeValue;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(FEATURE_LIMIT_MIN)
  public limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  public sortOrder?: number;

  @ApiProperty({ required: false, nullable: true, maxLength: FEATURE_DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(0, FEATURE_DESCRIPTION_MAX_LENGTH)
  public description?: string;
}

export class UpdatePlanFeatureDto {
  @ApiProperty({ required: false, enum: FEATURE_MODES })
  @IsOptional()
  @IsEnum(['LIMITED', 'UNLIMITED', 'DISABLED', 'ENABLED'])
  public mode?: FeatureModeValue;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(FEATURE_LIMIT_MIN)
  public limit?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  public sortOrder?: number;

  @ApiProperty({ required: false, nullable: true, maxLength: FEATURE_DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(0, FEATURE_DESCRIPTION_MAX_LENGTH)
  public description?: string | null;
}

export class BulkReplaceItemDto {
  @ApiProperty({ maxLength: FEATURE_KEY_MAX_LENGTH })
  @IsString()
  @Length(1, FEATURE_KEY_MAX_LENGTH)
  public featureKey!: string;

  @ApiProperty({ enum: FEATURE_TYPES })
  @IsEnum(['LIMIT', 'TOGGLE'])
  public featureType!: FeatureTypeValue;

  @ApiProperty({ enum: FEATURE_MODES })
  @IsEnum(['LIMITED', 'UNLIMITED', 'DISABLED', 'ENABLED'])
  public mode!: FeatureModeValue;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(FEATURE_LIMIT_MIN)
  public limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  public sortOrder?: number;

  @ApiProperty({ required: false, nullable: true, maxLength: FEATURE_DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(0, FEATURE_DESCRIPTION_MAX_LENGTH)
  public description?: string;
}

export class BulkReplacePlanFeaturesDto {
  @ApiProperty({ type: [BulkReplaceItemDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkReplaceItemDto)
  public items!: BulkReplaceItemDto[];
}

export class PlanFeatureResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public planId!: string;
  @ApiProperty() public featureKey!: string;
  @ApiProperty() public featureType!: FeatureTypeValue;
  @ApiProperty() public mode!: FeatureModeValue;
  @ApiProperty({ nullable: true }) public limit!: number | null;
  @ApiProperty() public sortOrder!: number;
  @ApiProperty({ nullable: true }) public description!: string | null;
  @ApiProperty() public version!: number;

  public static from(row: PlanFeatureRow): PlanFeatureResponseDto {
    const dto = new PlanFeatureResponseDto();
    dto.id = row.id;
    dto.planId = row.planId;
    dto.featureKey = row.featureKey;
    dto.featureType = row.featureType;
    dto.mode = row.mode;
    dto.limit = row.limit;
    dto.sortOrder = row.sortOrder;
    dto.description = row.description;
    dto.version = row.version;
    return dto;
  }
}

export class PlanFeatureListResponseDto {
  @ApiProperty({ type: [PlanFeatureResponseDto] })
  public items!: PlanFeatureResponseDto[];
}

// Re-export to make FEATURE_LIMIT_MAX visible for any downstream typed-arg
// consumers (the FE codegen pipeline reads dto.ts as the single source).
export { FEATURE_LIMIT_MAX };
