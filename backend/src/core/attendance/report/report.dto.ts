/**
 * DTOs for `/attendance/reports/*` endpoints. Read-only — no writes.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

import {
  ATTENDANCE_STATUS_VALUES,
  type AttendanceStatusValue,
} from '../attendance.constants';

export class ClassReportQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly date!: string;
}

export class StudentReportQueryDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dateFrom!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dateTo!: string;
}

export class StaffReportQueryDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dateFrom!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dateTo!: string;
}

export class MonthlyReportQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  /** YYYY-MM */
  @ApiProperty({ example: '2026-06' })
  @IsDateString()
  public readonly month!: string;
}

export class AnalyticsReportQueryDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dateFrom!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dateTo!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;
}

export class StatusCountDto {
  @ApiProperty({ enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  public readonly status!: AttendanceStatusValue;

  @ApiProperty() public readonly count!: number;
}

export class ClassReportResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly sectionId!: string;
  @ApiProperty({ format: 'date' }) public readonly date!: string;
  @ApiProperty() public readonly total!: number;
  @ApiProperty({ type: () => [StatusCountDto] })
  public readonly byStatus!: readonly StatusCountDto[];
}

export class StudentReportResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly studentId!: string;
  @ApiProperty({ format: 'date' }) public readonly dateFrom!: string;
  @ApiProperty({ format: 'date' }) public readonly dateTo!: string;
  @ApiProperty() public readonly total!: number;
  @ApiProperty({ type: () => [StatusCountDto] })
  public readonly byStatus!: readonly StatusCountDto[];
}

export class StaffReportResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty({ format: 'date' }) public readonly dateFrom!: string;
  @ApiProperty({ format: 'date' }) public readonly dateTo!: string;
  @ApiProperty() public readonly total!: number;
  @ApiProperty({ type: () => [StatusCountDto] })
  public readonly byStatus!: readonly StatusCountDto[];
}

export class MonthlyReportCellDto {
  @ApiProperty({ format: 'uuid' }) public readonly studentId!: string;
  @ApiProperty({ format: 'date' }) public readonly date!: string;
  @ApiProperty({ enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  public readonly status!: AttendanceStatusValue;
}

export class MonthlyReportResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly sectionId!: string;
  @ApiProperty() public readonly month!: string;
  @ApiProperty({ type: () => [MonthlyReportCellDto] })
  public readonly cells!: readonly MonthlyReportCellDto[];
}

export class AnalyticsReportResponseDto {
  @ApiProperty({ format: 'date' }) public readonly dateFrom!: string;
  @ApiProperty({ format: 'date' }) public readonly dateTo!: string;
  @ApiProperty() public readonly total!: number;
  @ApiProperty({ type: () => [StatusCountDto] })
  public readonly byStatus!: readonly StatusCountDto[];
}
