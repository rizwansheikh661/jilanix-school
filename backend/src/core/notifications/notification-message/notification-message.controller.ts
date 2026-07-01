/**
 * NotificationMessageController — `/api/v1/notifications/messages` routes
 * (Sprint 10 Wave 8). Cancel requires `If-Match`; send-test relies on the
 * global `Idempotency-Key` middleware. Permissions enforced via
 * `@RequirePermissions`.
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
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { NotificationsPermissions } from '../notifications.constants';
import type {
  NotificationMessageEventRow,
  NotificationMessageRow,
  NotificationMessageWithEvents,
} from '../notifications.types';
import {
  ListNotificationMessagesQueryDto,
  NotificationMessageEventResponseDto,
  NotificationMessageListResponseDto,
  NotificationMessageResponseDto,
  SendTestNotificationDto,
} from './notification-message.dto';
import { NotificationMessageService } from './notification-message.service';

const LIST_DEFAULT_LIMIT = 50;

@ApiTags('Notification Messages')
@ApiBearerAuth()
@Controller('api/v1/notifications/messages')
export class NotificationMessageController {
  constructor(private readonly service: NotificationMessageService) {}

  @Get()
  @RequirePermissions(NotificationsPermissions.MESSAGE_READ)
  @ApiOperation({
    summary:
      'List notification messages with optional filters (cursor paginated).',
  })
  @ApiOkResponse({ type: NotificationMessageListResponseDto })
  public async list(
    @Query() query: ListNotificationMessagesQueryDto,
  ): Promise<NotificationMessageListResponseDto> {
    const { items, nextCursor } = await this.service.list({
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.recipientUserId !== undefined
        ? { recipientUserId: query.recipientUserId }
        : {}),
      ...(query.eventKey !== undefined ? { eventKey: query.eventKey } : {}),
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return {
      items: items.map((row) => toMessageResponse(row)),
      nextCursor,
    };
  }

  @Get(':id')
  @RequirePermissions(NotificationsPermissions.MESSAGE_READ)
  @ApiOperation({
    summary: 'Get a single notification message with its delivery event log.',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: NotificationMessageResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NotificationMessageResponseDto> {
    const row = await this.service.getById(id);
    return toMessageResponseWithEvents(row);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(NotificationsPermissions.MESSAGE_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary:
      'Cancel a QUEUED notification message; refused once SENDING/SENT/etc.',
  })
  @ApiOkResponse({ type: NotificationMessageResponseDto })
  @ApiNotFoundResponse()
  @ApiResponse({ status: 409, description: 'Version conflict (stale If-Match).' })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<NotificationMessageResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.cancel(id, expectedVersion);
    return toMessageResponse(row);
  }

  @Post('send-test')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(NotificationsPermissions.MESSAGE_SEND_TEST)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Recommended. Enforced by the global Idempotency-Key middleware.',
  })
  @ApiOperation({
    summary:
      'Render a template against an ad-hoc payload and enqueue a single test message.',
  })
  @ApiCreatedResponse({ type: NotificationMessageResponseDto })
  public async sendTest(
    @Body() body: SendTestNotificationDto,
  ): Promise<NotificationMessageResponseDto> {
    const row = await this.service.sendTest({
      templateId: body.templateId,
      payload: body.payload,
      ...(body.recipientUserId !== undefined
        ? { recipientUserId: body.recipientUserId }
        : {}),
    });
    return toMessageResponse(row);
  }
}

function toMessageResponse(
  row: NotificationMessageRow,
): NotificationMessageResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    messageNo: row.messageNo,
    recipientUserId: row.recipientUserId,
    recipientAudience: row.recipientAudience,
    recipientAddress: row.recipientAddress,
    channel: row.channel,
    category: row.category,
    priority: row.priority,
    notificationTemplateId: row.notificationTemplateId,
    templateVersionNo: row.templateVersionNo,
    eventKey: row.eventKey,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    campaignId: row.campaignId,
    subjectRendered: row.subjectRendered,
    bodyRendered: row.bodyRendered,
    dataPayload: row.dataPayload as Record<string, unknown> | null,
    deepLink: row.deepLink,
    dedupeKey: row.dedupeKey,
    status: row.status,
    scheduledAt: row.scheduledAt === null ? null : row.scheduledAt.toISOString(),
    sentAt: row.sentAt === null ? null : row.sentAt.toISOString(),
    deliveredAt: row.deliveredAt === null ? null : row.deliveredAt.toISOString(),
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
    failedAt: row.failedAt === null ? null : row.failedAt.toISOString(),
    lastError: row.lastError,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessageResponseWithEvents(
  row: NotificationMessageWithEvents,
): NotificationMessageResponseDto {
  const base = toMessageResponse(row);
  return { ...base, events: row.events.map(toEventResponse) };
}

function toEventResponse(
  row: NotificationMessageEventRow,
): NotificationMessageEventResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    notificationMessageId: row.notificationMessageId,
    eventType: row.eventType,
    occurredAt: row.occurredAt.toISOString(),
    providerCode: row.providerCode,
    providerMessageId: row.providerMessageId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
