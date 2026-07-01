import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  DEPARTMENT_TYPE_VALUES,
  type DepartmentRow,
  type DepartmentTypeValue,
  type DesignationRow,
} from './organization.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const CODE_PATTERN = /^[A-Z0-9_-]{1,40}$/;

// ---------- Department ----------

export class CreateDepartmentDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly parentDepartmentId?: string | null;

  @ApiProperty({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code!: string;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ enum: DEPARTMENT_TYPE_VALUES })
  @IsEnum(DEPARTMENT_TYPE_VALUES as unknown as object)
  public readonly type!: DepartmentTypeValue;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly headStaffId?: string | null;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly parentDepartmentId?: string | null;

  @ApiPropertyOptional({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ enum: DEPARTMENT_TYPE_VALUES })
  @IsOptional() @IsEnum(DEPARTMENT_TYPE_VALUES as unknown as object)
  public readonly type?: DepartmentTypeValue;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly headStaffId?: string | null;
}

export class DepartmentListQueryDto {
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @IsOptional() @IsEnum(DEPARTMENT_TYPE_VALUES as unknown as object)
  public readonly type?: DepartmentTypeValue;
}

export class DepartmentResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly branchId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly parentDepartmentId!: string | null;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: DEPARTMENT_TYPE_VALUES }) public readonly type!: DepartmentTypeValue;
  @ApiProperty({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly headStaffId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: DepartmentRow): DepartmentResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      parentDepartmentId: row.parentDepartmentId,
      code: row.code,
      name: row.name,
      type: row.type,
      description: row.description,
      headStaffId: row.headStaffId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class DepartmentListResponseDto {
  @ApiProperty({ type: [DepartmentResponseDto] })
  public readonly items!: readonly DepartmentResponseDto[];
}

// ---------- Designation ----------

export class CreateDesignationDto {
  @ApiProperty({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code!: string;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt() @Min(1) @Max(100)
  public readonly rank!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isTeaching?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isManagement?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly reportsToDesignationId?: string | null;
}

export class UpdateDesignationDto {
  @ApiPropertyOptional({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @IsInt() @Min(1) @Max(100)
  public readonly rank?: number;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isTeaching?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isManagement?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly reportsToDesignationId?: string | null;
}

export class DesignationListQueryDto {
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isTeaching?: boolean;

  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isManagement?: boolean;
}

export class DesignationResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly rank!: number;
  @ApiProperty() public readonly isTeaching!: boolean;
  @ApiProperty() public readonly isManagement!: boolean;
  @ApiProperty({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly reportsToDesignationId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: DesignationRow): DesignationResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      rank: row.rank,
      isTeaching: row.isTeaching,
      isManagement: row.isManagement,
      description: row.description,
      reportsToDesignationId: row.reportsToDesignationId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class DesignationListResponseDto {
  @ApiProperty({ type: [DesignationResponseDto] })
  public readonly items!: readonly DesignationResponseDto[];
}
