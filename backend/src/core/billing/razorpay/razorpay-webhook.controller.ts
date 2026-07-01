/**
 * RazorpayWebhookController — public, unauthenticated endpoint that Razorpay
 * posts payment lifecycle events to. The webhook secret HMAC is verified
 * inside `RazorpayService.handleWebhook`; that verification is the only
 * authentication signal here, so the route is marked `@Public()` to skip the
 * global `JwtAuthGuard`.
 *
 * Route mounts under `/v1/platform/billing/razorpay/webhook`.
 *
 * Raw body access is required for HMAC verification. This relies on the
 * NestJS Express adapter being constructed with `{ rawBody: true }` so the
 * `req.rawBody` Buffer is populated by Nest's body parser.
 */
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../../auth';
import { RazorpayService } from './razorpay.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('Public · Razorpay Webhook')
@Controller({ path: 'platform/billing/razorpay/webhook', version: '1' })
export class RazorpayWebhookController {
  constructor(private readonly service: RazorpayService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  public async handle(
    @Req() req: RawBodyRequest,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ): Promise<{ readonly received: true }> {
    if (signature === undefined || signature.trim().length === 0) {
      throw new BadRequestException('Missing X-Razorpay-Signature header.');
    }
    const raw =
      req.rawBody !== undefined
        ? req.rawBody.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {});
    await this.service.handleWebhook({ rawBody: raw, signature });
    return { received: true };
  }
}
