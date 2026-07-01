/**
 * GET /api/v1/comms-center/dashboard — backend rollups for the
 * Communication Center landing screen. Read-only; no UI here.
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
  CommunicationFiltersDto,
  DashboardSummaryResponseDto,
} from './communication-dashboard.dto';
import {
  CommunicationDashboardService,
  type DashboardSummary,
} from './communication-dashboard.service';
import { toFilters } from '../communication-center.filter-utils';

@ApiTags('Communication Center')
@ApiBearerAuth()
@Controller('api/v1/comms-center/dashboard')
export class CommunicationDashboardController {
  constructor(private readonly service: CommunicationDashboardService) {}

  @Get()
  @RequirePermissions(CommunicationCenterPermissions.DASHBOARD_READ)
  @ApiOperation({
    summary: 'Communication Center dashboard summary (counters, filtered).',
  })
  @ApiOkResponse({ type: DashboardSummaryResponseDto })
  public async getSummary(
    @Query() query: CommunicationFiltersDto,
  ): Promise<DashboardSummaryResponseDto> {
    const summary = await this.service.getSummary(toFilters(query));
    return toResponse(summary);
  }
}

function toResponse(s: DashboardSummary): DashboardSummaryResponseDto {
  return {
    totalCommunications: s.totalCommunications,
    todayCommunications: s.todayCommunications,
    pendingDeliveries: s.pendingDeliveries,
    scheduledCommunications: s.scheduledCommunications,
    failedDeliveries: s.failedDeliveries,
    deliveredCommunications: s.deliveredCommunications,
    readCommunications: s.readCommunications,
    generatedAt: s.generatedAt.toISOString(),
  };
}
