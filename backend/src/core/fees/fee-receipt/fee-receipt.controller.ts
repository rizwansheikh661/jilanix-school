/**
 * FeeReceiptController — base path `/api/v1/fees/receipts`.
 *
 * Routes:
 *   GET    /                — list receipts (cursor + studentId/status/from/to)
 *   GET    /:id             — receipt + payment.allocations (reprint endpoint)
 *   POST   /:id/cancel      — cancel an ISSUED receipt (If-Match required)
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { FeesPermissions } from '../fees.constants';
import {
  CancelReceiptDto,
  FeeReceiptDetailResponseDto,
  FeeReceiptListQueryDto,
  FeeReceiptListResponseDto,
  FeeReceiptResponseDto,
} from './fee-receipt.dto';
import { FeeReceiptService } from './fee-receipt.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/receipts', version: '1' })
export class FeeReceiptController {
  constructor(private readonly service: FeeReceiptService) {}

  @Get()
  @RequirePermissions(FeesPermissions.RECEIPT_READ)
  @ApiOperation({ summary: 'List fee receipts (cursor paginated; filterable).' })
  @ApiOkResponse({ type: FeeReceiptListResponseDto })
  public async list(
    @Query() query: FeeReceiptListQueryDto,
  ): Promise<FeeReceiptListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    });
    return {
      items: items.map((row) => FeeReceiptResponseDto.from(row)),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.RECEIPT_READ)
  @ApiOperation({
    summary:
      'Get a fee receipt by id with payment allocations (reprint endpoint).',
  })
  @ApiOkResponse({ type: FeeReceiptDetailResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeeReceiptDetailResponseDto> {
    const detail = await this.service.getDetail(id);
    return FeeReceiptDetailResponseDto.from(detail);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.RECEIPT_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Cancel an ISSUED fee receipt; reverses allocations and rolls back invoice paidTotal/status.',
  })
  @ApiOkResponse({ type: FeeReceiptDetailResponseDto })
  @ApiNotFoundResponse()
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelReceiptDto,
  ): Promise<FeeReceiptDetailResponseDto> {
    const ifMatchVersion = parseIfMatch(ifMatch);
    const cancelled = await this.service.cancel({
      id,
      ifMatchVersion,
      reason: body.reason,
    });
    return FeeReceiptDetailResponseDto.from(cancelled);
  }
}
