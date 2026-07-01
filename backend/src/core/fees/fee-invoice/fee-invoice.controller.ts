/**
 * FeeInvoiceController — `/fees/invoices` routes.
 *
 * Endpoints:
 *   GET    /api/v1/fees/invoices                 — list (cursor + filters)
 *   GET    /api/v1/fees/invoices/:id             — get one (with lines + computedFine)
 *   POST   /api/v1/fees/invoices/generate        — bulk-generate per scope
 *   POST   /api/v1/fees/invoices/:id/recompute   — refresh lines + totals
 *   POST   /api/v1/fees/invoices/:id/apply-fines — append late-fine line
 *   POST   /api/v1/fees/invoices/:id/void        — mark VOID (no payments)
 *   DELETE /api/v1/fees/invoices/:id             — soft-delete (DRAFT only)
 */
import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { FeesPermissions } from '../fees.constants';
import {
  FeeInvoiceGenerateResponseDto,
  FeeInvoiceListQueryDto,
  FeeInvoiceListResponseDto,
  FeeInvoiceResponseDto,
  GenerateFeeInvoicesDto,
} from './fee-invoice.dto';
import { FeeInvoiceService } from './fee-invoice.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/invoices', version: '1' })
export class FeeInvoiceController {
  constructor(private readonly service: FeeInvoiceService) {}

  @Get()
  @RequirePermissions(FeesPermissions.INVOICE_READ)
  @ApiOperation({ summary: 'List fee invoices (cursor paginated; filterable).' })
  @ApiOkResponse({ type: FeeInvoiceListResponseDto })
  public async list(
    @Query() query: FeeInvoiceListQueryDto,
  ): Promise<FeeInvoiceListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
      ...(query.academicYearId !== undefined
        ? { academicYearId: query.academicYearId }
        : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.periodFrom !== undefined
        ? { periodFrom: new Date(query.periodFrom) }
        : {}),
      ...(query.periodTo !== undefined
        ? { periodTo: new Date(query.periodTo) }
        : {}),
    });
    return {
      items: items.map(FeeInvoiceResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.INVOICE_READ)
  @ApiOperation({ summary: 'Get a fee invoice by id with its lines and computed fine.' })
  @ApiOkResponse({ type: FeeInvoiceResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeeInvoiceResponseDto> {
    return FeeInvoiceResponseDto.from(await this.service.getById(id));
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(FeesPermissions.INVOICE_GENERATE)
  @ApiOperation({
    summary:
      'Generate invoices for a fee structure scope (students | class | section).',
  })
  @ApiCreatedResponse({ type: FeeInvoiceGenerateResponseDto })
  public async generate(
    @Body() body: GenerateFeeInvoicesDto,
  ): Promise<FeeInvoiceGenerateResponseDto> {
    const result = await this.service.generate({
      structureId: body.structureId,
      periodFrom: new Date(body.period.from),
      periodTo: new Date(body.period.to),
      issueDate: new Date(body.issueDate),
      dueDate: new Date(body.dueDate),
      scope: body.scope,
      ...(body.studentIds !== undefined ? { studentIds: body.studentIds } : {}),
      ...(body.classId !== undefined ? { classId: body.classId } : {}),
      ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    return FeeInvoiceGenerateResponseDto.build(
      result.generated,
      result.skipped,
      result.invoices.map(FeeInvoiceResponseDto.from),
    );
  }

  @Post(':id/recompute')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.INVOICE_RECOMPUTE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Recompute non-fine lines from the source structure; flips DRAFT to SENT.',
  })
  @ApiOkResponse({ type: FeeInvoiceResponseDto })
  @ApiNotFoundResponse()
  public async recompute(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FeeInvoiceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return FeeInvoiceResponseDto.from(
      await this.service.recompute(id, expectedVersion),
    );
  }

  @Post(':id/apply-fines')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.INVOICE_APPLY_FINES)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Append a single late-fine line using the active fine policy (refuses if any fine line exists).',
  })
  @ApiOkResponse({ type: FeeInvoiceResponseDto })
  @ApiNotFoundResponse()
  public async applyFines(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FeeInvoiceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return FeeInvoiceResponseDto.from(
      await this.service.applyFines(id, expectedVersion),
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.INVOICE_VOID)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Void an invoice (refused if any payment exists).' })
  @ApiOkResponse({ type: FeeInvoiceResponseDto })
  @ApiNotFoundResponse()
  public async voidOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FeeInvoiceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return FeeInvoiceResponseDto.from(
      await this.service.voidInvoice(id, expectedVersion),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeesPermissions.INVOICE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a DRAFT fee invoice.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}
