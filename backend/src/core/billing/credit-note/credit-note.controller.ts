/**
 * CreditNoteController — platform-admin endpoints for credit notes + standalone
 * adjustments.
 *
 * Routes mount under `/v1/platform/billing[*]`:
 *   GET    /credit-notes                       — list credit notes
 *   GET    /credit-notes/:id                   — read a single credit note
 *   POST   /credit-notes                       — issue a credit note
 *   POST   /credit-notes/:id/apply             — apply a credit note (If-Match)
 *   POST   /credit-notes/:id/void              — void a credit note (If-Match)
 *
 *   GET    /adjustments                        — list adjustments
 *   GET    /adjustments/:id                    — read a single adjustment
 *   POST   /adjustments                        — create a standalone adjustment
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
  NotFoundException,
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
  AdjustmentResponseDto,
  ApplyCreditNoteDto,
  CreateAdjustmentDto,
  CreditNoteResponseDto,
  IssueCreditNoteDto,
  ListAdjustmentsQueryDto,
  ListCreditNotesQueryDto,
  VoidCreditNoteDto,
} from './credit-note.dto';
import { CreditNoteService } from './credit-note.service';

interface ListCreditNotesEnvelope {
  readonly items: readonly CreditNoteResponseDto[];
  readonly nextCursor: string | null;
}

interface ListAdjustmentsEnvelope {
  readonly items: readonly AdjustmentResponseDto[];
  readonly nextCursor: string | null;
}

@ApiTags('Platform Admin · Credit Notes & Adjustments')
@ApiBearerAuth()
@Controller({ path: 'platform/billing', version: '1' })
export class CreditNoteController {
  constructor(private readonly service: CreditNoteService) {}

  // ---------------------------------------------------------------------------
  // Credit notes
  // ---------------------------------------------------------------------------
  @Get('credit-notes')
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'List credit notes (cursor-paginated).' })
  public async listCreditNotes(
    @Query() query: ListCreditNotesQueryDto,
  ): Promise<ListCreditNotesEnvelope> {
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.service.listCreditNotes({
      limit,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: result.items.map(CreditNoteResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get('credit-notes/:id')
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'Read a single credit note.' })
  @ApiOkResponse({ type: CreditNoteResponseDto })
  public async getCreditNote(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CreditNoteResponseDto> {
    return CreditNoteResponseDto.from(await this.service.getCreditNote(id));
  }

  @Post('credit-notes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'Issue a credit note (ISSUED).' })
  @ApiOkResponse({ type: CreditNoteResponseDto })
  public async issueCreditNote(
    @Body() body: IssueCreditNoteDto,
  ): Promise<CreditNoteResponseDto> {
    const created = await this.service.issue({
      accountId: body.accountId,
      amount: body.amount,
      reason: body.reason,
      ...(body.invoiceId !== undefined ? { invoiceId: body.invoiceId } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
    });
    return CreditNoteResponseDto.from(created);
  }

  @Post('credit-notes/:id/apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Apply a credit note to an invoice (ISSUED → APPLIED).' })
  @ApiOkResponse({ type: CreditNoteResponseDto })
  public async applyCreditNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ApplyCreditNoteDto,
  ): Promise<CreditNoteResponseDto> {
    const updated = await this.service.apply(
      id,
      parseIfMatch(ifMatch),
      body.targetInvoiceId,
    );
    return CreditNoteResponseDto.from(updated);
  }

  @Post('credit-notes/:id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Void a credit note.' })
  @ApiOkResponse({ type: CreditNoteResponseDto })
  public async voidCreditNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: VoidCreditNoteDto,
  ): Promise<CreditNoteResponseDto> {
    const updated = await this.service.void(
      id,
      parseIfMatch(ifMatch),
      body.reason,
    );
    return CreditNoteResponseDto.from(updated);
  }

  // ---------------------------------------------------------------------------
  // Adjustments
  // ---------------------------------------------------------------------------
  @Get('adjustments')
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'List adjustments (cursor-paginated).' })
  public async listAdjustments(
    @Query() query: ListAdjustmentsQueryDto,
  ): Promise<ListAdjustmentsEnvelope> {
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.service.listAdjustments({
      limit,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
    });
    return {
      items: result.items.map(AdjustmentResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get('adjustments/:id')
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'Read a single adjustment.' })
  @ApiOkResponse({ type: AdjustmentResponseDto })
  public async getAdjustment(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdjustmentResponseDto> {
    const row = await this.service.getAdjustment(id);
    if (row === null) {
      throw new NotFoundException(`Adjustment ${id} not found.`);
    }
    return AdjustmentResponseDto.from(row);
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.REFUND_MANAGE)
  @ApiOperation({ summary: 'Create a standalone CREDIT/DEBIT adjustment.' })
  @ApiOkResponse({ type: AdjustmentResponseDto })
  public async createAdjustment(
    @Body() body: CreateAdjustmentDto,
  ): Promise<AdjustmentResponseDto> {
    const created = await this.service.createAdjustment({
      accountId: body.accountId,
      kind: body.kind,
      amount: body.amount,
      reason: body.reason,
      ...(body.invoiceId !== undefined ? { invoiceId: body.invoiceId } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
    });
    return AdjustmentResponseDto.from(created);
  }
}
