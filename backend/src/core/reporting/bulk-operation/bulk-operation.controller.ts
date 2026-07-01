/**
 * BulkOperationController — `/bulk-operations` lifecycle routes.
 *
 * The endpoint requires BULK_OPERATION_CREATE; EXECUTE-mode submissions
 * additionally need BULK_OPERATION_EXECUTE. The service layer does not
 * second-check this permission today — callers wiring EXECUTE-mode
 * dashboards should grant both permissions to operators.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
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
  BulkOperationListQueryDto,
  BulkOperationListResponseDto,
  BulkOperationResponseDto,
  CreateBulkOperationDto,
} from './bulk-operation.dto';
import { BulkOperationService } from './bulk-operation.service';

@ApiTags('Bulk Operations')
@ApiBearerAuth()
@Controller({ path: 'bulk-operations', version: '1' })
export class BulkOperationController {
  constructor(private readonly service: BulkOperationService) {}

  @Get()
  @RequirePermissions(ReportingPermissions.BULK_OPERATION_READ)
  @ApiOperation({ summary: 'List bulk operations (cursor paginated).' })
  @ApiOkResponse({ type: BulkOperationListResponseDto })
  public async list(
    @Query() query: BulkOperationListQueryDto,
  ): Promise<BulkOperationListResponseDto> {
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
      items: items.map(BulkOperationResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(ReportingPermissions.BULK_OPERATION_CREATE)
  @ApiOperation({
    summary:
      'Submit a bulk operation in PREVIEW / VALIDATE (synchronous) or EXECUTE (queued) mode.',
  })
  @ApiCreatedResponse({ type: BulkOperationResponseDto })
  public async create(
    @Body() body: CreateBulkOperationDto,
  ): Promise<BulkOperationResponseDto> {
    const row = await this.service.create({
      kind: body.kind,
      mode: body.mode,
      params: body.params,
    });
    return BulkOperationResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(ReportingPermissions.BULK_OPERATION_READ)
  @ApiOperation({ summary: 'Get a single bulk-operation header.' })
  @ApiOkResponse({ type: BulkOperationResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BulkOperationResponseDto> {
    return BulkOperationResponseDto.from(await this.service.getById(id));
  }

  @Post(':id/cancel')
  @RequirePermissions(ReportingPermissions.BULK_OPERATION_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Cancel a DRAFT / PREVIEWED / VALIDATED bulk operation.',
  })
  @ApiOkResponse({ type: BulkOperationResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<BulkOperationResponseDto> {
    return BulkOperationResponseDto.from(
      await this.service.cancel(id, parseIfMatch(ifMatch)),
    );
  }
}
