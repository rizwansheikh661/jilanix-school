/**
 * AttendanceConfigController — `/attendance/config` routes.
 *   GET    /api/v1/attendance/config            — list all rows for tenant.
 *   GET    /api/v1/attendance/config?branchId=… — single row (null query =
 *                                                  school-wide row).
 *   PUT    /api/v1/attendance/config            — idempotent upsert
 *                                                  (branchId nullable in body).
 */
import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { AttendancePermissions } from '../attendance.constants';
import {
  AttendanceConfigListResponseDto,
  AttendanceConfigQueryDto,
  AttendanceConfigResponseDto,
  UpsertAttendanceConfigDto,
} from './config.dto';
import { AttendanceConfigService } from './config.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'attendance/config', version: '1' })
export class AttendanceConfigController {
  constructor(private readonly service: AttendanceConfigService) {}

  @Get()
  @RequirePermissions(AttendancePermissions.CONFIG_READ)
  @ApiOperation({
    summary:
      'List attendance config rows; pass ?branchId= to get a single row (omit for school-wide).',
  })
  @ApiOkResponse({ type: AttendanceConfigListResponseDto })
  public async list(
    @Query() query: AttendanceConfigQueryDto,
  ): Promise<AttendanceConfigListResponseDto> {
    if (query.branchId !== undefined) {
      const row = await this.service.getForBranch(query.branchId);
      return { items: row === null ? [] : [AttendanceConfigResponseDto.from(row)] };
    }
    const rows = await this.service.list();
    return { items: rows.map(AttendanceConfigResponseDto.from) };
  }

  @Put()
  @RequirePermissions(AttendancePermissions.CONFIG_UPDATE)
  @ApiOperation({
    summary:
      'Upsert attendance config for a branch (or school-wide when branchId is omitted).',
  })
  @ApiOkResponse({ type: AttendanceConfigResponseDto })
  public async upsert(
    @Body() body: UpsertAttendanceConfigDto,
  ): Promise<AttendanceConfigResponseDto> {
    const row = await this.service.upsert({
      branchId: body.branchId ?? null,
      ...(body.editWindowHours !== undefined ? { editWindowHours: body.editWindowHours } : {}),
      ...(body.lateThresholdMinutes !== undefined
        ? { lateThresholdMinutes: body.lateThresholdMinutes }
        : {}),
      ...(body.correctionsRequireApproval !== undefined
        ? { correctionsRequireApproval: body.correctionsRequireApproval }
        : {}),
      ...(body.allowedSources !== undefined ? { allowedSources: body.allowedSources } : {}),
      ...(body.holidayAutoMark !== undefined ? { holidayAutoMark: body.holidayAutoMark } : {}),
    });
    return AttendanceConfigResponseDto.from(row);
  }
}
