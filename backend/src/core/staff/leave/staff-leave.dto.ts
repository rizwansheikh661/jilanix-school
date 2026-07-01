/**
 * DTOs for the StaffLeave sub-resource.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  LEAVE_STATUS_VALUES,
  LEAVE_TYPE_VALUES,
  type LeaveStatusValue,
  type LeaveTypeValue,
  type StaffLeaveRow,
} from '../staff.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStaffLeaveDto {
  @ApiProperty({ enum: LEAVE_TYPE_VALUES as unknown as string[] })
  @IsEnum(LEAVE_TYPE_VALUES as unknown as object)
  public readonly leaveType!: LeaveTypeValue;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly startDate!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly endDate!: string;

  @ApiProperty({ minimum: 0.5, maximum: 366 })
  @Type(() => Number) @IsNumber() @Min(0.5) @Max(366)
  public readonly days!: number;

  @ApiProperty({ maxLength: 500 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500)
  public readonly reason!: string;
}

export class UpdateStaffLeaveDto {
  @ApiPropertyOptional({ enum: LEAVE_TYPE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(LEAVE_TYPE_VALUES as unknown as object)
  public readonly leaveType?: LeaveTypeValue;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly startDate?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly endDate?: string;
  @ApiPropertyOptional({ minimum: 0.5, maximum: 366 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(366)
  public readonly days?: number;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500)
  public readonly reason?: string;
}

export class LeaveDecisionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  public readonly note?: string;
}

export class StaffLeaveResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty({ enum: LEAVE_TYPE_VALUES as unknown as string[] })
  public readonly leaveType!: LeaveTypeValue;
  @ApiProperty({ format: 'date' }) public readonly startDate!: string;
  @ApiProperty({ format: 'date' }) public readonly endDate!: string;
  @ApiProperty() public readonly days!: number;
  @ApiProperty() public readonly reason!: string;
  @ApiProperty({ enum: LEAVE_STATUS_VALUES as unknown as string[] })
  public readonly status!: LeaveStatusValue;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly decidedBy!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' }) public readonly decidedAt!: string | null;
  @ApiProperty({ nullable: true }) public readonly decisionNote!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly updatedBy!: string | null;

  public static from(row: StaffLeaveRow): StaffLeaveResponseDto {
    return {
      id: row.id,
      staffId: row.staffId,
      leaveType: row.leaveType,
      startDate: toIsoDate(row.startDate),
      endDate: toIsoDate(row.endDate),
      days: row.days,
      reason: row.reason,
      status: row.status,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString(),
      decisionNote: row.decisionNote,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class StaffLeaveListResponseDto {
  @ApiProperty({ type: [StaffLeaveResponseDto] })
  public readonly items!: readonly StaffLeaveResponseDto[];
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
