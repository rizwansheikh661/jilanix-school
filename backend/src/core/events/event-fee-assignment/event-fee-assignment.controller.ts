/**
 * EventFeeAssignmentController — `/events/{id}/fee-assignments` routes.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
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
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { EventsPermissions } from '../events.constants';
import {
  EventFeeAssignmentListQueryDto,
  EventFeeAssignmentListResponseDto,
  EventFeeAssignmentResponseDto,
  GenerateInvoicesResponseDto,
  VoidFeeAssignmentDto,
} from './event-fee-assignment.dto';
import { EventFeeAssignmentService } from './event-fee-assignment.service';

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'events/:eventId/fee-assignments', version: '1' })
export class EventFeeAssignmentController {
  constructor(private readonly service: EventFeeAssignmentService) {}

  @Get()
  @RequirePermissions(EventsPermissions.FEE_ASSIGNMENT_READ)
  @ApiOperation({ summary: 'List fee assignments for an event.' })
  @ApiOkResponse({ type: EventFeeAssignmentListResponseDto })
  public async list(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: EventFeeAssignmentListQueryDto,
  ): Promise<EventFeeAssignmentListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      eventId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: items.map(EventFeeAssignmentResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post('generate-invoices')
  @RequirePermissions(EventsPermissions.FEE_ASSIGNMENT_GENERATE_INVOICES)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary:
      'Batch-generate FeeInvoices for PENDING assignments (flag-gated, batched).',
  })
  @ApiOkResponse({ type: GenerateInvoicesResponseDto })
  public async generateInvoices(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<GenerateInvoicesResponseDto> {
    const { invoiced, skipped, invoiceIds } =
      await this.service.generateInvoices(eventId);
    return GenerateInvoicesResponseDto.of(invoiced, skipped, invoiceIds);
  }

  @Post(':assignmentId/void')
  @RequirePermissions(EventsPermissions.FEE_ASSIGNMENT_VOID)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Void a PENDING fee assignment. Refused for INVOICED rows (void the invoice via fees module first).',
  })
  @ApiOkResponse({ type: EventFeeAssignmentResponseDto })
  public async voidAssignment(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: VoidFeeAssignmentDto,
  ): Promise<EventFeeAssignmentResponseDto> {
    const row = await this.service.voidAssignment(
      eventId,
      assignmentId,
      parseIfMatch(ifMatch),
      body.reason ?? null,
    );
    return EventFeeAssignmentResponseDto.from(row);
  }
}
