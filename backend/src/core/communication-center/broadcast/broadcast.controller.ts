/**
 * Broadcast routes — `/api/v1/comms-center/broadcasts`.
 *
 * Orchestrator over `NotificationCampaignService`. No new storage; every
 * write feeds back into the existing campaign + outbox + audit chain.
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
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CommunicationCenterPermissions } from '../communication-center.constants';
import {
  BroadcastListResponseDto,
  BroadcastResponseDto,
  BroadcastRetryResponseDto,
  CreateBroadcastDto,
  CreateBroadcastResponseDto,
  HistoryBroadcastsQueryDto,
  ListBroadcastsQueryDto,
} from './broadcast.dto';
import { BroadcastService } from './broadcast.service';
import type { NotificationCampaignRow } from '../../notifications/notifications.types';
import type { NotificationChannelValue } from '../../notifications/notifications.constants';

const LIST_DEFAULT_LIMIT = 50;

@ApiTags('Communication Center')
@ApiBearerAuth()
@Controller('api/v1/comms-center/broadcasts')
export class BroadcastController {
  constructor(private readonly service: BroadcastService) {}

  @Get()
  @RequirePermissions(CommunicationCenterPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'List broadcasts (cursor paginated).' })
  @ApiOkResponse({ type: BroadcastListResponseDto })
  public async list(
    @Query() query: ListBroadcastsQueryDto,
  ): Promise<BroadcastListResponseDto> {
    const { items, nextCursor } = await this.service.list({
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.targetType !== undefined ? { targetType: query.targetType } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return { items: items.map(toBroadcastResponse), nextCursor };
  }

  @Get('history')
  @RequirePermissions(CommunicationCenterPermissions.DASHBOARD_READ)
  @ApiOperation({
    summary: 'List broadcasts in history view (no status filter — includes COMPLETED / CANCELLED / FAILED).',
  })
  @ApiOkResponse({ type: BroadcastListResponseDto })
  public async history(
    @Query() query: HistoryBroadcastsQueryDto,
  ): Promise<BroadcastListResponseDto> {
    const { items, nextCursor } = await this.service.history({
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return { items: items.map(toBroadcastResponse), nextCursor };
  }

  @Post()
  @RequirePermissions(CommunicationCenterPermissions.BROADCAST_CREATE)
  @ApiOperation({
    summary:
      'Create a broadcast — wraps NotificationCampaign DRAFT and starts immediately, or leaves in DRAFT when scheduledAt is in the future.',
  })
  @ApiCreatedResponse({ type: CreateBroadcastResponseDto })
  public async create(
    @Body() body: CreateBroadcastDto,
  ): Promise<CreateBroadcastResponseDto> {
    const result = await this.service.create({
      name: body.name,
      notificationTemplateId: body.notificationTemplateId,
      channel: body.channel,
      targetType: body.targetType,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.targetId !== undefined ? { targetId: body.targetId } : {}),
      ...(body.audience !== undefined ? { audience: body.audience } : {}),
      ...(body.scheduledAt !== undefined
        ? { scheduledAt: new Date(body.scheduledAt) }
        : {}),
    });
    return {
      campaign: toBroadcastResponse(result.campaign),
      started: result.started,
    };
  }

  @Get(':id')
  @RequirePermissions(CommunicationCenterPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Get a broadcast by id.' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: BroadcastResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BroadcastResponseDto> {
    const result = await this.service.getById(id);
    return toBroadcastResponse(result.campaign);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(CommunicationCenterPermissions.BROADCAST_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Cancel a DRAFT / QUEUED / SENDING broadcast.' })
  @ApiOkResponse({ type: BroadcastResponseDto })
  @ApiNotFoundResponse()
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<BroadcastResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const cancelled = await this.service.cancel(id, expectedVersion);
    return toBroadcastResponse(cancelled);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(CommunicationCenterPermissions.BROADCAST_RETRY)
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary:
      'Request a retry of failed messages for this broadcast — emits an orchestration event consumed by the notification send-job retry path.',
  })
  @ApiOkResponse({ type: BroadcastRetryResponseDto })
  @ApiNotFoundResponse()
  public async retry(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BroadcastRetryResponseDto> {
    const result = await this.service.retry(id);
    return {
      campaign: toBroadcastResponse(result.campaign),
      failedCount: result.failedCount,
    };
  }
}

function toBroadcastResponse(row: NotificationCampaignRow): BroadcastResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    description: row.description,
    channels: row.channels as unknown as readonly NotificationChannelValue[],
    notificationTemplateId: row.notificationTemplateId,
    targetType: row.targetType,
    targetId: row.targetId,
    audience: row.audience,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    status: row.status,
    recipientCount: row.recipientCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
