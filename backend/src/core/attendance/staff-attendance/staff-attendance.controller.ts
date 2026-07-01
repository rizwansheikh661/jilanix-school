/**
 * StaffAttendanceController — `/api/v1/staff-attendance` routes.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AttendancePermissions } from '../attendance.constants';
import {
  BulkStaffAttendanceDto,
  BulkStaffAttendanceResponseDto,
  MarkStaffAttendanceDto,
  StaffAttendanceListQueryDto,
  StaffAttendanceListResponseDto,
  StaffAttendanceResponseDto,
  UpdateStaffAttendanceDto,
} from './staff-attendance.dto';
import { StaffAttendanceService } from './staff-attendance.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'staff-attendance', version: '1' })
export class StaffAttendanceController {
  constructor(private readonly service: StaffAttendanceService) {}

  @Get()
  @RequirePermissions(AttendancePermissions.STAFF_READ)
  @ApiOperation({ summary: 'List staff attendance entries with filters.' })
  @ApiOkResponse({ type: StaffAttendanceListResponseDto })
  public async list(
    @Query() query: StaffAttendanceListQueryDto,
  ): Promise<StaffAttendanceListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.staffId !== undefined ? { staffId: query.staffId } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.dateFrom !== undefined ? { dateFrom: new Date(query.dateFrom) } : {}),
      ...(query.dateTo !== undefined ? { dateTo: new Date(query.dateTo) } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: result.items.map(StaffAttendanceResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AttendancePermissions.STAFF_MARK)
  @ApiOperation({ summary: 'Mark daily attendance for one staff member.' })
  @ApiCreatedResponse({ type: StaffAttendanceResponseDto })
  @ApiConflictResponse({ description: 'duplicate / lock' })
  public async mark(@Body() body: MarkStaffAttendanceDto): Promise<StaffAttendanceResponseDto> {
    const row = await this.service.mark({
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      staffId: body.staffId,
      date: new Date(body.date),
      status: body.status,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.checkInTime !== undefined ? { checkInTime: new Date(body.checkInTime) } : {}),
      ...(body.checkOutTime !== undefined ? { checkOutTime: new Date(body.checkOutTime) } : {}),
      ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
    });
    return StaffAttendanceResponseDto.from(row);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.MULTI_STATUS)
  @RequirePermissions(AttendancePermissions.STAFF_BULK)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Bulk-mark staff attendance for a date.' })
  @ApiCreatedResponse({ type: BulkStaffAttendanceResponseDto })
  public async bulk(@Body() body: BulkStaffAttendanceDto): Promise<BulkStaffAttendanceResponseDto> {
    const result = await this.service.bulkMark({
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      date: new Date(body.date),
      ...(body.defaultStatus !== undefined ? { defaultStatus: body.defaultStatus } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      entries: body.entries.map((e) => ({
        staffId: e.staffId,
        ...(e.status !== undefined ? { status: e.status } : {}),
        ...(e.remarks !== undefined ? { remarks: e.remarks } : {}),
      })),
    });
    return {
      created: result.created,
      failed: result.failed,
      results: result.results.map((r) => ({
        staffId: r.staffId,
        id: r.id,
        status: r.status,
        error: r.error,
      })),
    };
  }

  @Get(':id')
  @RequirePermissions(AttendancePermissions.STAFF_READ)
  @ApiOperation({ summary: 'Get a staff attendance entry by id.' })
  @ApiOkResponse({ type: StaffAttendanceResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StaffAttendanceResponseDto> {
    return StaffAttendanceResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AttendancePermissions.STAFF_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Edit a staff attendance entry (in-window only).' })
  @ApiOkResponse({ type: StaffAttendanceResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateStaffAttendanceDto,
  ): Promise<StaffAttendanceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.checkInTime !== undefined ? { checkInTime: new Date(body.checkInTime) } : {}),
      ...(body.checkOutTime !== undefined ? { checkOutTime: new Date(body.checkOutTime) } : {}),
      ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
    });
    return StaffAttendanceResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AttendancePermissions.STAFF_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a staff attendance entry (in-window only).' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
