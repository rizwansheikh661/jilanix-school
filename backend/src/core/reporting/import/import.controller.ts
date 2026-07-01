/**
 * ImportController — `/imports` lifecycle routes.
 *
 * Multipart upload uses `FileInterceptor` (memoryStorage by default) so the
 * full source buffer reaches the service before any DB write. The optional
 * `options` JSON string in the form body is parsed in the controller — bad
 * JSON degrades to 400 BadRequest before the service runs.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import {
  IMPORT_KIND_VALUES,
  type ImportKindValue,
  ReportingPermissions,
} from '../reporting.constants';
import {
  ImportJobIssueListQueryDto,
  ImportJobIssueListResponseDto,
  ImportJobIssueResponseDto,
  ImportJobListQueryDto,
  ImportJobListResponseDto,
  ImportJobMultipartDto,
  ImportJobResponseDto,
  ImportPreviewMultipartDto,
  ImportPreviewResponseDto,
  ImportTemplateQueryDto,
  ImportValidationSummaryDto,
  IssuesExportQueryDto,
} from './import.dto';
import { ImportErrorExportService } from './error-export/error-export.service';
import { ImportPreviewService } from './preview/preview.service';
import { ImportTemplateService } from './templates/template.service';
import { ImportJobService } from './import.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Imports')
@ApiBearerAuth()
@Controller({ path: 'imports', version: '1' })
export class ImportController {
  constructor(
    private readonly service: ImportJobService,
    private readonly templates: ImportTemplateService,
    private readonly preview: ImportPreviewService,
    private readonly errorExport: ImportErrorExportService,
  ) {}

  @Get()
  @RequirePermissions(ReportingPermissions.IMPORT_READ)
  @ApiOperation({ summary: 'List import jobs (cursor paginated).' })
  @ApiOkResponse({ type: ImportJobListResponseDto })
  public async list(
    @Query() query: ImportJobListQueryDto,
  ): Promise<ImportJobListResponseDto> {
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
      items: items.map(ImportJobResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(ReportingPermissions.IMPORT_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', example: 'STUDENT' },
        options: {
          type: 'string',
          description: 'Optional JSON-encoded options bag (per-kind shape).',
        },
      },
      required: ['file', 'kind'],
    },
  })
  @ApiCreatedResponse({ type: ImportJobResponseDto })
  @ApiOperation({ summary: 'Upload a source spreadsheet and queue an import.' })
  public async create(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: ImportJobMultipartDto,
  ): Promise<ImportJobResponseDto> {
    if (file === undefined || file === null || file.buffer === undefined) {
      throw new BadRequestException(
        'A "file" multipart field is required for /imports.',
      );
    }
    let options: Record<string, unknown> | undefined;
    if (body.options !== undefined && body.options !== '') {
      try {
        const parsed: unknown = JSON.parse(body.options);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BadRequestException(
            'The "options" field must be a JSON object.',
          );
        }
        options = parsed as Record<string, unknown>;
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(
          `The "options" field is not valid JSON: ${(err as Error).message}`,
        );
      }
    }
    const row = await this.service.create({
      kind: body.kind,
      sourceFile: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        body: file.buffer,
      },
      ...(options !== undefined ? { options } : {}),
    });
    return ImportJobResponseDto.from(row);
  }

  // ---------------------------------------------------------------------------
  // Patch A — Template download
  // ---------------------------------------------------------------------------
  @Get('templates/:kind')
  @RequirePermissions(ReportingPermissions.IMPORT_TEMPLATE)
  @ApiOperation({
    summary:
      'Download a CSV / XLSX header template for an import kind. Required columns are flagged with a trailing "*".',
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  public async downloadTemplate(
    @Param('kind', new ParseEnumPipe(IMPORT_KIND_VALUES))
    kind: ImportKindValue,
    @Query() query: ImportTemplateQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const format = query.format ?? 'csv';
    const built = await this.templates.build(kind, format);
    res.setHeader('Content-Type', built.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${built.filename}"`,
    );
    res.setHeader('Content-Length', built.buffer.length.toString());
    return built.buffer;
  }

  // ---------------------------------------------------------------------------
  // Patch B — Preview (parse + validate, no DB writes)
  // ---------------------------------------------------------------------------
  @Post('preview')
  @RequirePermissions(ReportingPermissions.IMPORT_PREVIEW)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', example: 'STUDENT' },
        previewRows: { type: 'integer', minimum: 1 },
      },
      required: ['file', 'kind'],
    },
  })
  @ApiOkResponse({ type: ImportPreviewResponseDto })
  @ApiOperation({
    summary:
      'Validate the first N rows of an uploaded spreadsheet without persisting it. Returns a CLEAN / PARTIAL / INVALID summary + per-error detail.',
  })
  public async previewUpload(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: ImportPreviewMultipartDto,
  ): Promise<ImportPreviewResponseDto> {
    if (file === undefined || file === null || file.buffer === undefined) {
      throw new BadRequestException(
        'A "file" multipart field is required for /imports/preview.',
      );
    }
    const result = await this.preview.preview({
      buffer: file.buffer,
      mimeType: file.mimetype,
      kind: body.kind,
      ...(body.previewRows !== undefined ? { previewRows: body.previewRows } : {}),
    });
    return {
      summary: ImportValidationSummaryDto.from(result.summary),
      rows: result.rows,
    };
  }

  @Get(':id')
  @RequirePermissions(ReportingPermissions.IMPORT_READ)
  @ApiOperation({ summary: 'Get a single import-job header.' })
  @ApiOkResponse({ type: ImportJobResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ImportJobResponseDto> {
    return ImportJobResponseDto.from(await this.service.getById(id));
  }

  @Get(':id/issues')
  @RequirePermissions(ReportingPermissions.IMPORT_READ)
  @ApiOperation({ summary: 'List per-row issues for an import job.' })
  @ApiOkResponse({ type: ImportJobIssueListResponseDto })
  public async listIssues(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ImportJobIssueListQueryDto,
  ): Promise<ImportJobIssueListResponseDto> {
    const { items, nextCursorId } = await this.service.listIssues({
      importJobId: id,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.severity !== undefined ? { severity: query.severity } : {}),
    });
    return {
      items: items.map(ImportJobIssueResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  // ---------------------------------------------------------------------------
  // Patch C3 — Error report exports (CSV + XLSX)
  // ---------------------------------------------------------------------------
  @Get(':id/issues.csv')
  @RequirePermissions(ReportingPermissions.IMPORT_READ)
  @ApiOperation({
    summary:
      'Download all issues for an import job as CSV (validation ERRORs + commit-time WARNINGs).',
  })
  @ApiProduces('text/csv')
  public async downloadIssuesCsv(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: IssuesExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    // Tenant + existence check.
    await this.service.getById(id);
    const built = await this.errorExport.exportCsv({
      importJobId: id,
      ...(query.severity !== undefined ? { severity: query.severity } : {}),
    });
    res.setHeader('Content-Type', built.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${built.filename}"`,
    );
    res.setHeader('Content-Length', built.buffer.length.toString());
    return built.buffer;
  }

  @Get(':id/issues.xlsx')
  @RequirePermissions(ReportingPermissions.IMPORT_READ)
  @ApiOperation({
    summary:
      'Download all issues for an import job as XLSX (validation ERRORs + commit-time WARNINGs).',
  })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  public async downloadIssuesXlsx(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: IssuesExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    await this.service.getById(id);
    const built = await this.errorExport.exportXlsx({
      importJobId: id,
      ...(query.severity !== undefined ? { severity: query.severity } : {}),
    });
    res.setHeader('Content-Type', built.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${built.filename}"`,
    );
    res.setHeader('Content-Length', built.buffer.length.toString());
    return built.buffer;
  }

  @Post(':id/cancel')
  @RequirePermissions(ReportingPermissions.IMPORT_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel a PENDING / VALIDATING / VALIDATED import job.' })
  @ApiOkResponse({ type: ImportJobResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ImportJobResponseDto> {
    return ImportJobResponseDto.from(
      await this.service.cancel(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/commit')
  @RequirePermissions(ReportingPermissions.IMPORT_COMMIT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Promote a VALIDATED import job to COMMITTING.' })
  @ApiOkResponse({ type: ImportJobResponseDto })
  public async commit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ImportJobResponseDto> {
    return ImportJobResponseDto.from(
      await this.service.commit(id, parseIfMatch(ifMatch)),
    );
  }
}
