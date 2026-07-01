/**
 * FeeRefundController + FeeRefundCreateController.
 *
 * Two controllers because the create path nests under payments and the list
 * path is flat — same pattern as FeePaymentCheckoutController /
 * FeePaymentWebhookController in fee-payment.controller.ts.
 *
 * Routes:
 *   GET  /api/v1/fees/refunds                       — list (cursor + filters)
 *   POST /api/v1/fees/payments/:paymentId/refund    — record a refund
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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

import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { FeesPermissions } from '../fees.constants';
import {
  CreateFeeRefundDto,
  FeeRefundListQueryDto,
  FeeRefundListResponseDto,
  FeeRefundResponseDto,
} from './fee-refund.dto';
import { FeeRefundService } from './fee-refund.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/refunds', version: '1' })
export class FeeRefundController {
  constructor(private readonly service: FeeRefundService) {}

  @Get()
  @RequirePermissions(FeesPermissions.REFUND_READ)
  @ApiOperation({ summary: 'List fee refunds (cursor paginated; filterable).' })
  @ApiOkResponse({ type: FeeRefundListResponseDto })
  public async list(
    @Query() query: FeeRefundListQueryDto,
  ): Promise<FeeRefundListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.paymentId !== undefined ? { paymentId: query.paymentId } : {}),
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    });
    return {
      items: items.map((row) => FeeRefundResponseDto.from(row)),
      nextCursor: nextCursorId,
    };
  }
}

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/payments', version: '1' })
export class FeeRefundCreateController {
  constructor(private readonly service: FeeRefundService) {}

  @Post(':paymentId/refund')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(FeesPermissions.REFUND_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary:
      'Record a refund against an existing captured payment; reverses allocations and rolls back invoice paidTotal/refundTotal/status.',
  })
  @ApiCreatedResponse({ type: FeeRefundResponseDto })
  @ApiNotFoundResponse()
  public async create(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() body: CreateFeeRefundDto,
  ): Promise<FeeRefundResponseDto> {
    const refund = await this.service.create({
      paymentId,
      amount: body.amount,
      reason: body.reason,
      method: body.method,
      ...(body.referenceNo !== undefined ? { referenceNo: body.referenceNo } : {}),
    });
    return FeeRefundResponseDto.from(refund);
  }
}
