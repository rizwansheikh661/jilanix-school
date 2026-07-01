/**
 * Timeline routes — `/api/v1/comms-center/messages/:id/timeline`.
 */
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CommunicationCenterPermissions } from '../communication-center.constants';
import { TimelineResponseDto } from './timeline.dto';
import {
  type MessageTimeline,
  TimelineService,
} from './timeline.service';

@ApiTags('Communication Center')
@ApiBearerAuth()
@Controller('api/v1/comms-center/messages')
export class TimelineController {
  constructor(private readonly service: TimelineService) {}

  @Get(':id/timeline')
  @RequirePermissions(CommunicationCenterPermissions.TIMELINE_READ)
  @ApiOperation({
    summary: 'Read the per-message lifecycle timeline.',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: TimelineResponseDto })
  @ApiNotFoundResponse()
  public async getTimeline(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TimelineResponseDto> {
    const t = await this.service.getTimeline(id);
    return toResponse(t);
  }
}

function toResponse(t: MessageTimeline): TimelineResponseDto {
  return {
    message: {
      id: t.message.id,
      channel: t.message.channel,
      status: t.message.status,
      recipientUserId: t.message.recipientUserId,
      recipientAudience: t.message.recipientAudience,
      eventKey: t.message.eventKey,
      campaignId: t.message.campaignId,
      aggregateType: t.message.aggregateType,
      aggregateId: t.message.aggregateId,
      createdAt: t.message.createdAt.toISOString(),
      sentAt: t.message.sentAt?.toISOString() ?? null,
      deliveredAt: t.message.deliveredAt?.toISOString() ?? null,
      readAt: t.message.readAt?.toISOString() ?? null,
      failedAt: t.message.failedAt?.toISOString() ?? null,
    },
    events: t.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      occurredAt: e.occurredAt.toISOString(),
      providerCode: e.providerCode,
      providerMessageId: e.providerMessageId,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
      metadata: e.metadata,
    })),
  };
}
