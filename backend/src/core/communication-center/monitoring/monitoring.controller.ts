/**
 * Monitoring routes — `/api/v1/comms-center/monitoring`.
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
import { MonitoringSummaryResponseDto } from './monitoring.dto';
import {
  type MonitoringSummary,
  MonitoringService,
} from './monitoring.service';

@ApiTags('Communication Center')
@ApiBearerAuth()
@Controller('api/v1/comms-center/monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  @Get()
  @RequirePermissions(CommunicationCenterPermissions.MONITORING_READ)
  @ApiOperation({
    summary: 'Delivery monitoring summary by status (filtered).',
  })
  @ApiOkResponse({ type: MonitoringSummaryResponseDto })
  public async getSummary(
    @Query() query: CommunicationFiltersDto,
  ): Promise<MonitoringSummaryResponseDto> {
    const s = await this.service.getSummary(toFilters(query));
    return toResponse(s);
  }
}

function toResponse(s: MonitoringSummary): MonitoringSummaryResponseDto {
  return {
    total: s.total,
    byStatus: s.byStatus,
    breakdown: s.breakdown.map((b) => ({ status: b.status, count: b.count })),
    generatedAt: s.generatedAt.toISOString(),
  };
}
