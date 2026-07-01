/**
 * NotificationCampaignController — `/api/v1/notifications/campaigns` routes
 * (Sprint 10 Wave 10). Start/cancel mutations require `If-Match` for
 * optimistic concurrency; permissions enforced via `@RequirePermissions`.
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
import { RequirePermissions } from '../../rbac';
import { NotificationsPermissions } from '../notifications.constants';
import type {
  NotificationCampaignRecipientRow,
  NotificationCampaignRow,
} from '../notifications.types';
import {
  CampaignDetailResponseDto,
  CampaignListResponseDto,
  CampaignRecipientListResponseDto,
  CampaignRecipientResponseDto,
  CampaignResponseDto,
  CampaignSummaryResponseDto,
  CreateCampaignDto,
  ListCampaignRecipientsQueryDto,
  ListCampaignsQueryDto,
} from './notification-campaign.dto';
import {
  type CampaignWithSummary,
  NotificationCampaignService,
} from './notification-campaign.service';
import type { CampaignRecipientSummary } from './notification-campaign.repository';

const LIST_DEFAULT_LIMIT = 50;

@ApiTags('Notification Campaigns')
@ApiBearerAuth()
@Controller('api/v1/notifications/campaigns')
export class NotificationCampaignController {
  constructor(private readonly service: NotificationCampaignService) {}

  @Get()
  @RequirePermissions(NotificationsPermissions.CAMPAIGN_READ)
  @ApiOperation({ summary: 'List notification campaigns (cursor paginated).' })
  @ApiOkResponse({ type: CampaignListResponseDto })
  public async list(
    @Query() query: ListCampaignsQueryDto,
  ): Promise<CampaignListResponseDto> {
    const { items, nextCursor } = await this.service.list({
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.targetType !== undefined ? { targetType: query.targetType } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return {
      items: items.map(toCampaignResponse),
      nextCursor,
    };
  }

  @Post()
  @RequirePermissions(NotificationsPermissions.CAMPAIGN_CREATE)
  @ApiOperation({ summary: 'Create a DRAFT notification campaign.' })
  @ApiCreatedResponse({ type: CampaignResponseDto })
  public async create(
    @Body() body: CreateCampaignDto,
  ): Promise<CampaignResponseDto> {
    const created = await this.service.create({
      name: body.name,
      channels: body.channels,
      notificationTemplateId: body.notificationTemplateId,
      targetType: body.targetType,
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.targetId !== undefined ? { targetId: body.targetId } : {}),
      ...(body.audience !== undefined ? { audience: body.audience } : {}),
      ...(body.scheduledAt !== undefined
        ? { scheduledAt: new Date(body.scheduledAt) }
        : {}),
    });
    return toCampaignResponse(created);
  }

  @Get(':id')
  @RequirePermissions(NotificationsPermissions.CAMPAIGN_READ)
  @ApiOperation({
    summary: 'Get a notification campaign by id (header + recipient summary).',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: CampaignDetailResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CampaignDetailResponseDto> {
    const result = await this.service.getById(id);
    return toDetailResponse(result);
  }

  @Get(':id/recipients')
  @RequirePermissions(NotificationsPermissions.CAMPAIGN_READ)
  @ApiOperation({
    summary:
      'List the resolution log for a campaign (created + skipped recipients).',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: CampaignRecipientListResponseDto })
  @ApiNotFoundResponse()
  public async listRecipients(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListCampaignRecipientsQueryDto,
  ): Promise<CampaignRecipientListResponseDto> {
    const { items, nextCursor } = await this.service.listRecipients(id, {
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return {
      items: items.map(toRecipientResponse),
      nextCursor,
    };
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(NotificationsPermissions.CAMPAIGN_START)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary:
      'Resolve recipients and fan out per-channel messages (flag-gated).',
  })
  @ApiOkResponse({ type: CampaignDetailResponseDto })
  @ApiNotFoundResponse()
  public async start(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<CampaignDetailResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const result = await this.service.start(id, expectedVersion);
    return toDetailResponse(result);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(NotificationsPermissions.CAMPAIGN_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary:
      'Cancel a DRAFT/QUEUED/SENDING campaign; QUEUED messages flip to CANCELLED.',
  })
  @ApiOkResponse({ type: CampaignResponseDto })
  @ApiNotFoundResponse()
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<CampaignResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const updated = await this.service.cancel(id, expectedVersion);
    return toCampaignResponse(updated);
  }
}

function toCampaignResponse(
  row: NotificationCampaignRow,
): CampaignResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    description: row.description,
    channels: row.channels as unknown as readonly never[],
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

function toRecipientResponse(
  row: NotificationCampaignRecipientRow,
): CampaignRecipientResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    notificationCampaignId: row.notificationCampaignId,
    recipientUserId: row.recipientUserId,
    recipientAudience: row.recipientAudience,
    resolvedAt: row.resolvedAt.toISOString(),
    resolutionReason: row.resolutionReason,
    skipped: row.skipped,
    skipReason: row.skipReason,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSummaryResponse(
  summary: CampaignRecipientSummary,
): CampaignSummaryResponseDto {
  return {
    total: summary.total,
    skipped: summary.skipped,
    byReason: { ...summary.byReason },
  };
}

function toDetailResponse(result: CampaignWithSummary): CampaignDetailResponseDto {
  return {
    campaign: toCampaignResponse(result.campaign),
    summary: toSummaryResponse(result.summary),
  };
}
