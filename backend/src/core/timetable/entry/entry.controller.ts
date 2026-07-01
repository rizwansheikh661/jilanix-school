/**
 * TimetableEntryController — `/timetable/entries` routes.
 *
 * Bulk endpoint returns HTTP 207 (Multi-Status) so partial failure is
 * a normal response, not an exception.
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
import { TimetablePermissions } from '../timetable.constants';
import {
  BulkTimetableEntryDto,
  BulkTimetableEntryResponseDto,
  CreateTimetableEntryDto,
  TimetableEntryListQueryDto,
  TimetableEntryListResponseDto,
  TimetableEntryResponseDto,
  UpdateTimetableEntryDto,
} from './entry.dto';
import { TimetableEntryService } from './entry.service';

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller({ path: 'timetable/entries', version: '1' })
export class TimetableEntryController {
  constructor(private readonly service: TimetableEntryService) {}

  @Get()
  @RequirePermissions(TimetablePermissions.ENTRY_READ)
  @ApiOperation({ summary: 'List timetable entries.' })
  @ApiOkResponse({ type: TimetableEntryListResponseDto })
  public async list(
    @Query() query: TimetableEntryListQueryDto,
  ): Promise<TimetableEntryListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.timetableVersionId !== undefined
        ? { timetableVersionId: query.timetableVersionId }
        : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.staffId !== undefined ? { staffId: query.staffId } : {}),
      ...(query.roomId !== undefined ? { roomId: query.roomId } : {}),
      ...(query.dayOfWeek !== undefined ? { dayOfWeek: query.dayOfWeek } : {}),
    });
    return {
      items: items.map(TimetableEntryResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(TimetablePermissions.ENTRY_READ)
  @ApiOperation({ summary: 'Get a timetable entry by id.' })
  @ApiOkResponse({ type: TimetableEntryResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TimetableEntryResponseDto> {
    return TimetableEntryResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(TimetablePermissions.ENTRY_CREATE)
  @ApiOperation({ summary: 'Create a single timetable entry on a DRAFT version.' })
  @ApiCreatedResponse({ type: TimetableEntryResponseDto })
  public async create(
    @Body() body: CreateTimetableEntryDto,
  ): Promise<TimetableEntryResponseDto> {
    const row = await this.service.create({
      timetableVersionId: body.timetableVersionId,
      sectionId: body.sectionId,
      subjectId: body.subjectId,
      staffId: body.staffId,
      ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
      dayOfWeek: body.dayOfWeek,
      periodIndex: body.periodIndex,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    return TimetableEntryResponseDto.from(row);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.MULTI_STATUS)
  @RequirePermissions(TimetablePermissions.ENTRY_BULK)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary:
      'Bulk-create timetable entries. Max 500 per request. Per-row results returned; 207 on partial success.',
  })
  @ApiCreatedResponse({ type: BulkTimetableEntryResponseDto })
  public async bulk(
    @Body() body: BulkTimetableEntryDto,
  ): Promise<BulkTimetableEntryResponseDto> {
    const result = await this.service.bulkCreate({
      timetableVersionId: body.timetableVersionId,
      entries: body.entries.map((e) => ({
        sectionId: e.sectionId,
        subjectId: e.subjectId,
        staffId: e.staffId,
        ...(e.roomId !== undefined ? { roomId: e.roomId } : {}),
        dayOfWeek: e.dayOfWeek,
        periodIndex: e.periodIndex,
        ...(e.notes !== undefined ? { notes: e.notes } : {}),
      })),
    });
    return {
      created: result.created,
      failed: result.failed,
      results: result.results.map((r) => ({
        index: r.index,
        sectionId: r.sectionId,
        dayOfWeek: r.dayOfWeek,
        periodIndex: r.periodIndex,
        id: r.id,
        error: r.error,
      })),
    };
  }

  @Patch(':id')
  @RequirePermissions(TimetablePermissions.ENTRY_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a timetable entry on a DRAFT version.' })
  @ApiOkResponse({ type: TimetableEntryResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTimetableEntryDto,
  ): Promise<TimetableEntryResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.subjectId !== undefined ? { subjectId: body.subjectId } : {}),
      ...(body.staffId !== undefined ? { staffId: body.staffId } : {}),
      ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
      ...(body.dayOfWeek !== undefined ? { dayOfWeek: body.dayOfWeek } : {}),
      ...(body.periodIndex !== undefined ? { periodIndex: body.periodIndex } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    return TimetableEntryResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(TimetablePermissions.ENTRY_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a timetable entry on a DRAFT version.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}
