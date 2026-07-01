/**
 * RefundController — platform-admin endpoints for the refund FSM.
 *
 * Routes mount under `/v1/platform/billing/refunds[*]`:
 *   GET    /                          — list refunds (cursor-paginated)
 *   GET    /:id                       — read a single refund
 *   POST   /                          — create a PENDING refund
 *   POST   /:id/approve               — PENDING → APPROVED (If-Match)
 *   POST   /:id/reject                — PENDING/APPROVED → REJECTED (If-Match)
 *   POST   /:id/mark-processed        — APPROVED → PROCESSED (If-Match)
 *
 * Feature-flag enforcement (`module.billing`) lives in the service layer.
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
} from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { BillingPermissions } from '../billing.constants';
import {
  CreateRefundDto,
  ListRefundsQueryDto,
  MarkRefundProcessedDto,
  RefundResponseDto,
  RejectRefundDto,
} from './refund.dto';
import { RefundService } from './refund.service';

interface ListRefundsEnvelope {
  readonly items: readonly RefundResponseDto[];
  readonly nextCursor: string | null;
}

@ApiTags('Platform Admin · Refunds')
@ApiBearerAuth()
@Controller({ path: 'platform/billing/refunds', version: '1' })
export class RefundController {
  constructor(private readonly service: RefundService) {}

  @Get()
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'List refunds (cursor-paginated).' })
  public async list(
    @Query() query: ListRefundsQueryDto,
  ): Promise<ListRefundsEnvelope> {
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.service.list({
      limit,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.paymentId !== undefined ? { paymentId: query.paymentId } : {}),
      ...(query.invoiceId !== undefined ? { invoiceId: query.invoiceId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: result.items.map(RefundResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'Read a single refund.' })
  @ApiOkResponse({ type: RefundResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RefundResponseDto> {
    return RefundResponseDto.from(await this.service.get(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'Create a PENDING refund against a payment.' })
  @ApiOkResponse({ type: RefundResponseDto })
  public async create(@Body() body: CreateRefundDto): Promise<RefundResponseDto> {
    const created = await this.service.create({
      paymentId: body.paymentId,
      amount: body.amount,
      reason: body.reason,
      ...(body.externalReference !== undefined
        ? { externalReference: body.externalReference }
        : {}),
    });
    return RefundResponseDto.from(created);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Approve a PENDING refund.' })
  @ApiOkResponse({ type: RefundResponseDto })
  public async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<RefundResponseDto> {
    const updated = await this.service.approve(id, parseIfMatch(ifMatch));
    return RefundResponseDto.from(updated);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reject a PENDING/APPROVED refund.' })
  @ApiOkResponse({ type: RefundResponseDto })
  public async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectRefundDto,
  ): Promise<RefundResponseDto> {
    const updated = await this.service.reject(
      id,
      parseIfMatch(ifMatch),
      body.reason,
    );
    return RefundResponseDto.from(updated);
  }

  @Post(':id/mark-processed')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Mark an APPROVED refund as PROCESSED — reverses parent payment + invoice.',
  })
  @ApiOkResponse({ type: RefundResponseDto })
  public async markProcessed(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: MarkRefundProcessedDto,
  ): Promise<RefundResponseDto> {
    const updated = await this.service.markProcessed(
      id,
      parseIfMatch(ifMatch),
      body.gatewayRefundId ?? null,
    );
    return RefundResponseDto.from(updated);
  }
}
