/**
 * Analytics routes — `/api/v1/comms-center/analytics`.
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
import { toFilters } from '../communication-center.filter-utils';
import { CommunicationFiltersDto } from '../dashboard/communication-dashboard.dto';
import { AnalyticsSummaryResponseDto } from './analytics.dto';
import {
  type AnalyticsSummary,
  AnalyticsService,
} from './analytics.service';

@ApiTags('Communication Center')
@ApiBearerAuth()
@Controller('api/v1/comms-center/analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get()
  @RequirePermissions(CommunicationCenterPermissions.ANALYTICS_READ)
  @ApiOperation({
    summary: 'Communication analytics — rates + channel mix over filtered window.',
  })
  @ApiOkResponse({ type: AnalyticsSummaryResponseDto })
  public async getSummary(
    @Query() query: CommunicationFiltersDto,
  ): Promise<AnalyticsSummaryResponseDto> {
    const s = await this.service.getSummary(toFilters(query));
    return toResponse(s);
  }
}

function toResponse(s: AnalyticsSummary): AnalyticsSummaryResponseDto {
  return {
    total: s.total,
    delivered: s.delivered,
    read: s.read,
    failed: s.failed,
    attemptedTotal: s.attemptedTotal,
    retryCount: s.retryCount,
    deliveryRate: s.deliveryRate,
    readRate: s.readRate,
    failureRate: s.failureRate,
    channelDistribution: s.channelDistribution.map((r) => ({
      channel: r.channel,
      count: r.count,
    })),
    generatedAt: s.generatedAt.toISOString(),
  };
}
