/**
 * RazorpayController — authenticated Razorpay orchestration endpoints.
 *
 * Routes mount under `/v1/platform/billing/razorpay[*]`:
 *   POST /orders            — create a Razorpay order for an invoice (front-end
 *                             passes invoiceId, gets back order handle + keyId)
 *   POST /verify            — verify a checkout signature + record the Payment
 *
 * Feature-flag enforcement (`billing.razorpay_enabled`) lives inside
 * `RazorpayService`. The unauthenticated webhook lives in a separate
 * `RazorpayWebhookController`.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiProperty, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID, Length, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../rbac';
import { BillingPermissions } from '../billing.constants';
import { PaymentResponseDto } from '../payment/payment.dto';
import {
  RazorpayService,
  type CreateRazorpayOrderResult,
} from './razorpay.service';

export class CreateRazorpayOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public invoiceId!: string;
}

export class VerifyRazorpayPaymentDto {
  @ApiProperty({ maxLength: 80 })
  @IsString() @Length(1, 80)
  public orderId!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString() @Length(1, 80)
  public paymentId!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200)
  public signature!: string;
}

export class CreateRazorpayOrderResponseDto {
  @ApiProperty() public orderId!: string;
  @ApiProperty() public keyId!: string;
  @ApiProperty() public amount!: number;
  @ApiProperty() public currency!: string;
  @ApiProperty() public receipt!: string;

  public static from(result: CreateRazorpayOrderResult): CreateRazorpayOrderResponseDto {
    const dto = new CreateRazorpayOrderResponseDto();
    dto.orderId = result.orderId;
    dto.keyId = result.keyId;
    dto.amount = result.amount;
    dto.currency = result.currency;
    dto.receipt = result.receipt;
    return dto;
  }
}

@ApiTags('Platform Admin · Razorpay')
@ApiBearerAuth()
@Controller({ path: 'platform/billing/razorpay', version: '1' })
export class RazorpayController {
  constructor(private readonly service: RazorpayService) {}

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Create a Razorpay order for an invoice.' })
  @ApiOkResponse({ type: CreateRazorpayOrderResponseDto })
  public async createOrder(
    @Body() body: CreateRazorpayOrderDto,
  ): Promise<CreateRazorpayOrderResponseDto> {
    const result = await this.service.createOrderForInvoice({
      invoiceId: body.invoiceId,
    });
    return CreateRazorpayOrderResponseDto.from(result);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.PAYMENT_RECORD)
  @ApiOperation({
    summary: 'Verify a Razorpay checkout signature and record the Payment row.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  public async verify(
    @Body() body: VerifyRazorpayPaymentDto,
  ): Promise<PaymentResponseDto> {
    const payment = await this.service.verifyAndRecordPayment({
      orderId: body.orderId,
      paymentId: body.paymentId,
      signature: body.signature,
    });
    return PaymentResponseDto.from(payment);
  }
}
