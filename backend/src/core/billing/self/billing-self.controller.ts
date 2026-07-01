/**
 * BillingSelfController — tenant-facing read endpoints. Resolves the calling
 * tenant's `schoolId` from `RequestContextRegistry` so a tenant user cannot
 * see another tenant's billing data.
 *
 * Routes mount under `/v1/me/billing[*]`:
 *   GET /me/billing/account                — current tenant's billing account
 *   GET /me/billing/account/profile        — billing profile
 *   GET /me/billing/account/address        — billing address
 *   GET /me/billing/account/tax-details    — tax details
 *   GET /me/billing/account/settings       — billing settings
 *   GET /me/billing/invoices               — list invoices for this tenant
 *   GET /me/billing/invoices/:id           — read one invoice + lines
 *   GET /me/billing/payments               — list payments for this tenant
 *   GET /me/billing/refunds                — list refunds for this tenant
 *
 * RBAC: `billing.self.read` for every route.
 */
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
} from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import {
  BillingAccountResponseDto,
  BillingAddressResponseDto,
  BillingProfileResponseDto,
  TaxDetailsResponseDto,
} from '../account/billing-account.dto';
import { BillingAccountService } from '../account/billing-account.service';
import {
  BillingAccountNotFoundError,
  BillingProfileNotFoundError,
} from '../billing.errors';
import { BillingPermissions } from '../billing.constants';
import {
  InvoiceResponseDto,
  InvoiceWithLinesResponseDto,
  ListInvoicesQueryDto,
} from '../invoice/invoice.dto';
import { InvoiceService } from '../invoice/invoice.service';
import {
  ListPaymentsQueryDto,
  PaymentResponseDto,
} from '../payment/payment.dto';
import { PaymentService } from '../payment/payment.service';
import {
  ListRefundsQueryDto,
  RefundResponseDto,
} from '../refund/refund.dto';
import { RefundService } from '../refund/refund.service';
import {
  BillingSettingsResponseDto,
} from '../settings/billing-settings.dto';
import { BillingSettingsService } from '../settings/billing-settings.service';

interface ListInvoicesEnvelope {
  readonly items: readonly InvoiceResponseDto[];
  readonly nextCursor: string | null;
}

interface ListPaymentsEnvelope {
  readonly items: readonly PaymentResponseDto[];
  readonly nextCursor: string | null;
}

interface ListRefundsEnvelope {
  readonly items: readonly RefundResponseDto[];
  readonly nextCursor: string | null;
}

@ApiTags('Self · Billing')
@ApiBearerAuth()
@Controller({ path: 'me/billing', version: '1' })
export class BillingSelfController {
  constructor(
    private readonly accountService: BillingAccountService,
    private readonly settingsService: BillingSettingsService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
  ) {}

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------

  @Get('account')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "Read the calling tenant's billing account." })
  @ApiOkResponse({ type: BillingAccountResponseDto })
  public async getAccount(): Promise<BillingAccountResponseDto> {
    const account = await this.resolveAccount();
    return BillingAccountResponseDto.from(account);
  }

  @Get('account/profile')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "Read the calling tenant's billing profile." })
  @ApiOkResponse({ type: BillingProfileResponseDto })
  public async getProfile(): Promise<BillingProfileResponseDto> {
    const account = await this.resolveAccount();
    const row = await this.accountService.getProfile(account.id);
    if (row === null) throw new BillingProfileNotFoundError(account.id);
    return BillingProfileResponseDto.from(row);
  }

  @Get('account/address')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "Read the calling tenant's billing address." })
  @ApiOkResponse({ type: BillingAddressResponseDto })
  public async getAddress(): Promise<BillingAddressResponseDto> {
    const account = await this.resolveAccount();
    const row = await this.accountService.getAddress(account.id);
    if (row === null) throw new BillingAccountNotFoundError(account.id);
    return BillingAddressResponseDto.from(row);
  }

  @Get('account/tax-details')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "Read the calling tenant's tax details." })
  @ApiOkResponse({ type: TaxDetailsResponseDto })
  public async getTaxDetails(): Promise<TaxDetailsResponseDto> {
    const account = await this.resolveAccount();
    const row = await this.accountService.getTaxDetails(account.id);
    if (row === null) throw new BillingAccountNotFoundError(account.id);
    return TaxDetailsResponseDto.from(row);
  }

  @Get('account/settings')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "Read the calling tenant's billing settings." })
  @ApiOkResponse({ type: BillingSettingsResponseDto })
  public async getSettings(): Promise<BillingSettingsResponseDto> {
    const account = await this.resolveAccount();
    return BillingSettingsResponseDto.from(
      await this.settingsService.getSettings(account.id),
    );
  }

  // ---------------------------------------------------------------------------
  // Invoices / Payments / Refunds — scoped to the calling tenant's schoolId
  // ---------------------------------------------------------------------------

  @Get('invoices')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "List the calling tenant's invoices." })
  public async listInvoices(
    @Query() query: ListInvoicesQueryDto,
  ): Promise<ListInvoicesEnvelope> {
    const schoolId = this.requireSchoolId();
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.invoiceService.list({
      limit,
      schoolId,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.fiscalYear !== undefined ? { fiscalYear: query.fiscalYear } : {}),
      ...(query.subscriptionId !== undefined
        ? { subscriptionId: query.subscriptionId }
        : {}),
      ...(query.dueBefore !== undefined
        ? { dueBefore: new Date(query.dueBefore) }
        : {}),
    });
    return {
      items: result.items.map(InvoiceResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get('invoices/:id')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: 'Read one invoice (scoped to the tenant).' })
  @ApiOkResponse({ type: InvoiceWithLinesResponseDto })
  public async getInvoice(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<InvoiceWithLinesResponseDto> {
    const schoolId = this.requireSchoolId();
    const { invoice, lines } = await this.invoiceService.getWithLines(id);
    if (invoice.schoolId !== schoolId) {
      throw new ForbiddenException('Invoice does not belong to the calling tenant.');
    }
    return InvoiceWithLinesResponseDto.from(invoice, lines);
  }

  @Get('payments')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "List the calling tenant's payments." })
  public async listPayments(
    @Query() query: ListPaymentsQueryDto,
  ): Promise<ListPaymentsEnvelope> {
    const schoolId = this.requireSchoolId();
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.paymentService.list({
      limit,
      schoolId,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.invoiceId !== undefined ? { invoiceId: query.invoiceId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.method !== undefined ? { method: query.method } : {}),
    });
    return {
      items: result.items.map(PaymentResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get('refunds')
  @RequirePermissions(BillingPermissions.SELF_READ)
  @ApiOperation({ summary: "List the calling tenant's refunds." })
  public async listRefunds(
    @Query() query: ListRefundsQueryDto,
  ): Promise<ListRefundsEnvelope> {
    const schoolId = this.requireSchoolId();
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.refundService.list({
      limit,
      schoolId,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.paymentId !== undefined ? { paymentId: query.paymentId } : {}),
      ...(query.invoiceId !== undefined ? { invoiceId: query.invoiceId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: result.items.map(RefundResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------
  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new ForbiddenException('Tenant context required for /me/billing.');
    }
    return ctx.schoolId;
  }

  private async resolveAccount(): ReturnType<
    BillingAccountService['getAccountBySchoolId']
  > {
    return this.accountService.getAccountBySchoolId(this.requireSchoolId());
  }
}
