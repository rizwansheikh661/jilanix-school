/**
 * PeriodTemplateController — `/timetable/period-templates` routes.
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
  CreatePeriodTemplateDto,
  PeriodTemplateListQueryDto,
  PeriodTemplateListResponseDto,
  PeriodTemplateResponseDto,
  UpdatePeriodTemplateDto,
} from './period-template.dto';
import { PeriodTemplateService } from './period-template.service';

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller({ path: 'timetable/period-templates', version: '1' })
export class PeriodTemplateController {
  constructor(private readonly service: PeriodTemplateService) {}

  @Get()
  @RequirePermissions(TimetablePermissions.CONFIG_READ)
  @ApiOperation({ summary: 'List period templates (cursor paginated).' })
  @ApiOkResponse({ type: PeriodTemplateListResponseDto })
  public async list(
    @Query() query: PeriodTemplateListQueryDto,
  ): Promise<PeriodTemplateListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
      ...(query.isDefault !== undefined ? { isDefault: query.isDefault } : {}),
    });
    return {
      items: items.map(PeriodTemplateResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(TimetablePermissions.CONFIG_READ)
  @ApiOperation({ summary: 'Get a period template by id (with periods).' })
  @ApiOkResponse({ type: PeriodTemplateResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PeriodTemplateResponseDto> {
    return PeriodTemplateResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(TimetablePermissions.CONFIG_CREATE)
  @ApiOperation({ summary: 'Create a period template + its periods.' })
  @ApiCreatedResponse({ type: PeriodTemplateResponseDto })
  public async create(
    @Body() body: CreatePeriodTemplateDto,
  ): Promise<PeriodTemplateResponseDto> {
    const row = await this.service.create({
      branchId: body.branchId,
      academicYearId: body.academicYearId,
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
      days: body.days,
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      periods: body.periods,
    });
    return PeriodTemplateResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(TimetablePermissions.CONFIG_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Update period template metadata; supply `periods[]` to replace the period set.',
  })
  @ApiOkResponse({ type: PeriodTemplateResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePeriodTemplateDto,
  ): Promise<PeriodTemplateResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.days !== undefined ? { days: body.days } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      ...(body.periods !== undefined ? { periods: body.periods } : {}),
    });
    return PeriodTemplateResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(TimetablePermissions.CONFIG_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a period template (no active references).' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}
