import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { BRANCH_STATUS_VALUES, type BranchRow, type BranchStatusValue } from '../branch.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const CODE_PATTERN = /^[A-Z0-9_-]{1,20}$/;

export class CreateBranchDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly parentBranchId?: string | null;

  @ApiProperty({ pattern: CODE_PATTERN.source, maxLength: 20 })
  @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(20)
  public readonly code!: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100)
  public readonly name!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isPrimary?: boolean;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly addressLine1?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly addressLine2?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(100)
  public readonly city?: string | null;

  @ApiPropertyOptional({ maxLength: 10, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(10)
  public readonly stateCode?: string | null;

  @ApiPropertyOptional({ maxLength: 10, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(10)
  public readonly pincode?: string | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(20)
  public readonly phone?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly email?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  public readonly establishedDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly managerStaffId?: string | null;
}

export class UpdateBranchDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly parentBranchId?: string | null;

  @ApiPropertyOptional({ pattern: CODE_PATTERN.source, maxLength: 20 })
  @IsOptional() @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(20)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly addressLine1?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly addressLine2?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(100)
  public readonly city?: string | null;

  @ApiPropertyOptional({ maxLength: 10, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(10)
  public readonly stateCode?: string | null;

  @ApiPropertyOptional({ maxLength: 10, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(10)
  public readonly pincode?: string | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(20)
  public readonly phone?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly email?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  public readonly establishedDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly managerStaffId?: string | null;
}

export class BranchListQueryDto {
  @IsOptional() @IsEnum(BRANCH_STATUS_VALUES as unknown as object)
  public readonly status?: BranchStatusValue;

  @IsOptional() @IsUUID()
  public readonly parentBranchId?: string;
}

export class BranchResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly parentBranchId!: string | null;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly isPrimary!: boolean;
  @ApiProperty({ enum: BRANCH_STATUS_VALUES }) public readonly status!: BranchStatusValue;
  @ApiProperty({ nullable: true }) public readonly addressLine1!: string | null;
  @ApiProperty({ nullable: true }) public readonly addressLine2!: string | null;
  @ApiProperty({ nullable: true }) public readonly city!: string | null;
  @ApiProperty({ nullable: true }) public readonly stateCode!: string | null;
  @ApiProperty({ nullable: true }) public readonly pincode!: string | null;
  @ApiProperty({ nullable: true }) public readonly phone!: string | null;
  @ApiProperty({ nullable: true }) public readonly email!: string | null;
  @ApiProperty({ format: 'date', nullable: true }) public readonly establishedDate!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly managerStaffId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: BranchRow): BranchResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      parentBranchId: row.parentBranchId,
      code: row.code,
      name: row.name,
      isPrimary: row.isPrimary,
      status: row.status,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      stateCode: row.stateCode,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      establishedDate: row.establishedDate === null ? null : row.establishedDate.toISOString().slice(0, 10),
      managerStaffId: row.managerStaffId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class BranchListResponseDto {
  @ApiProperty({ type: [BranchResponseDto] })
  public readonly items!: readonly BranchResponseDto[];
}
