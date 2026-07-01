/**
 * EventParticipantController — `/events/{id}/participants` routes.
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { EventsPermissions } from '../events.constants';
import {
  BulkRegisterClassDto,
  BulkRegisterResponseDto,
  BulkRegisterSectionDto,
  CancelParticipantDto,
  EventParticipantListQueryDto,
  EventParticipantListResponseDto,
  EventParticipantResponseDto,
  RegisterParticipantDto,
  RejectParticipantDto,
} from './event-participant.dto';
import { EventParticipantService } from './event-participant.service';

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'events/:eventId/participants', version: '1' })
export class EventParticipantController {
  constructor(private readonly service: EventParticipantService) {}

  @Get()
  @RequirePermissions(EventsPermissions.PARTICIPANT_READ)
  @ApiOperation({ summary: 'List participants for an event (cursor paginated).' })
  @ApiOkResponse({ type: EventParticipantListResponseDto })
  public async list(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: EventParticipantListQueryDto,
  ): Promise<EventParticipantListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      eventId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.audience !== undefined ? { audience: query.audience } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: items.map(EventParticipantResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(EventsPermissions.PARTICIPANT_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Register a single participant for an event.' })
  @ApiCreatedResponse({ type: EventParticipantResponseDto })
  public async register(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: RegisterParticipantDto,
  ): Promise<EventParticipantResponseDto> {
    const row = await this.service.register({
      eventId,
      audience: body.audience,
      userId: body.userId,
      studentId: body.studentId ?? null,
      staffId: body.staffId ?? null,
      classId: body.classId ?? null,
      sectionId: body.sectionId ?? null,
    });
    return EventParticipantResponseDto.from(row);
  }

  @Post('bulk-class')
  @RequirePermissions(EventsPermissions.PARTICIPANT_BULK_REGISTER)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Bulk-register all active students of a class.' })
  @ApiOkResponse({ type: BulkRegisterResponseDto })
  public async bulkRegisterClass(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: BulkRegisterClassDto,
  ): Promise<BulkRegisterResponseDto> {
    const { registered, skipped } = await this.service.bulkRegisterClass(
      eventId,
      body.classId,
      body.audience ?? 'STUDENT',
    );
    return BulkRegisterResponseDto.of(registered, skipped);
  }

  @Post('bulk-section')
  @RequirePermissions(EventsPermissions.PARTICIPANT_BULK_REGISTER)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Bulk-register all active students of a section.' })
  @ApiOkResponse({ type: BulkRegisterResponseDto })
  public async bulkRegisterSection(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: BulkRegisterSectionDto,
  ): Promise<BulkRegisterResponseDto> {
    const { registered, skipped } = await this.service.bulkRegisterSection(
      eventId,
      body.sectionId,
      body.audience ?? 'STUDENT',
    );
    return BulkRegisterResponseDto.of(registered, skipped);
  }

  @Post(':participantId/approve')
  @RequirePermissions(EventsPermissions.PARTICIPANT_APPROVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Approve a PENDING participant (APPROVAL_REQUIRED flow).' })
  @ApiOkResponse({ type: EventParticipantResponseDto })
  public async approve(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EventParticipantResponseDto> {
    return EventParticipantResponseDto.from(
      await this.service.approve(eventId, participantId, parseIfMatch(ifMatch)),
    );
  }

  @Post(':participantId/reject')
  @RequirePermissions(EventsPermissions.PARTICIPANT_REJECT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reject a PENDING participant.' })
  @ApiOkResponse({ type: EventParticipantResponseDto })
  public async reject(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectParticipantDto,
  ): Promise<EventParticipantResponseDto> {
    return EventParticipantResponseDto.from(
      await this.service.reject(
        eventId,
        participantId,
        parseIfMatch(ifMatch),
        body.reason ?? null,
      ),
    );
  }

  @Delete(':participantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(EventsPermissions.PARTICIPANT_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Cancel + soft-delete a participant; decrements event.registeredCount.',
  })
  @ApiNoContentResponse()
  public async cancel(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelParticipantDto,
  ): Promise<void> {
    await this.service.cancel(
      eventId,
      participantId,
      parseIfMatch(ifMatch),
      body.reason ?? null,
    );
  }
}
