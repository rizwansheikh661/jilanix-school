/**
 * EventController — `/events` lifecycle routes.
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
  Patch,
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
import { EventsPermissions } from '../events.constants';
import {
  CancelEventDto,
  CreateEventDto,
  EventListQueryDto,
  EventListResponseDto,
  EventResponseDto,
  UpdateEventDto,
} from './event.dto';
import { EventService } from './event.service';

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'events', version: '1' })
export class EventController {
  constructor(private readonly service: EventService) {}

  @Get()
  @RequirePermissions(EventsPermissions.EVENT_READ)
  @ApiOperation({ summary: 'List events (cursor paginated).' })
  @ApiOkResponse({ type: EventListResponseDto })
  public async list(
    @Query() query: EventListQueryDto,
  ): Promise<EventListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.eventType !== undefined ? { eventType: query.eventType } : {}),
      ...(query.category !== undefined ? { category: query.category } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    });
    return {
      items: items.map(EventResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(EventsPermissions.EVENT_READ)
  @ApiOperation({ summary: 'Get an event by id (header + counts).' })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(EventsPermissions.EVENT_CREATE)
  @ApiOperation({ summary: 'Create a DRAFT event.' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiCreatedResponse({ type: EventResponseDto })
  public async create(@Body() body: CreateEventDto): Promise<EventResponseDto> {
    const row = await this.service.create({
      ...(body.code !== undefined ? { code: body.code } : {}),
      name: body.name,
      description: body.description ?? null,
      eventType: body.eventType,
      category: body.category,
      subType: body.subType ?? null,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      startTime: body.startTime ? parseHHMM(body.startDate, body.startTime) : null,
      endTime: body.endTime ? parseHHMM(body.startDate, body.endTime) : null,
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      branchId: body.branchId ?? null,
      venue: body.venue ?? null,
      organizerStaffId: body.organizerStaffId ?? null,
      ...(body.registrationType !== undefined
        ? { registrationType: body.registrationType }
        : {}),
      registrationCapacity: body.registrationCapacity ?? null,
      ...(body.isFree !== undefined ? { isFree: body.isFree } : {}),
      feeHeadId: body.feeHeadId ?? null,
      feeStructureId: body.feeStructureId ?? null,
      feeAmount: body.feeAmount ?? null,
      estimatedCost: body.estimatedCost ?? null,
      actualCost: body.actualCost ?? null,
      sponsorshipAmount: body.sponsorshipAmount ?? null,
    });
    return EventResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(EventsPermissions.EVENT_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update an event (free in DRAFT; schedule-only post-publish).' })
  @ApiOkResponse({ type: EventResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateEventDto,
  ): Promise<EventResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.eventType !== undefined ? { eventType: body.eventType } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.subType !== undefined ? { subType: body.subType } : {}),
      ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
      ...(body.endDate !== undefined ? { endDate: new Date(body.endDate) } : {}),
      ...(body.startTime !== undefined
        ? {
            startTime: body.startTime
              ? parseHHMM(body.startDate ?? '1970-01-01', body.startTime)
              : null,
          }
        : {}),
      ...(body.endTime !== undefined
        ? {
            endTime: body.endTime
              ? parseHHMM(body.startDate ?? '1970-01-01', body.endTime)
              : null,
          }
        : {}),
      ...(body.venue !== undefined ? { venue: body.venue } : {}),
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      ...(body.organizerStaffId !== undefined
        ? { organizerStaffId: body.organizerStaffId }
        : {}),
      ...(body.registrationType !== undefined
        ? { registrationType: body.registrationType }
        : {}),
      ...(body.registrationCapacity !== undefined
        ? { registrationCapacity: body.registrationCapacity }
        : {}),
      ...(body.isFree !== undefined ? { isFree: body.isFree } : {}),
      ...(body.feeHeadId !== undefined ? { feeHeadId: body.feeHeadId } : {}),
      ...(body.feeStructureId !== undefined
        ? { feeStructureId: body.feeStructureId }
        : {}),
      ...(body.feeAmount !== undefined ? { feeAmount: body.feeAmount } : {}),
      ...(body.estimatedCost !== undefined ? { estimatedCost: body.estimatedCost } : {}),
      ...(body.actualCost !== undefined ? { actualCost: body.actualCost } : {}),
      ...(body.sponsorshipAmount !== undefined
        ? { sponsorshipAmount: body.sponsorshipAmount }
        : {}),
    });
    return EventResponseDto.from(row);
  }

  @Post(':id/schedule')
  @RequirePermissions(EventsPermissions.EVENT_SCHEDULE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Transition DRAFT → SCHEDULED.' })
  @ApiOkResponse({ type: EventResponseDto })
  public async schedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(
      await this.service.schedule(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/publish')
  @RequirePermissions(EventsPermissions.EVENT_PUBLISH)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Transition SCHEDULED → PUBLISHED; dispatches EVENT_PUBLISHED notification.',
  })
  @ApiOkResponse({ type: EventResponseDto })
  public async publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(
      await this.service.publish(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/start')
  @RequirePermissions(EventsPermissions.EVENT_START)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Transition PUBLISHED → ONGOING.' })
  @ApiOkResponse({ type: EventResponseDto })
  public async start(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(
      await this.service.start(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/complete')
  @RequirePermissions(EventsPermissions.EVENT_COMPLETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Transition ONGOING → COMPLETED.' })
  @ApiOkResponse({ type: EventResponseDto })
  public async complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(
      await this.service.complete(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions(EventsPermissions.EVENT_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Cancel from any non-terminal state; cancels participants + voids open fee assignments; dispatches EVENT_CANCELLED.',
  })
  @ApiOkResponse({ type: EventResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelEventDto,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(
      await this.service.cancel(id, parseIfMatch(ifMatch), body.reason ?? null),
    );
  }

  @Post(':id/registration/open')
  @RequirePermissions(EventsPermissions.EVENT_OPEN_REGISTRATION)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Open the registration window; dispatches EVENT_REGISTRATION_OPENED.' })
  @ApiOkResponse({ type: EventResponseDto })
  public async openRegistration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(
      await this.service.openRegistration(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/registration/close')
  @RequirePermissions(EventsPermissions.EVENT_CLOSE_REGISTRATION)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Close the registration window; dispatches EVENT_REGISTRATION_CLOSED.' })
  @ApiOkResponse({ type: EventResponseDto })
  public async closeRegistration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EventResponseDto> {
    return EventResponseDto.from(
      await this.service.closeRegistration(id, parseIfMatch(ifMatch)),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(EventsPermissions.EVENT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete an event (refused if PUBLISHED/ONGOING — cancel first).',
  })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }
}

/** Combine an ISO date + HH:MM into a Date used by the @db.Time column. */
function parseHHMM(dateIso: string, hhmm: string): Date {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (m === null) {
    throw new Error(`Invalid HH:MM time string "${hhmm}".`);
  }
  const date = new Date(`${dateIso}T${hhmm}:00.000Z`);
  return date;
}
