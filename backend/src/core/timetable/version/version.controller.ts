/**
 * TimetableVersionController — `/timetable/versions` routes.
 *
 * Activate / archive are POST sub-resources so callers can scope
 * permissions independently from generic UPDATE.
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
  CreateTimetableVersionDto,
  TimetableVersionListQueryDto,
  TimetableVersionListResponseDto,
  TimetableVersionResponseDto,
  UpdateTimetableVersionDto,
} from './version.dto';
import { TimetableVersionService } from './version.service';

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller({ path: 'timetable/versions', version: '1' })
export class TimetableVersionController {
  constructor(private readonly service: TimetableVersionService) {}

  @Get()
  @RequirePermissions(TimetablePermissions.VERSION_READ)
  @ApiOperation({ summary: 'List timetable versions.' })
  @ApiOkResponse({ type: TimetableVersionListResponseDto })
  public async list(
    @Query() query: TimetableVersionListQueryDto,
  ): Promise<TimetableVersionListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: items.map(TimetableVersionResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(TimetablePermissions.VERSION_READ)
  @ApiOperation({ summary: 'Get a timetable version by id.' })
  @ApiOkResponse({ type: TimetableVersionResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TimetableVersionResponseDto> {
    return TimetableVersionResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(TimetablePermissions.VERSION_CREATE)
  @ApiOperation({ summary: 'Create a DRAFT timetable version.' })
  @ApiCreatedResponse({ type: TimetableVersionResponseDto })
  public async create(
    @Body() body: CreateTimetableVersionDto,
  ): Promise<TimetableVersionResponseDto> {
    const row = await this.service.create({
      branchId: body.branchId,
      academicYearId: body.academicYearId,
      periodTemplateId: body.periodTemplateId,
      name: body.name,
      effectiveFrom: new Date(body.effectiveFrom),
      ...(body.effectiveTo !== undefined && body.effectiveTo !== null
        ? { effectiveTo: new Date(body.effectiveTo) }
        : body.effectiveTo === null
          ? { effectiveTo: null }
          : {}),
    });
    return TimetableVersionResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(TimetablePermissions.VERSION_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update version metadata (name, date range).' })
  @ApiOkResponse({ type: TimetableVersionResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTimetableVersionDto,
  ): Promise<TimetableVersionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.effectiveFrom !== undefined
        ? { effectiveFrom: new Date(body.effectiveFrom) }
        : {}),
      ...(body.effectiveTo !== undefined
        ? { effectiveTo: body.effectiveTo === null ? null : new Date(body.effectiveTo) }
        : {}),
    });
    return TimetableVersionResponseDto.from(row);
  }

  @Post(':id/activate')
  @RequirePermissions(TimetablePermissions.VERSION_ACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Activate a DRAFT timetable version.' })
  @ApiOkResponse({ type: TimetableVersionResponseDto })
  public async activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<TimetableVersionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return TimetableVersionResponseDto.from(await this.service.activate(id, expectedVersion));
  }

  @Post(':id/archive')
  @RequirePermissions(TimetablePermissions.VERSION_ARCHIVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Archive an ACTIVE timetable version.' })
  @ApiOkResponse({ type: TimetableVersionResponseDto })
  public async archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<TimetableVersionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return TimetableVersionResponseDto.from(await this.service.archive(id, expectedVersion));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(TimetablePermissions.VERSION_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a non-ACTIVE timetable version.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}
