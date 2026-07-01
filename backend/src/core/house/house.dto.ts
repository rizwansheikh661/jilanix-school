import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import type { HouseAssignmentRow, HouseRow } from './house.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const CODE_PATTERN = /^[A-Z0-9_-]{1,20}$/;
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// ---------- House ----------

export class CreateHouseDto {
  @ApiProperty({ pattern: CODE_PATTERN.source, maxLength: 20 })
  @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(20)
  public readonly code!: string;

  @ApiProperty({ maxLength: 60 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(60)
  public readonly name!: string;

  @ApiProperty({ pattern: HEX_PATTERN.source, example: '#FF0000' })
  @Transform(trim) @IsString() @Matches(HEX_PATTERN)
  public readonly colorHex!: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly motto?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly captainStudentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly viceCaptainStudentId?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(1000)
  public readonly photoUrl?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt() @Min(0)
  public readonly sortOrder?: number;
}

export class UpdateHouseDto {
  @ApiPropertyOptional({ pattern: CODE_PATTERN.source, maxLength: 20 })
  @IsOptional() @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(20)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(60)
  public readonly name?: string;

  @ApiPropertyOptional({ pattern: HEX_PATTERN.source })
  @IsOptional() @Transform(trim) @IsString() @Matches(HEX_PATTERN)
  public readonly colorHex?: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly motto?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly captainStudentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly viceCaptainStudentId?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(1000)
  public readonly photoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  public readonly sortOrder?: number;
}

export class HouseResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly colorHex!: string;
  @ApiProperty({ nullable: true }) public readonly motto!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly captainStudentId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly viceCaptainStudentId!: string | null;
  @ApiProperty({ nullable: true }) public readonly photoUrl!: string | null;
  @ApiProperty() public readonly sortOrder!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: HouseRow): HouseResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      colorHex: row.colorHex,
      motto: row.motto,
      captainStudentId: row.captainStudentId,
      viceCaptainStudentId: row.viceCaptainStudentId,
      photoUrl: row.photoUrl,
      sortOrder: row.sortOrder,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class HouseListResponseDto {
  @ApiProperty({ type: [HouseResponseDto] })
  public readonly items!: readonly HouseResponseDto[];
}

// ---------- HouseAssignment ----------

export class CreateHouseAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly studentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly houseId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly assignedOn!: Date;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly reason?: string | null;
}

export class HouseAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly studentId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly houseId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly academicYearId!: string;
  @ApiProperty({ format: 'date-time' }) public readonly assignedOn!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) public readonly endedOn!: string | null;
  @ApiProperty({ nullable: true }) public readonly reason!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: HouseAssignmentRow): HouseAssignmentResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      houseId: row.houseId,
      academicYearId: row.academicYearId,
      assignedOn: row.assignedOn.toISOString(),
      endedOn: row.endedOn === null ? null : row.endedOn.toISOString(),
      reason: row.reason,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class HouseAssignmentListResponseDto {
  @ApiProperty({ type: [HouseAssignmentResponseDto] })
  public readonly items!: readonly HouseAssignmentResponseDto[];
}
