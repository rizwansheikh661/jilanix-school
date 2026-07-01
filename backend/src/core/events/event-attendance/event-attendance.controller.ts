/**
 * EventAttendanceController — `/events/{id}/attendance` routes.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { EventsPermissions } from '../events.constants';
import {
  BulkMarkAttendanceDto,
  BulkMarkResponseDto,
  EventAttendanceListQueryDto,
  EventAttendanceListResponseDto,
  EventAttendanceResponseDto,
  MarkAttendanceDto,
} from './event-attendance.dto';
import { EventAttendanceService } from './event-attendance.service';

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'events/:eventId/attendance', version: '1' })
export class EventAttendanceController {
  constructor(private readonly service: EventAttendanceService) {}

  @Get()
  @RequirePermissions(EventsPermissions.ATTENDANCE_READ)
  @ApiOperation({
    summary:
      'List attendance ledger rows for an event (cursor paginated; raw ledger).',
  })
  @ApiOkResponse({ type: EventAttendanceListResponseDto })
  public async list(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: EventAttendanceListQueryDto,
  ): Promise<EventAttendanceListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      eventId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.participantId !== undefined
        ? { participantId: query.participantId }
        : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: items.map(EventAttendanceResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get('latest')
  @RequirePermissions(EventsPermissions.ATTENDANCE_READ)
  @ApiOperation({
    summary:
      'Latest attendance row per participant (aggregated; latest-row-wins).',
  })
  @ApiOkResponse({ type: [EventAttendanceResponseDto] })
  public async latest(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<readonly EventAttendanceResponseDto[]> {
    const rows = await this.service.listLatestPerParticipant(eventId);
    return rows.map(EventAttendanceResponseDto.from);
  }

  @Post('mark')
  @RequirePermissions(EventsPermissions.ATTENDANCE_MARK)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Append an attendance row for a single participant (MANUAL only).',
  })
  @ApiCreatedResponse({ type: EventAttendanceResponseDto })
  public async mark(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: MarkAttendanceDto,
  ): Promise<EventAttendanceResponseDto> {
    const row = await this.service.mark({
      eventId,
      participantId: body.participantId,
      status: body.status,
      method: body.method ?? 'MANUAL',
      ...(body.occurredAt !== undefined
        ? { occurredAt: new Date(body.occurredAt) }
        : {}),
      deviceRef: body.deviceRef ?? null,
      notes: body.notes ?? null,
    });
    return EventAttendanceResponseDto.from(row);
  }

  @Post('mark-bulk')
  @RequirePermissions(EventsPermissions.ATTENDANCE_MARK_BULK)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary:
      'Append attendance rows for a batch of participants in a single tx.',
  })
  @ApiOkResponse({ type: BulkMarkResponseDto })
  public async markBulk(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: BulkMarkAttendanceDto,
  ): Promise<BulkMarkResponseDto> {
    const entries = body.entries.map((e) => ({
      participantId: e.participantId,
      status: e.status,
      method: e.method ?? 'MANUAL',
      ...(e.occurredAt !== undefined ? { occurredAt: new Date(e.occurredAt) } : {}),
      deviceRef: e.deviceRef ?? null,
      notes: e.notes ?? null,
    }));
    const { marked, skipped } = await this.service.markBulk(eventId, entries);
    return BulkMarkResponseDto.of(marked, skipped);
  }
}
