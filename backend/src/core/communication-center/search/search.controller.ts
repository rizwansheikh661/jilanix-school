/**
 * Search routes — `/api/v1/comms-center/search`.
 */
import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CommunicationCenterPermissions } from '../communication-center.constants';
import {
  SearchCommunicationsQueryDto,
  SearchHitResponseDto,
  SearchListResponseDto,
} from './search.dto';
import {
  SearchService,
  type SearchFilters,
  type SearchHit,
} from './search.service';

const LIST_DEFAULT_LIMIT = 50;

@ApiTags('Communication Center')
@ApiBearerAuth()
@Controller('api/v1/comms-center/search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @RequirePermissions(CommunicationCenterPermissions.SEARCH_READ)
  @ApiOperation({
    summary:
      'Search communications by linked aggregate (Student / Parent / Staff / Homework / FeeInvoice / Event / ...).',
  })
  @ApiOkResponse({ type: SearchListResponseDto })
  public async search(
    @Query() query: SearchCommunicationsQueryDto,
  ): Promise<SearchListResponseDto> {
    const filters: SearchFilters = {
      aggregateType: query.aggregateType,
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.aggregateId !== undefined ? { aggregateId: query.aggregateId } : {}),
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.recipientAudience !== undefined
        ? { recipientAudience: query.recipientAudience }
        : {}),
      ...(query.recipientUserId !== undefined
        ? { recipientUserId: query.recipientUserId }
        : {}),
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    };
    const { items, nextCursor } = await this.service.search(filters);
    return { items: items.map(toResponse), nextCursor };
  }
}

function toResponse(h: SearchHit): SearchHitResponseDto {
  return {
    id: h.id,
    channel: h.channel,
    status: h.status,
    recipientUserId: h.recipientUserId,
    recipientAudience: h.recipientAudience,
    eventKey: h.eventKey,
    aggregateType: h.aggregateType,
    aggregateId: h.aggregateId,
    campaignId: h.campaignId,
    createdAt: h.createdAt.toISOString(),
    sentAt: h.sentAt?.toISOString() ?? null,
    deliveredAt: h.deliveredAt?.toISOString() ?? null,
    readAt: h.readAt?.toISOString() ?? null,
    failedAt: h.failedAt?.toISOString() ?? null,
  };
}
