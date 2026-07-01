/**
 * PaymentSourceController — platform-wide payment source configuration
 * (Razorpay / UPI / Bank / Manual). All routes are platform-admin only.
 *
 * Routes mount under `/v1/platform/billing/payment-sources[*]`:
 *   GET    /         — list active/inactive sources (cursor-paginated)
 *   GET    /:id      — read a single source
 *   POST   /         — create a source (RAZORPAY also gated by razorpay flag)
 *   PATCH  /:id      — update a source (If-Match required)
 *   POST   /:id/disable — soft-disable a source (If-Match required)
 *
 * Feature-flag enforcement (`module.billing`, `billing.razorpay_enabled`)
 * lives inside `PaymentSourceService`.
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
  Patch,
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
  CreatePaymentSourceDto,
  ListPaymentSourcesQueryDto,
  PaymentSourceResponseDto,
  UpdatePaymentSourceDto,
} from './payment-source.dto';
import { PaymentSourceService } from './payment-source.service';

interface ListEnvelope {
  readonly items: readonly PaymentSourceResponseDto[];
  readonly nextCursor: string | null;
}

@ApiTags('Platform Admin · Payment Sources')
@ApiBearerAuth()
@Controller({ path: 'platform/billing/payment-sources', version: '1' })
export class PaymentSourceController {
  constructor(private readonly service: PaymentSourceService) {}

  @Get()
  @RequirePermissions(BillingPermissions.PAYMENT_SOURCE_MANAGE)
  @ApiOperation({ summary: 'List payment source configurations.' })
  public async list(
    @Query() query: ListPaymentSourcesQueryDto,
  ): Promise<ListEnvelope> {
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.service.list({
      limit,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.sourceType !== undefined ? { sourceType: query.sourceType } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    });
    return {
      items: result.items.map(PaymentSourceResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(BillingPermissions.PAYMENT_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Read a payment source configuration.' })
  @ApiOkResponse({ type: PaymentSourceResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PaymentSourceResponseDto> {
    return PaymentSourceResponseDto.from(await this.service.get(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.PAYMENT_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Create a payment source configuration.' })
  @ApiOkResponse({ type: PaymentSourceResponseDto })
  public async create(
    @Body() body: CreatePaymentSourceDto,
  ): Promise<PaymentSourceResponseDto> {
    const created = await this.service.create({ ...body });
    return PaymentSourceResponseDto.from(created);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.PAYMENT_SOURCE_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a payment source configuration.' })
  @ApiOkResponse({ type: PaymentSourceResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePaymentSourceDto,
  ): Promise<PaymentSourceResponseDto> {
    const updated = await this.service.update(id, parseIfMatch(ifMatch), { ...body });
    return PaymentSourceResponseDto.from(updated);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.PAYMENT_SOURCE_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-disable a payment source configuration.' })
  @ApiOkResponse({ type: PaymentSourceResponseDto })
  public async disable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<PaymentSourceResponseDto> {
    const disabled = await this.service.disable(id, parseIfMatch(ifMatch));
    return PaymentSourceResponseDto.from(disabled);
  }
}
