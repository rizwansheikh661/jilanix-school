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
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ROOM_STATUS_VALUES, type RoomStatusValue } from './room.constants';
import type { RoomRow, RoomTypeRow } from './room.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const toInt = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
};

const CODE_PATTERN = /^[A-Z0-9_-]{1,40}$/;

// ---------- RoomType ----------

export class CreateRoomTypeDto {
  @ApiProperty({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80)
  public readonly name!: string;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(toInt) @IsInt() @Min(1)
  public readonly defaultCapacity?: number | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly allowsExam?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly allowsTimetable?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class UpdateRoomTypeDto {
  @ApiPropertyOptional({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80)
  public readonly name?: string;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(toInt) @IsInt() @Min(1)
  public readonly defaultCapacity?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly allowsExam?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly allowsTimetable?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class RoomTypeResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ nullable: true }) public readonly defaultCapacity!: number | null;
  @ApiProperty() public readonly allowsExam!: boolean;
  @ApiProperty() public readonly allowsTimetable!: boolean;
  @ApiProperty({ nullable: true }) public readonly description!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: RoomTypeRow): RoomTypeResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      defaultCapacity: row.defaultCapacity,
      allowsExam: row.allowsExam,
      allowsTimetable: row.allowsTimetable,
      description: row.description,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class RoomTypeListResponseDto {
  @ApiProperty({ type: [RoomTypeResponseDto] })
  public readonly items!: readonly RoomTypeResponseDto[];
}

// ---------- Room ----------

export class CreateRoomDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly branchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly roomTypeId!: string;

  @ApiProperty({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code!: string;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ minimum: 1 })
  @Transform(toInt) @IsInt() @Min(1)
  public readonly capacity!: number;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(20)
  public readonly floor?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(40)
  public readonly block?: string | null;

  @ApiPropertyOptional({ enum: ROOM_STATUS_VALUES, default: 'ACTIVE' })
  @IsOptional() @IsEnum(ROOM_STATUS_VALUES as unknown as object)
  public readonly status?: RoomStatusValue;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class UpdateRoomDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly roomTypeId?: string;

  @ApiPropertyOptional({ pattern: CODE_PATTERN.source, maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @Matches(CODE_PATTERN) @MaxLength(40)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional() @Transform(toInt) @IsInt() @Min(1)
  public readonly capacity?: number;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(20)
  public readonly floor?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(40)
  public readonly block?: string | null;

  @ApiPropertyOptional({ enum: ROOM_STATUS_VALUES })
  @IsOptional() @IsEnum(ROOM_STATUS_VALUES as unknown as object)
  public readonly status?: RoomStatusValue;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class RoomListQueryDto {
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @IsOptional() @IsUUID()
  public readonly roomTypeId?: string;

  @IsOptional() @IsEnum(ROOM_STATUS_VALUES as unknown as object)
  public readonly status?: RoomStatusValue;
}

export class RoomResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly branchId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly roomTypeId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly capacity!: number;
  @ApiProperty({ nullable: true }) public readonly floor!: string | null;
  @ApiProperty({ nullable: true }) public readonly block!: string | null;
  @ApiProperty({ enum: ROOM_STATUS_VALUES }) public readonly status!: RoomStatusValue;
  @ApiProperty({ nullable: true }) public readonly notes!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: RoomRow): RoomResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      roomTypeId: row.roomTypeId,
      code: row.code,
      name: row.name,
      capacity: row.capacity,
      floor: row.floor,
      block: row.block,
      status: row.status,
      notes: row.notes,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class RoomListResponseDto {
  @ApiProperty({ type: [RoomResponseDto] })
  public readonly items!: readonly RoomResponseDto[];
}
