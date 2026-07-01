import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CONTACT_TYPE_VALUES, type ContactTypeValue, type SchoolContactRow } from '../school.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateSchoolContactDto {
  @ApiProperty({ enum: CONTACT_TYPE_VALUES })
  @IsEnum(CONTACT_TYPE_VALUES as unknown as object)
  public readonly contactType!: ContactTypeValue;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80)
  public readonly label!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(255)
  public readonly value!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isPrimary?: boolean;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  public readonly sortOrder?: number;
}

export class UpdateSchoolContactDto {
  @ApiPropertyOptional({ enum: CONTACT_TYPE_VALUES })
  @IsOptional() @IsEnum(CONTACT_TYPE_VALUES as unknown as object)
  public readonly contactType?: ContactTypeValue;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80)
  public readonly label?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(255)
  public readonly value?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isPrimary?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  public readonly sortOrder?: number;
}

export class SchoolContactResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ enum: CONTACT_TYPE_VALUES }) public readonly contactType!: ContactTypeValue;
  @ApiProperty() public readonly label!: string;
  @ApiProperty() public readonly value!: string;
  @ApiProperty() public readonly isPrimary!: boolean;
  @ApiProperty() public readonly sortOrder!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: SchoolContactRow): SchoolContactResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      contactType: row.contactType,
      label: row.label,
      value: row.value,
      isPrimary: row.isPrimary,
      sortOrder: row.sortOrder,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class SchoolContactListResponseDto {
  @ApiProperty({ type: [SchoolContactResponseDto] })
  public readonly items!: readonly SchoolContactResponseDto[];
}
