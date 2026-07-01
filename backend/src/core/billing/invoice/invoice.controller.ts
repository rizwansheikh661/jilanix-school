/**
 * InvoiceController — platform-admin invoice CRUD + FSM operations.
 *
 * Routes mount under `/v1/platform/billing/invoices[*]`:
 *   GET    /                       — list invoices (cursor-paginated)
 *   GET    /:id                    — read invoice + lines
 *   GET    /:id/history            — read invoice history rows
 *   POST   /                       — create DRAFT invoice
 *   POST   /:id/issue              — DRAFT → PENDING (If-Match required)
 *   POST   /:id/void               — any → VOID (If-Match required)
 *   POST   /:id/write-off          — any → WRITTEN_OFF (If-Match required)
 *   POST   /:id/mark-overdue       — PENDING/PARTIALLY_PAID → OVERDUE (If-Match)
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
  CreateInvoiceDraftDto,
  InvoiceHistoryResponseDto,
  InvoiceResponseDto,
  InvoiceWithLinesResponseDto,
  IssueInvoiceDto,
  ListInvoicesQueryDto,
  VoidInvoiceDto,
  WriteOffInvoiceDto,
} from './invoice.dto';
import { InvoiceService } from './invoice.service';

interface ListInvoicesEnvelope {
  readonly items: readonly InvoiceResponseDto[];
  readonly nextCursor: string | null;
}

@ApiTags('Platform Admin · Invoices')
@ApiBearerAuth()
@Controller({ path: 'platform/billing/invoices', version: '1' })
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get()
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiOperation({ summary: 'List invoices (cursor-paginated).' })
  public async list(
    @Query() query: ListInvoicesQueryDto,
  ): Promise<ListInvoicesEnvelope> {
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.service.list({
      limit,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
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

  @Get(':id')
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiOperation({ summary: 'Read an invoice with its lines.' })
  @ApiOkResponse({ type: InvoiceWithLinesResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<InvoiceWithLinesResponseDto> {
    const { invoice, lines } = await this.service.getWithLines(id);
    return InvoiceWithLinesResponseDto.from(invoice, lines);
  }

  @Get(':id/history')
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiOperation({ summary: 'Read the history rows for an invoice.' })
  public async history(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<readonly InvoiceHistoryResponseDto[]> {
    const rows = await this.service.listHistory(id);
    return rows.map(InvoiceHistoryResponseDto.from);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiOperation({ summary: 'Create a DRAFT invoice with line items.' })
  @ApiOkResponse({ type: InvoiceWithLinesResponseDto })
  public async create(
    @Body() body: CreateInvoiceDraftDto,
  ): Promise<InvoiceWithLinesResponseDto> {
    const { invoice, lines } = await this.service.createDraft({
      accountId: body.accountId,
      schoolId: body.schoolId,
      fiscalYear: body.fiscalYear,
      lines: body.lines.map((l) => ({
        lineType: l.lineType,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        ...(l.taxCode !== undefined ? { taxCode: l.taxCode } : {}),
        ...(l.taxRate !== undefined ? { taxRate: l.taxRate } : {}),
        ...(l.taxAmount !== undefined ? { taxAmount: l.taxAmount } : {}),
        ...(l.metadata !== undefined ? { metadata: l.metadata } : {}),
        ...(l.sortOrder !== undefined ? { sortOrder: l.sortOrder } : {}),
      })),
      ...(body.subscriptionId !== undefined
        ? { subscriptionId: body.subscriptionId }
        : {}),
      ...(body.billingCycle !== undefined
        ? { billingCycle: body.billingCycle }
        : {}),
      ...(body.periodStart !== undefined && body.periodStart !== null
        ? { periodStart: new Date(body.periodStart) }
        : {}),
      ...(body.periodEnd !== undefined && body.periodEnd !== null
        ? { periodEnd: new Date(body.periodEnd) }
        : {}),
      ...(body.dueDate !== undefined && body.dueDate !== null
        ? { dueDate: new Date(body.dueDate) }
        : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    return InvoiceWithLinesResponseDto.from(invoice, lines);
  }

  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Issue a DRAFT invoice (DRAFT → PENDING).' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  public async issue(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: IssueInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    const updated = await this.service.issue({
      invoiceId: id,
      expectedVersion: parseIfMatch(ifMatch),
      ...(body.issuedAt !== undefined && body.issuedAt !== null
        ? { issuedAt: new Date(body.issuedAt) }
        : {}),
      ...(body.dueDate !== undefined && body.dueDate !== null
        ? { dueDate: new Date(body.dueDate) }
        : {}),
    });
    return InvoiceResponseDto.from(updated);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Void an invoice.' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  public async void(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: VoidInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    const updated = await this.service.void(id, parseIfMatch(ifMatch), body.reason);
    return InvoiceResponseDto.from(updated);
  }

  @Post(':id/write-off')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Write off an invoice.' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  public async writeOff(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: WriteOffInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    const updated = await this.service.writeOff(
      id,
      parseIfMatch(ifMatch),
      body.reason,
    );
    return InvoiceResponseDto.from(updated);
  }

  @Post(':id/mark-overdue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.INVOICE_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Mark a PENDING/PARTIALLY_PAID invoice as OVERDUE.' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  public async markOverdue(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<InvoiceResponseDto> {
    const updated = await this.service.markOverdue(id, parseIfMatch(ifMatch));
    return InvoiceResponseDto.from(updated);
  }
}
