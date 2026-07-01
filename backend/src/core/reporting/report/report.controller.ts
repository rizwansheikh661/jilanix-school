/**
 * ReportController — `/reports` lifecycle routes.
 */
import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Body } from '@nestjs/common';
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
import type { Response } from 'express';

import { FileAssetService } from '../../file-storage';
import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { ReportingPermissions } from '../reporting.constants';
import {
  CreateReportRunDto,
  ReportRunListQueryDto,
  ReportRunListResponseDto,
  ReportRunResponseDto,
} from './report.dto';
import { ReportRunService } from './report.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
export class ReportController {
  constructor(
    private readonly service: ReportRunService,
    private readonly fileAssets: FileAssetService,
  ) {}

  @Get()
  @RequirePermissions(ReportingPermissions.REPORT_READ)
  @ApiOperation({ summary: 'List report runs (cursor paginated).' })
  @ApiOkResponse({ type: ReportRunListResponseDto })
  public async list(
    @Query() query: ReportRunListQueryDto,
  ): Promise<ReportRunListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.requestedByUserId !== undefined
        ? { requestedByUserId: query.requestedByUserId }
        : {}),
    });
    return {
      items: items.map(ReportRunResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(ReportingPermissions.REPORT_CREATE)
  @ApiOperation({ summary: 'Request a new report run (queued).' })
  @ApiCreatedResponse({ type: ReportRunResponseDto })
  public async create(
    @Body() body: CreateReportRunDto,
  ): Promise<ReportRunResponseDto> {
    const row = await this.service.create({
      kind: body.kind,
      ...(body.format !== undefined ? { format: body.format } : {}),
      params: body.params,
    });
    return ReportRunResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(ReportingPermissions.REPORT_READ)
  @ApiOperation({ summary: 'Get a single report run header.' })
  @ApiOkResponse({ type: ReportRunResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReportRunResponseDto> {
    return ReportRunResponseDto.from(await this.service.getById(id));
  }

  @Get(':id/download')
  @RequirePermissions(ReportingPermissions.REPORT_DOWNLOAD)
  @ApiOperation({
    summary:
      'Redirect (302) to a short-lived download URL for the materialized file.',
  })
  public async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { fileAssetId } = await this.service.getDownload(id);
    const { url } = await this.fileAssets.buildDownloadUrl(fileAssetId);
    res.redirect(HttpStatus.FOUND, url);
  }

  @Post(':id/cancel')
  @RequirePermissions(ReportingPermissions.REPORT_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel a PENDING or RUNNING report run.' })
  @ApiOkResponse({ type: ReportRunResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ReportRunResponseDto> {
    return ReportRunResponseDto.from(
      await this.service.cancel(id, parseIfMatch(ifMatch)),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ReportingPermissions.REPORT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a report-run row.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }
}
