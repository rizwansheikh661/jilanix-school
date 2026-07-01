/**
 * UsageController — super-admin read + recompute for a school's usage.
 *
 *   GET  /v1/super-admin/schools/:schoolId/usage          — snapshot
 *   GET  /v1/super-admin/schools/:schoolId/usage/events   — paginated events
 *   POST /v1/super-admin/schools/:schoolId/usage/recompute — re-derive
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { SubscriptionPermissions } from '../subscription.constants';
import { SchoolUsageService } from './school-usage.service';
import { UsageEventRepository } from './usage-event.repository';
import {
  SchoolUsageResponseDto,
  UsageEventListResponseDto,
  UsageEventResponseDto,
} from './usage.dto';

const DEFAULT_EVENTS_PAGE = 50;
const MAX_EVENTS_PAGE = 200;

@ApiTags('SuperAdmin · Usage')
@ApiBearerAuth()
@Controller({ path: 'super-admin/schools/:schoolId/usage', version: '1' })
export class UsageController {
  constructor(
    private readonly service: SchoolUsageService,
    private readonly events: UsageEventRepository,
  ) {}

  @Get()
  @RequirePermissions(SubscriptionPermissions.USAGE_READ)
  @ApiOperation({ summary: 'Read aggregate usage for a school.' })
  @ApiOkResponse({ type: SchoolUsageResponseDto })
  public async getSnapshot(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<SchoolUsageResponseDto> {
    return SchoolUsageResponseDto.from(await this.service.getSnapshot(schoolId));
  }

  @Get('events')
  @RequirePermissions(SubscriptionPermissions.USAGE_EVENTS_READ)
  @ApiOperation({ summary: 'Read the per-school usage event ledger.' })
  @ApiOkResponse({ type: UsageEventListResponseDto })
  public async listEvents(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Query('featureKey') featureKey: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<UsageEventListResponseDto> {
    const parsedLimit = Math.min(
      MAX_EVENTS_PAGE,
      Math.max(1, Number.parseInt(limit ?? '', 10) || DEFAULT_EVENTS_PAGE),
    );
    const { rows, nextCursorId } = await this.events.list({
      schoolId,
      ...(featureKey !== undefined ? { featureKey } : {}),
      limit: parsedLimit,
      ...(cursor !== undefined ? { cursorId: cursor } : {}),
    });
    return {
      items: rows.map(UsageEventResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.USAGE_RECOMPUTE)
  @ApiOperation({ summary: 'Recompute SchoolUsage counters from canonical tables.' })
  @ApiOkResponse({ type: SchoolUsageResponseDto })
  public async recompute(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<SchoolUsageResponseDto> {
    return SchoolUsageResponseDto.from(await this.service.recompute(schoolId));
  }
}
