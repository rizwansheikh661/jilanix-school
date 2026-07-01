/**
 * DashboardController — `/dashboards` and `/dashboards/:id/widgets` routes.
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
  CreateDashboardDto,
  CreateDashboardWidgetDto,
  DashboardListQueryDto,
  DashboardListResponseDto,
  DashboardResponseDto,
  DashboardWidgetListResponseDto,
  DashboardWidgetResponseDto,
  UpdateDashboardDto,
  UpdateDashboardWidgetDto,
} from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller({ path: 'dashboards', version: '1' })
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @RequirePermissions(ReportingPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'List dashboards (cursor paginated).' })
  @ApiOkResponse({ type: DashboardListResponseDto })
  public async list(
    @Query() query: DashboardListQueryDto,
  ): Promise<DashboardListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.ownedByUserId !== undefined
        ? { ownedByUserId: query.ownedByUserId }
        : {}),
      ...(query.isDefault !== undefined ? { isDefault: query.isDefault } : {}),
    });
    return {
      items: items.map(DashboardResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(ReportingPermissions.DASHBOARD_CREATE)
  @ApiOperation({ summary: 'Create a new dashboard.' })
  @ApiCreatedResponse({ type: DashboardResponseDto })
  public async create(
    @Body() body: CreateDashboardDto,
  ): Promise<DashboardResponseDto> {
    const row = await this.service.create({
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
    });
    return DashboardResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(ReportingPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Get a single dashboard.' })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DashboardResponseDto> {
    return DashboardResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(ReportingPermissions.DASHBOARD_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update dashboard metadata.' })
  @ApiOkResponse({ type: DashboardResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateDashboardDto,
  ): Promise<DashboardResponseDto> {
    return DashboardResponseDto.from(
      await this.service.update(id, parseIfMatch(ifMatch), {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ReportingPermissions.DASHBOARD_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a dashboard (cascades to widgets).' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }

  @Get(':id/widgets')
  @RequirePermissions(ReportingPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'List all widgets for a dashboard.' })
  @ApiOkResponse({ type: DashboardWidgetListResponseDto })
  public async listWidgets(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DashboardWidgetListResponseDto> {
    const widgets = await this.service.listWidgets(id);
    return { items: widgets.map(DashboardWidgetResponseDto.from) };
  }

  @Post(':id/widgets')
  @RequirePermissions(ReportingPermissions.DASHBOARD_WIDGET_MANAGE)
  @ApiOperation({ summary: 'Add a widget to a dashboard.' })
  @ApiCreatedResponse({ type: DashboardWidgetResponseDto })
  public async addWidget(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateDashboardWidgetDto,
  ): Promise<DashboardWidgetResponseDto> {
    const row = await this.service.addWidget(id, {
      kind: body.kind,
      position: body.position,
      title: body.title,
      config: body.config,
    });
    return DashboardWidgetResponseDto.from(row);
  }

  @Patch(':id/widgets/:widgetId')
  @RequirePermissions(ReportingPermissions.DASHBOARD_WIDGET_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a dashboard widget.' })
  @ApiOkResponse({ type: DashboardWidgetResponseDto })
  public async updateWidget(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('widgetId', new ParseUUIDPipe()) widgetId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateDashboardWidgetDto,
  ): Promise<DashboardWidgetResponseDto> {
    return DashboardWidgetResponseDto.from(
      await this.service.updateWidget(id, widgetId, parseIfMatch(ifMatch), {
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.config !== undefined ? { config: body.config } : {}),
      }),
    );
  }

  @Delete(':id/widgets/:widgetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ReportingPermissions.DASHBOARD_WIDGET_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a widget from a dashboard.' })
  @ApiNoContentResponse()
  public async removeWidget(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('widgetId', new ParseUUIDPipe()) widgetId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.removeWidget(id, widgetId, parseIfMatch(ifMatch));
  }
}
