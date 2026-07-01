/**
 * FeePaymentController + FeePaymentCheckoutController + FeePaymentWebhookController.
 *
 * Routes:
 *   GET    /api/v1/fees/payments               — list (cursor + filters)
 *   GET    /api/v1/fees/payments/:id           — get one with allocations + receipt
 *   POST   /api/v1/fees/payments               — offline payment (Idempotency-Key
 *                                                 handled by middleware)
 *   POST   /api/v1/fees/invoices/:id/checkout  — initiate gateway checkout
 *   POST   /api/v1/hooks/:gateway              — webhook stub (501 always)
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
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../auth/auth.decorators';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { FeesPermissions } from '../fees.constants';
import {
  CheckoutFeeInvoiceDto,
  CheckoutResponseDto,
  CreateFeePaymentDto,
  FeePaymentListQueryDto,
  FeePaymentListResponseDto,
  FeePaymentResponseDto,
  RejectFeePaymentDto,
  VerifyFeePaymentDto,
} from './fee-payment.dto';
import { FeePaymentService } from './fee-payment.service';
import type { GatewayCode } from './gateways/payment-gateway.port';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/payments', version: '1' })
export class FeePaymentController {
  constructor(private readonly service: FeePaymentService) {}

  @Get()
  @RequirePermissions(FeesPermissions.PAYMENT_READ)
  @ApiOperation({ summary: 'List fee payments (cursor paginated; filterable).' })
  @ApiOkResponse({ type: FeePaymentListResponseDto })
  public async list(
    @Query() query: FeePaymentListQueryDto,
  ): Promise<FeePaymentListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
      ...(query.method !== undefined ? { method: query.method } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.verificationStatus !== undefined
        ? { verificationStatus: query.verificationStatus }
        : {}),
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    });
    return {
      items: items.map((row) => FeePaymentResponseDto.from(row)),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.PAYMENT_READ)
  @ApiOperation({ summary: 'Get a fee payment by id with allocations + receipt.' })
  @ApiOkResponse({ type: FeePaymentResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeePaymentResponseDto> {
    const { payment, receipt } = await this.service.getById(id);
    return FeePaymentResponseDto.from(payment, receipt);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(FeesPermissions.PAYMENT_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Record an offline payment with per-invoice allocations.',
  })
  @ApiCreatedResponse({ type: FeePaymentResponseDto })
  public async create(
    @Body() body: CreateFeePaymentDto,
  ): Promise<FeePaymentResponseDto> {
    const { payment, receipt } = await this.service.capture({
      studentId: body.studentId,
      method: body.method,
      amount: body.amount,
      paidAt: new Date(body.paidAt),
      ...(body.referenceNo !== undefined ? { referenceNo: body.referenceNo } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.paymentSourceId !== undefined
        ? { paymentSourceId: body.paymentSourceId }
        : {}),
      ...(body.paymentProofUrl !== undefined
        ? { paymentProofUrl: body.paymentProofUrl }
        : {}),
      ...(body.verificationNotes !== undefined
        ? { verificationNotes: body.verificationNotes }
        : {}),
      allocations: body.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amount: a.amount,
      })),
    });
    return FeePaymentResponseDto.from(payment, receipt);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.PAYMENT_VERIFY)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Verify a pending manual payment (issues a receipt + flips invoices).',
  })
  @ApiOkResponse({ type: FeePaymentResponseDto })
  @ApiNotFoundResponse()
  public async verify(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: VerifyFeePaymentDto,
  ): Promise<FeePaymentResponseDto> {
    const { payment, receipt } = await this.service.verify(id, ifMatch, {
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    return FeePaymentResponseDto.from(payment, receipt);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.PAYMENT_VERIFY)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Reject a pending manual payment (no receipt; no invoice impact).',
  })
  @ApiOkResponse({ type: FeePaymentResponseDto })
  @ApiNotFoundResponse()
  public async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectFeePaymentDto,
  ): Promise<FeePaymentResponseDto> {
    const { payment } = await this.service.reject(id, ifMatch, {
      reason: body.reason,
    });
    return FeePaymentResponseDto.from(payment, null);
  }
}

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/invoices', version: '1' })
export class FeePaymentCheckoutController {
  constructor(private readonly service: FeePaymentService) {}

  @Post(':id/checkout')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(FeesPermissions.PAYMENT_CHECKOUT)
  @ApiOperation({
    summary:
      'Initiate an online checkout for an invoice through a registered gateway.',
  })
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  @ApiNotFoundResponse()
  public async checkout(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CheckoutFeeInvoiceDto,
  ): Promise<CheckoutResponseDto> {
    const session = await this.service.checkout({
      invoiceId: id,
      gatewayCode: body.gatewayCode as GatewayCode,
      ...(body.returnUrl !== undefined ? { returnUrl: body.returnUrl } : {}),
    });
    return {
      gatewayCode: session.gatewayCode,
      sessionId: session.sessionId,
      redirectUrl: session.redirectUrl,
      expiresAt: session.expiresAt.toISOString(),
    };
  }
}

@ApiTags('Fees')
@Controller({ path: 'hooks', version: '1' })
export class FeePaymentWebhookController {
  constructor(private readonly service: FeePaymentService) {}

  @Post(':gateway')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @Public()
  @ApiOperation({
    summary: 'Payment gateway webhook (stub) — always 501 in Sprint 9.',
  })
  public async handle(
    @Param('gateway') gateway: string,
    @Headers('x-signature') _signature: string | undefined,
    @Body() _payload: unknown,
  ): Promise<void> {
    await this.service.handleWebhook(gateway);
  }
}
