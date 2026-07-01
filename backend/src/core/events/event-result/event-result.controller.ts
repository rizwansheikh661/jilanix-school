/**
 * EventResultController — `/events/{id}/results` routes.
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { EventsPermissions } from '../events.constants';
import {
  CreateEventResultDto,
  EventResultListQueryDto,
  EventResultListResponseDto,
  EventResultResponseDto,
  UpdateEventResultDto,
} from './event-result.dto';
import { EventResultService } from './event-result.service';

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'events/:eventId/results', version: '1' })
export class EventResultController {
  constructor(private readonly service: EventResultService) {}

  @Get()
  @RequirePermissions(EventsPermissions.RESULT_READ)
  @ApiOperation({ summary: 'List recorded results for an event.' })
  @ApiOkResponse({ type: EventResultListResponseDto })
  public async list(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: EventResultListQueryDto,
  ): Promise<EventResultListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      eventId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.position !== undefined ? { position: query.position } : {}),
      ...(query.participantId !== undefined
        ? { participantId: query.participantId }
        : {}),
    });
    return {
      items: items.map(EventResultResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(EventsPermissions.RESULT_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Record a result for a participant.' })
  @ApiCreatedResponse({ type: EventResultResponseDto })
  public async create(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: CreateEventResultDto,
  ): Promise<EventResultResponseDto> {
    const row = await this.service.create(eventId, {
      eventId,
      participantId: body.participantId,
      rank: body.rank ?? null,
      position: body.position,
      score: body.score ?? null,
      remark: body.remark ?? null,
      awardedAt: body.awardedAt !== undefined && body.awardedAt !== null
        ? new Date(body.awardedAt)
        : null,
    });
    return EventResultResponseDto.from(row);
  }

  @Patch(':resultId')
  @RequirePermissions(EventsPermissions.RESULT_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a recorded result.' })
  @ApiOkResponse({ type: EventResultResponseDto })
  public async update(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('resultId', new ParseUUIDPipe()) resultId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateEventResultDto,
  ): Promise<EventResultResponseDto> {
    const row = await this.service.update(eventId, resultId, parseIfMatch(ifMatch), {
      ...(body.rank !== undefined ? { rank: body.rank } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.score !== undefined ? { score: body.score } : {}),
      ...(body.remark !== undefined ? { remark: body.remark } : {}),
      ...(body.awardedAt !== undefined
        ? { awardedAt: body.awardedAt === null ? null : new Date(body.awardedAt) }
        : {}),
    });
    return EventResultResponseDto.from(row);
  }

  @Delete(':resultId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(EventsPermissions.RESULT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a recorded result.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('resultId', new ParseUUIDPipe()) resultId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(eventId, resultId, parseIfMatch(ifMatch));
  }
}
