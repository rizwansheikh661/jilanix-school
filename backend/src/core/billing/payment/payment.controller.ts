/**
 * PaymentController — platform-admin endpoints for manual payment recording
 * and payment FSM operations.
 *
 * Routes mount under `/v1/platform/billing/payments[*]`:
 *   GET    /                         — list payments (cursor-paginated)
 *   GET    /:id                      — read a single payment
 *   GET    /:id/attempts             — list attempts for a payment
 *   POST   /manual                   — record a manual payment (PENDING)
 *   POST   /:id/approve              — PENDING/ON_HOLD → APPROVED (If-Match)
 *   POST   /:id/reject               — PENDING/ON_HOLD → REJECTED (If-Match)
 *   POST   /:id/hold                 — PENDING → ON_HOLD (If-Match)
 *   POST   /:id/mark-failed          — PENDING/ON_HOLD/APPROVED → FAILED (If-Match)
 *
 * Feature-flag enforcement (`module.billing`, `billing.manual_payments_enabled`)
 * lives inside `PaymentService`.
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
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Length, MaxLength } from 'class-validator';

import { parseIfMatch } from '../../http/if-match';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
} from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { BillingPermissions } from '../billing.constants';
import {
  ApprovePaymentDto,
  HoldPaymentDto,
  ListPaymentsQueryDto,
  PaymentAttemptResponseDto,
  PaymentResponseDto,
  RecordManualPaymentDto,
  RejectPaymentDto,
} from './payment.dto';
import { PaymentService } from './payment.service';

interface ListPaymentsEnvelope {
  readonly items: readonly PaymentResponseDto[];
  readonly nextCursor: string | null;
}

class MarkPaymentFailedDto {
  @ApiProperty({ maxLength: 60 })
  @IsString() @Length(1, 60)
  public errorCode!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString() @MaxLength(500)
  public errorMessage!: string;
}

@ApiTags('Platform Admin · Payments')
@ApiBearerAuth()
@Controller({ path: 'platform/billing/payments', version: '1' })
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Get()
  @RequirePermissions(BillingPermissions.PAYMENT_VERIFY)
  @ApiOperation({ summary: 'List payments (cursor-paginated).' })
  public async list(
    @Query() query: ListPaymentsQueryDto,
  ): Promise<ListPaymentsEnvelope> {
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.service.list({
      limit,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
      ...(query.invoiceId !== undefined ? { invoiceId: query.invoiceId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.method !== undefined ? { method: query.method } : {}),
    });
    return {
      items: result.items.map(PaymentResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(BillingPermissions.PAYMENT_VERIFY)
  @ApiOperation({ summary: 'Read a single payment.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PaymentResponseDto> {
    return PaymentResponseDto.from(await this.service.get(id));
  }

  @Get(':id/attempts')
  @RequirePermissions(BillingPermissions.PAYMENT_VERIFY)
  @ApiOperation({ summary: 'List attempts for a payment.' })
  public async listAttempts(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<readonly PaymentAttemptResponseDto[]> {
    const rows = await this.service.listAttempts(id);
    return rows.map(PaymentAttemptResponseDto.from);
  }

  @Post('manual')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Record a manual payment (lands as PENDING).' })
  @ApiOkResponse({ type: PaymentResponseDto })
  public async recordManual(
    @Body() body: RecordManualPaymentDto,
  ): Promise<PaymentResponseDto> {
    const created = await this.service.recordManual({
      accountId: body.accountId,
      method: body.method,
      amount: body.amount,
      ...(body.invoiceId !== undefined ? { invoiceId: body.invoiceId } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.externalReference !== undefined
        ? { externalReference: body.externalReference }
        : {}),
      ...(body.proofUrl !== undefined ? { proofUrl: body.proofUrl } : {}),
      ...(body.payerNotes !== undefined ? { payerNotes: body.payerNotes } : {}),
      ...(body.paymentSourceId !== undefined
        ? { paymentSourceId: body.paymentSourceId }
        : {}),
    });
    return PaymentResponseDto.from(created);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.PAYMENT_VERIFY)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Approve a PENDING/ON_HOLD payment.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  public async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ApprovePaymentDto,
  ): Promise<PaymentResponseDto> {
    const updated = await this.service.approve(
      id,
      parseIfMatch(ifMatch),
      body.notes ?? null,
    );
    return PaymentResponseDto.from(updated);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.PAYMENT_VERIFY)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reject a PENDING/ON_HOLD payment.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  public async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectPaymentDto,
  ): Promise<PaymentResponseDto> {
    const updated = await this.service.reject(
      id,
      parseIfMatch(ifMatch),
      body.reason,
    );
    return PaymentResponseDto.from(updated);
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.PAYMENT_VERIFY)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Place a PENDING payment ON_HOLD.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  public async hold(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: HoldPaymentDto,
  ): Promise<PaymentResponseDto> {
    const updated = await this.service.hold(id, parseIfMatch(ifMatch), body.reason);
    return PaymentResponseDto.from(updated);
  }

  @Post(':id/mark-failed')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.PAYMENT_VERIFY)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Mark a payment as FAILED.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  public async markFailed(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: MarkPaymentFailedDto,
  ): Promise<PaymentResponseDto> {
    const updated = await this.service.markFailed(
      id,
      parseIfMatch(ifMatch),
      body.errorCode,
      body.errorMessage,
    );
    return PaymentResponseDto.from(updated);
  }
}
