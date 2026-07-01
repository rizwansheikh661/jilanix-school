/**
 * ReportTemplateController — `/report-templates` CRUD.
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
  CreateReportTemplateDto,
  ReportTemplateListQueryDto,
  ReportTemplateListResponseDto,
  ReportTemplateResponseDto,
  UpdateReportTemplateDto,
} from './report-template.dto';
import { ReportTemplateService } from './report-template.service';

@ApiTags('Report Templates')
@ApiBearerAuth()
@Controller({ path: 'report-templates', version: '1' })
export class ReportTemplateController {
  constructor(private readonly service: ReportTemplateService) {}

  @Get()
  @RequirePermissions(ReportingPermissions.REPORT_TEMPLATE_READ)
  @ApiOperation({ summary: 'List report templates (own + shared by default).' })
  @ApiOkResponse({ type: ReportTemplateListResponseDto })
  public async list(
    @Query() query: ReportTemplateListQueryDto,
  ): Promise<ReportTemplateListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.reportKind !== undefined
        ? { reportKind: query.reportKind }
        : {}),
      ...(query.isShared !== undefined ? { isShared: query.isShared } : {}),
      ...(query.mineOnly !== undefined ? { mineOnly: query.mineOnly } : {}),
    });
    return {
      items: items.map(ReportTemplateResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(ReportingPermissions.REPORT_TEMPLATE_CREATE)
  @ApiOperation({ summary: 'Create a new report template.' })
  @ApiCreatedResponse({ type: ReportTemplateResponseDto })
  public async create(
    @Body() body: CreateReportTemplateDto,
  ): Promise<ReportTemplateResponseDto> {
    const row = await this.service.create({
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
      reportKind: body.reportKind,
      params: body.params,
      ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
    });
    return ReportTemplateResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(ReportingPermissions.REPORT_TEMPLATE_READ)
  @ApiOperation({ summary: 'Get a single report template.' })
  @ApiOkResponse({ type: ReportTemplateResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReportTemplateResponseDto> {
    return ReportTemplateResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(ReportingPermissions.REPORT_TEMPLATE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a report template (owner only).' })
  @ApiOkResponse({ type: ReportTemplateResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateReportTemplateDto,
  ): Promise<ReportTemplateResponseDto> {
    return ReportTemplateResponseDto.from(
      await this.service.update(id, parseIfMatch(ifMatch), {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.reportKind !== undefined
          ? { reportKind: body.reportKind }
          : {}),
        ...(body.params !== undefined ? { params: body.params } : {}),
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ReportingPermissions.REPORT_TEMPLATE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a report template (owner only).' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }
}
