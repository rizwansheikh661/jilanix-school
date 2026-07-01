/**
 * AttendanceStatusHistoryController — read-only ledger view per
 * AttendanceDaily row. Append-only at the storage layer.
 */
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import {
  ATTENDANCE_HISTORY_CHANGE_TYPE_VALUES,
  ATTENDANCE_STATUS_VALUES,
  AttendancePermissions,
  type AttendanceHistoryChangeTypeValue,
  type AttendanceStatusValue,
} from '../attendance.constants';
import type { AttendanceStatusHistoryRow } from '../attendance.types';
import { AttendanceStatusHistoryService } from './status-history.service';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class StatusHistoryEntryDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly attendanceDailyId!: string;
  @ApiPropertyOptional({ nullable: true, enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  public readonly previousStatus!: AttendanceStatusValue | null;
  @ApiProperty({ enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  public readonly newStatus!: AttendanceStatusValue;
  @ApiProperty({ enum: ATTENDANCE_HISTORY_CHANGE_TYPE_VALUES as unknown as string[] })
  public readonly changeType!: AttendanceHistoryChangeTypeValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly changedBy!: string | null;
  @ApiProperty() public readonly changedAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly correctionId!: string | null;

  public static from(row: AttendanceStatusHistoryRow): StatusHistoryEntryDto {
    return {
      id: row.id,
      attendanceDailyId: row.attendanceDailyId,
      previousStatus: row.previousStatus,
      newStatus: row.newStatus,
      changeType: row.changeType,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
      reason: row.reason,
      correctionId: row.correctionId,
    };
  }
}

class StatusHistoryListResponseDto {
  @ApiProperty({ type: () => [StatusHistoryEntryDto] })
  public readonly items!: readonly StatusHistoryEntryDto[];
}

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'attendance', version: '1' })
export class AttendanceStatusHistoryController {
  constructor(private readonly service: AttendanceStatusHistoryService) {}

  @Get(':id/history')
  @RequirePermissions(AttendancePermissions.HISTORY_READ)
  @ApiOperation({ summary: 'Append-only status history for an attendance entry.' })
  @ApiOkResponse({ type: StatusHistoryListResponseDto })
  public async list(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StatusHistoryListResponseDto> {
    const rows = await this.service.listForAttendance(id);
    return { items: rows.map(StatusHistoryEntryDto.from) };
  }
}
