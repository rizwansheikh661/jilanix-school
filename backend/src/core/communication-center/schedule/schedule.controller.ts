/**
 * Schedule routes — `/api/v1/comms-center/schedule`.
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
  ListSchedulesQueryDto,
  ScheduleListResponseDto,
  ScheduledBroadcastResponseDto,
} from './schedule.dto';
import {
  ScheduleService,
  type ScheduledBroadcastRow,
} from './schedule.service';

const LIST_DEFAULT_LIMIT = 50;

@ApiTags('Communication Center')
@ApiBearerAuth()
@Controller('api/v1/comms-center/schedule')
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Get()
  @RequirePermissions(CommunicationCenterPermissions.SCHEDULE_MANAGE)
  @ApiOperation({
    summary: 'List pending scheduled broadcasts (DRAFT campaigns with scheduledAt > now).',
  })
  @ApiOkResponse({ type: ScheduleListResponseDto })
  public async list(
    @Query() query: ListSchedulesQueryDto,
  ): Promise<ScheduleListResponseDto> {
    const { items, nextCursor } = await this.service.list({
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return {
      items: items.map(toResponse),
      nextCursor,
    };
  }
}

function toResponse(r: ScheduledBroadcastRow): ScheduledBroadcastResponseDto {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    status: r.status,
    scheduledAt: r.scheduledAt.toISOString(),
    targetType: r.targetType,
    targetId: r.targetId,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
  };
}
