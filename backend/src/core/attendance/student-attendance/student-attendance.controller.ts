/**
 * StudentAttendanceController — `/api/v1/attendance` routes.
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
  AttendanceListQueryDto,
  AttendanceListResponseDto,
  AttendanceResponseDto,
  BulkAttendanceDto,
  BulkAttendanceResponseDto,
  MarkAttendanceDto,
  UpdateAttendanceDto,
} from './student-attendance.dto';
import { StudentAttendanceService } from './student-attendance.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'attendance', version: '1' })
export class StudentAttendanceController {
  constructor(private readonly service: StudentAttendanceService) {}

  @Get()
  @RequirePermissions(AttendancePermissions.READ)
  @ApiOperation({ summary: 'List student attendance entries with filters.' })
  @ApiOkResponse({ type: AttendanceListResponseDto })
  public async list(
    @Query() query: AttendanceListQueryDto,
  ): Promise<AttendanceListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
      ...(query.dateFrom !== undefined ? { dateFrom: new Date(query.dateFrom) } : {}),
      ...(query.dateTo !== undefined ? { dateTo: new Date(query.dateTo) } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: result.items.map(AttendanceResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AttendancePermissions.MARK)
  @ApiOperation({ summary: 'Mark daily attendance for one student.' })
  @ApiCreatedResponse({ type: AttendanceResponseDto })
  @ApiConflictResponse({ description: 'duplicate / holiday / lock' })
  public async mark(@Body() body: MarkAttendanceDto): Promise<AttendanceResponseDto> {
    const row = await this.service.mark({
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      academicYearId: body.academicYearId,
      sectionId: body.sectionId,
      studentId: body.studentId,
      date: new Date(body.date),
      status: body.status,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.checkInTime !== undefined ? { checkInTime: new Date(body.checkInTime) } : {}),
      ...(body.checkOutTime !== undefined ? { checkOutTime: new Date(body.checkOutTime) } : {}),
      ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
    });
    return AttendanceResponseDto.from(row);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.MULTI_STATUS)
  @RequirePermissions(AttendancePermissions.BULK)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary:
      'Bulk-mark a section for a date. 1000 entries max. Per-row results returned; 207 on partial success.',
  })
  @ApiCreatedResponse({ type: BulkAttendanceResponseDto })
  public async bulk(@Body() body: BulkAttendanceDto): Promise<BulkAttendanceResponseDto> {
    const result = await this.service.bulkMark({
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      academicYearId: body.academicYearId,
      sectionId: body.sectionId,
      date: new Date(body.date),
      ...(body.defaultStatus !== undefined ? { defaultStatus: body.defaultStatus } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      entries: body.entries.map((e) => ({
        studentId: e.studentId,
        ...(e.status !== undefined ? { status: e.status } : {}),
        ...(e.remarks !== undefined ? { remarks: e.remarks } : {}),
      })),
    });
    return {
      created: result.created,
      failed: result.failed,
      results: result.results.map((r) => ({
        studentId: r.studentId,
        id: r.id,
        status: r.status,
        error: r.error,
      })),
    };
  }

  @Get(':id')
  @RequirePermissions(AttendancePermissions.READ)
  @ApiOperation({ summary: 'Get a student attendance entry by id.' })
  @ApiOkResponse({ type: AttendanceResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendanceResponseDto> {
    return AttendanceResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AttendancePermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Edit a student attendance entry (in-window only).' })
  @ApiOkResponse({ type: AttendanceResponseDto })
  @ApiConflictResponse({ description: 'edit window expired or lock' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAttendanceDto,
  ): Promise<AttendanceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.checkInTime !== undefined ? { checkInTime: new Date(body.checkInTime) } : {}),
      ...(body.checkOutTime !== undefined ? { checkOutTime: new Date(body.checkOutTime) } : {}),
      ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
    });
    return AttendanceResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AttendancePermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a student attendance entry (in-window only).' })
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
