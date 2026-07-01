/**
 * TeacherAvailabilityController — `/timetable/availability` routes.
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
  CreateTeacherAvailabilityDto,
  TeacherAvailabilityListQueryDto,
  TeacherAvailabilityListResponseDto,
  TeacherAvailabilityResponseDto,
  UpdateTeacherAvailabilityDto,
} from './availability.dto';
import { TeacherAvailabilityService } from './availability.service';

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller({ path: 'timetable/availability', version: '1' })
export class TeacherAvailabilityController {
  constructor(private readonly service: TeacherAvailabilityService) {}

  @Get()
  @RequirePermissions(TimetablePermissions.AVAILABILITY_READ)
  @ApiOperation({ summary: 'List teacher availability rows.' })
  @ApiOkResponse({ type: TeacherAvailabilityListResponseDto })
  public async list(
    @Query() query: TeacherAvailabilityListQueryDto,
  ): Promise<TeacherAvailabilityListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.staffId !== undefined ? { staffId: query.staffId } : {}),
      ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
      ...(query.dayOfWeek !== undefined ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
    });
    return {
      items: items.map(TeacherAvailabilityResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(TimetablePermissions.AVAILABILITY_READ)
  @ApiOperation({ summary: 'Get a teacher availability row by id.' })
  @ApiOkResponse({ type: TeacherAvailabilityResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TeacherAvailabilityResponseDto> {
    return TeacherAvailabilityResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(TimetablePermissions.AVAILABILITY_CREATE)
  @ApiOperation({ summary: 'Declare a teacher availability/unavailability window.' })
  @ApiCreatedResponse({ type: TeacherAvailabilityResponseDto })
  public async create(
    @Body() body: CreateTeacherAvailabilityDto,
  ): Promise<TeacherAvailabilityResponseDto> {
    const row = await this.service.create({
      staffId: body.staffId,
      academicYearId: body.academicYearId,
      kind: body.kind,
      dayOfWeek: body.dayOfWeek,
      ...(body.periodIndex !== undefined ? { periodIndex: body.periodIndex } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      effectiveFrom: new Date(body.effectiveFrom),
      ...(body.effectiveTo !== undefined && body.effectiveTo !== null
        ? { effectiveTo: new Date(body.effectiveTo) }
        : body.effectiveTo === null
          ? { effectiveTo: null }
          : {}),
    });
    return TeacherAvailabilityResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(TimetablePermissions.AVAILABILITY_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a teacher availability row.' })
  @ApiOkResponse({ type: TeacherAvailabilityResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTeacherAvailabilityDto,
  ): Promise<TeacherAvailabilityResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.dayOfWeek !== undefined ? { dayOfWeek: body.dayOfWeek } : {}),
      ...(body.periodIndex !== undefined ? { periodIndex: body.periodIndex } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      ...(body.effectiveFrom !== undefined
        ? { effectiveFrom: new Date(body.effectiveFrom) }
        : {}),
      ...(body.effectiveTo !== undefined
        ? { effectiveTo: body.effectiveTo === null ? null : new Date(body.effectiveTo) }
        : {}),
    });
    return TeacherAvailabilityResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(TimetablePermissions.AVAILABILITY_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a teacher availability row.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}
