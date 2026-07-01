/**
 * AttendanceCorrectionController — `/api/v1/attendance-corrections` routes.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AttendancePermissions } from '../attendance.constants';
import {
  CorrectionListQueryDto,
  CorrectionListResponseDto,
  CorrectionResponseDto,
  CreateCorrectionDto,
  DecideCorrectionDto,
} from './correction.dto';
import { AttendanceCorrectionService } from './correction.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'attendance-corrections', version: '1' })
export class AttendanceCorrectionController {
  constructor(private readonly service: AttendanceCorrectionService) {}

  @Get()
  @RequirePermissions(AttendancePermissions.CORRECTION_READ)
  @ApiOperation({ summary: 'List attendance correction requests.' })
  @ApiOkResponse({ type: CorrectionListResponseDto })
  public async list(
    @Query() query: CorrectionListQueryDto,
  ): Promise<CorrectionListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.attendanceDailyId !== undefined
        ? { attendanceDailyId: query.attendanceDailyId }
        : {}),
    });
    return {
      items: result.items.map(CorrectionResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AttendancePermissions.CORRECTION_CREATE)
  @ApiOperation({ summary: 'Request a correction to an existing attendance entry.' })
  @ApiCreatedResponse({ type: CorrectionResponseDto })
  public async create(@Body() body: CreateCorrectionDto): Promise<CorrectionResponseDto> {
    const row = await this.service.create({
      attendanceDailyId: body.attendanceDailyId,
      newStatus: body.newStatus,
      reason: body.reason,
      ...(body.supportingFileId !== undefined ? { supportingFileId: body.supportingFileId } : {}),
    });
    return CorrectionResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(AttendancePermissions.CORRECTION_READ)
  @ApiOperation({ summary: 'Get a correction request by id.' })
  @ApiOkResponse({ type: CorrectionResponseDto })
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CorrectionResponseDto> {
    return CorrectionResponseDto.from(await this.service.getById(id));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AttendancePermissions.CORRECTION_APPROVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Approve a pending correction; applies the new status.' })
  @ApiOkResponse({ type: CorrectionResponseDto })
  public async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DecideCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.approve(id, expectedVersion, body.decisionReason ?? null);
    return CorrectionResponseDto.from(row);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AttendancePermissions.CORRECTION_REJECT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reject a pending correction; closes the request.' })
  @ApiOkResponse({ type: CorrectionResponseDto })
  public async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DecideCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.reject(id, expectedVersion, body.decisionReason ?? null);
    return CorrectionResponseDto.from(row);
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
