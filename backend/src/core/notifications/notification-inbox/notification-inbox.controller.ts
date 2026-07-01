/**
 * NotificationInboxController — `/api/v1/notifications/inbox` routes
 * (Sprint 10 Wave 8). All routes operate against the current user's IN_APP
 * messages. Mark-read paths are idempotent — no `If-Match` required.
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { NotificationsPermissions } from '../notifications.constants';
import type { NotificationMessageRow } from '../notifications.types';
import {
  InboxFeedItemDto,
  InboxFeedQueryDto,
  InboxFeedResponseDto,
  MarkAllReadResponseDto,
  UnreadCountResponseDto,
} from './notification-inbox.dto';
import { NotificationInboxService } from './notification-inbox.service';

@ApiTags('Notification Inbox')
@ApiBearerAuth()
@Controller('api/v1/notifications/inbox')
export class NotificationInboxController {
  constructor(private readonly service: NotificationInboxService) {}

  @Get()
  @RequirePermissions(NotificationsPermissions.INBOX_READ)
  @ApiOperation({
    summary:
      'List the current user\u2019s in-app notification feed (cursor paginated).',
  })
  @ApiOkResponse({ type: InboxFeedResponseDto })
  public async feed(
    @Query() query: InboxFeedQueryDto,
  ): Promise<InboxFeedResponseDto> {
    const { items, nextCursor } = await this.service.feed({
      ...(query.unread !== undefined ? { unread: query.unread } : {}),
      ...(query.category !== undefined ? { category: query.category } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return {
      items: items.map((row) => toFeedItem(row)),
      nextCursor,
    };
  }

  @Get('unread-count')
  @RequirePermissions(NotificationsPermissions.INBOX_READ)
  @ApiOperation({
    summary: 'Return the count of unread in-app messages for the current user.',
  })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  public async unreadCount(): Promise<UnreadCountResponseDto> {
    return this.service.unreadCount();
  }

  @Post(':messageId/mark-read')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(NotificationsPermissions.INBOX_MARK_READ)
  @ApiOperation({
    summary:
      'Mark a single in-app message as read. Idempotent; no If-Match required.',
  })
  @ApiParam({ name: 'messageId' })
  @ApiOkResponse({ type: InboxFeedItemDto })
  @ApiNotFoundResponse()
  public async markRead(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ): Promise<InboxFeedItemDto> {
    const row = await this.service.markRead(messageId);
    return toFeedItem(row);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(NotificationsPermissions.INBOX_MARK_READ)
  @ApiOperation({
    summary: 'Mark every unread in-app message for the current user as read.',
  })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  public async markAllRead(): Promise<MarkAllReadResponseDto> {
    return this.service.markAllRead();
  }
}

function toFeedItem(row: NotificationMessageRow): InboxFeedItemDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    subjectRendered: row.subjectRendered,
    bodyRendered: row.bodyRendered,
    category: row.category,
    priority: row.priority,
    status: row.status,
    eventKey: row.eventKey,
    deepLink: row.deepLink,
    dataPayload: row.dataPayload as Record<string, unknown> | null,
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
