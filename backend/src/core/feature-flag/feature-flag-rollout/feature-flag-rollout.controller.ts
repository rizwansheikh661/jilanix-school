import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { FeatureFlagPermissions } from '../feature-flag.constants';
import {
  CreateRolloutDto,
  RolloutListQueryDto,
  RolloutListResponseDto,
  RolloutResponseDto,
  UpdateRolloutDto,
} from '../feature-flag.dto';
import { FeatureFlagService } from '../services/feature-flag.service';

@ApiTags('Feature flags')
@ApiBearerAuth('access-token')
@Controller({ path: 'feature-flags/rollouts', version: '1' })
export class FeatureFlagRolloutController {
  constructor(private readonly service: FeatureFlagService) {}

  @Get()
  @RequirePermissions(FeatureFlagPermissions.ROLLOUT_READ)
  @ApiOkResponse({ type: RolloutListResponseDto })
  public async list(@Query() query: RolloutListQueryDto): Promise<RolloutListResponseDto> {
    const rows = await this.service.listRollouts({
      ...(query.flagKey !== undefined ? { flagKey: query.flagKey } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return { items: rows.map(RolloutResponseDto.from) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(FeatureFlagPermissions.ROLLOUT_CREATE)
  @ApiOkResponse({ type: RolloutResponseDto })
  public async create(@Body() body: CreateRolloutDto): Promise<RolloutResponseDto> {
    const row = await this.service.createRollout({
      flagKey: body.flagKey,
      strategy: body.strategy,
      percentage: body.percentage ?? null,
      ...(body.tenantIds !== undefined ? { tenantIds: body.tenantIds } : {}),
      ...(body.planIds !== undefined ? { planIds: body.planIds } : {}),
      ...(body.regions !== undefined ? { regions: body.regions } : {}),
      isActive: body.isActive ?? true,
      startsAt:
        body.startsAt !== undefined && body.startsAt !== null ? new Date(body.startsAt) : null,
      endsAt: body.endsAt !== undefined && body.endsAt !== null ? new Date(body.endsAt) : null,
    });
    return RolloutResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(FeatureFlagPermissions.ROLLOUT_UPDATE)
  @ApiOkResponse({ type: RolloutResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRolloutDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<RolloutResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.updateRollout(id, {
      ...(body.percentage !== undefined ? { percentage: body.percentage } : {}),
      ...(body.tenantIds !== undefined ? { tenantIds: body.tenantIds } : {}),
      ...(body.planIds !== undefined ? { planIds: body.planIds } : {}),
      ...(body.regions !== undefined ? { regions: body.regions } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.startsAt !== undefined
        ? { startsAt: body.startsAt === null ? null : new Date(body.startsAt) }
        : {}),
      ...(body.endsAt !== undefined
        ? { endsAt: body.endsAt === null ? null : new Date(body.endsAt) }
        : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      expectedVersion,
    });
    return RolloutResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeatureFlagPermissions.ROLLOUT_DELETE)
  public async delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteRollout(id);
  }
}
