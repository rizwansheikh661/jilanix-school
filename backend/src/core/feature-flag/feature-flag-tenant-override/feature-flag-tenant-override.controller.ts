import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { FeatureFlagPermissions } from '../feature-flag.constants';
import {
  DeleteTenantOverrideDto,
  TenantOverrideListQueryDto,
  TenantOverrideListResponseDto,
  TenantOverrideResponseDto,
  UpsertTenantOverrideDto,
} from '../feature-flag.dto';
import { FeatureFlagService } from '../services/feature-flag.service';

@ApiTags('Feature flags')
@ApiBearerAuth('access-token')
@Controller({ path: 'feature-flags/tenant-overrides', version: '1' })
export class FeatureFlagTenantOverrideController {
  constructor(private readonly service: FeatureFlagService) {}

  @Get()
  @RequirePermissions(FeatureFlagPermissions.TENANT_OVERRIDE_READ)
  @ApiOkResponse({ type: TenantOverrideListResponseDto })
  public async list(
    @Query() query: TenantOverrideListQueryDto,
  ): Promise<TenantOverrideListResponseDto> {
    const rows = await this.service.listTenantOverridesForSchool(query.schoolId);
    return { items: rows.map(TenantOverrideResponseDto.from) };
  }

  @Put(':key')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeatureFlagPermissions.TENANT_OVERRIDE_UPSERT)
  @ApiOkResponse({ type: TenantOverrideResponseDto })
  public async upsert(
    @Param('key') key: string,
    @Body() body: UpsertTenantOverrideDto,
  ): Promise<TenantOverrideResponseDto> {
    const row = await this.service.upsertTenantOverride({
      schoolId: body.schoolId,
      flagKey: key,
      value: body.value,
      quotaInt: body.quotaInt ?? null,
      reason: body.reason ?? null,
      expiresAt:
        body.expiresAt !== undefined && body.expiresAt !== null
          ? new Date(body.expiresAt)
          : null,
    });
    return TenantOverrideResponseDto.from(row);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeatureFlagPermissions.TENANT_OVERRIDE_DELETE)
  public async delete(
    @Param('key') key: string,
    @Body() body: DeleteTenantOverrideDto,
  ): Promise<void> {
    await this.service.deleteTenantOverride(body.schoolId, key);
  }
}
