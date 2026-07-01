/**
 * ReportScheduleController — `/report-schedules` CRUD + enable/disable.
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
import { ReportingPermissions } from '../reporting.constants';
import {
  CreateReportScheduleDto,
  ReportScheduleListQueryDto,
  ReportScheduleListResponseDto,
  ReportScheduleResponseDto,
  UpdateReportScheduleDto,
} from './report-schedule.dto';
import { ReportScheduleService } from './report-schedule.service';

@ApiTags('Report Schedules')
@ApiBearerAuth()
@Controller({ path: 'report-schedules', version: '1' })
export class ReportScheduleController {
  constructor(private readonly service: ReportScheduleService) {}

  @Get()
  @RequirePermissions(ReportingPermissions.REPORT_SCHEDULE_READ)
  @ApiOperation({ summary: 'List report schedules (cursor paginated).' })
  @ApiOkResponse({ type: ReportScheduleListResponseDto })
  public async list(
    @Query() query: ReportScheduleListQueryDto,
  ): Promise<ReportScheduleListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.reportKind !== undefined
        ? { reportKind: query.reportKind }
        : {}),
      ...(query.isEnabled !== undefined ? { isEnabled: query.isEnabled } : {}),
      ...(query.ownedByUserId !== undefined
        ? { ownedByUserId: query.ownedByUserId }
        : {}),
    });
    return {
      items: items.map(ReportScheduleResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(ReportingPermissions.REPORT_SCHEDULE_CREATE)
  @ApiOperation({ summary: 'Create a new report schedule.' })
  @ApiCreatedResponse({ type: ReportScheduleResponseDto })
  public async create(
    @Body() body: CreateReportScheduleDto,
  ): Promise<ReportScheduleResponseDto> {
    const row = await this.service.create({
      name: body.name,
      reportKind: body.reportKind,
      format: body.format,
      frequency: body.frequency,
      cron: body.cron,
      params: body.params,
      recipients: body.recipients,
    });
    return ReportScheduleResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(ReportingPermissions.REPORT_SCHEDULE_READ)
  @ApiOperation({ summary: 'Get a single report schedule.' })
  @ApiOkResponse({ type: ReportScheduleResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReportScheduleResponseDto> {
    return ReportScheduleResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(ReportingPermissions.REPORT_SCHEDULE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a report schedule.' })
  @ApiOkResponse({ type: ReportScheduleResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateReportScheduleDto,
  ): Promise<ReportScheduleResponseDto> {
    return ReportScheduleResponseDto.from(
      await this.service.update(id, parseIfMatch(ifMatch), {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.reportKind !== undefined
          ? { reportKind: body.reportKind }
          : {}),
        ...(body.format !== undefined ? { format: body.format } : {}),
        ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
        ...(body.cron !== undefined ? { cron: body.cron } : {}),
        ...(body.params !== undefined ? { params: body.params } : {}),
        ...(body.recipients !== undefined
          ? { recipients: body.recipients }
          : {}),
      }),
    );
  }

  @Post(':id/enable')
  @RequirePermissions(ReportingPermissions.REPORT_SCHEDULE_TOGGLE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Enable a report schedule.' })
  @ApiOkResponse({ type: ReportScheduleResponseDto })
  public async enable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ReportScheduleResponseDto> {
    return ReportScheduleResponseDto.from(
      await this.service.enable(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/disable')
  @RequirePermissions(ReportingPermissions.REPORT_SCHEDULE_TOGGLE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Disable a report schedule.' })
  @ApiOkResponse({ type: ReportScheduleResponseDto })
  public async disable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ReportScheduleResponseDto> {
    return ReportScheduleResponseDto.from(
      await this.service.disable(id, parseIfMatch(ifMatch)),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ReportingPermissions.REPORT_SCHEDULE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a report schedule.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }
}
