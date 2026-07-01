/**
 * PlanFeatureController — `/v1/super-admin/plans/:planId/features` CRUD +
 * bulk-replace. Platform-only; permissions enforced via @RequirePermissions.
 */
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { SubscriptionPermissions } from '../subscription.constants';
import {
  BulkReplacePlanFeaturesDto,
  CreatePlanFeatureDto,
  PlanFeatureListResponseDto,
  PlanFeatureResponseDto,
  UpdatePlanFeatureDto,
} from './plan-feature.dto';
import { PlanFeatureService } from './plan-feature.service';

@ApiTags('SuperAdmin · PlanFeatures')
@ApiBearerAuth()
@Controller({ path: 'super-admin/plans/:planId/features', version: '1' })
export class PlanFeatureController {
  constructor(private readonly service: PlanFeatureService) {}

  @Get()
  @RequirePermissions(SubscriptionPermissions.PLAN_FEATURE_READ)
  @ApiOperation({ summary: 'List plan features for a plan.' })
  @ApiOkResponse({ type: PlanFeatureListResponseDto })
  public async list(
    @Param('planId', new ParseUUIDPipe()) planId: string,
  ): Promise<PlanFeatureListResponseDto> {
    const rows = await this.service.list(planId);
    return { items: rows.map(PlanFeatureResponseDto.from) };
  }

  @Post()
  @RequirePermissions(SubscriptionPermissions.PLAN_FEATURE_CREATE)
  @ApiOperation({ summary: 'Create a plan feature row.' })
  @ApiCreatedResponse({ type: PlanFeatureResponseDto })
  public async create(
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body() body: CreatePlanFeatureDto,
  ): Promise<PlanFeatureResponseDto> {
    const created = await this.service.create({
      planId,
      featureKey: body.featureKey,
      featureType: body.featureType,
      mode: body.mode,
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
    return PlanFeatureResponseDto.from(created);
  }

  @Patch(':id')
  @RequirePermissions(SubscriptionPermissions.PLAN_FEATURE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a plan feature row.' })
  @ApiOkResponse({ type: PlanFeatureResponseDto })
  public async update(
    @Param('planId', new ParseUUIDPipe()) _planId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePlanFeatureDto,
  ): Promise<PlanFeatureResponseDto> {
    return PlanFeatureResponseDto.from(
      await this.service.update(id, parseIfMatch(ifMatch), {
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.limit !== undefined ? { limit: body.limit } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(SubscriptionPermissions.PLAN_FEATURE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a plan feature row.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('planId', new ParseUUIDPipe()) _planId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }

  @Post('bulk')
  @RequirePermissions(SubscriptionPermissions.PLAN_FEATURE_BULK_REPLACE)
  @ApiOperation({
    summary:
      'Bulk-replace the plan feature matrix for a plan: upsert by key, soft-delete missing keys.',
  })
  @ApiOkResponse({ type: PlanFeatureListResponseDto })
  public async bulkReplace(
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body() body: BulkReplacePlanFeaturesDto,
  ): Promise<PlanFeatureListResponseDto> {
    const out = await this.service.bulkReplace(
      planId,
      body.items.map((i) => ({
        featureKey: i.featureKey,
        featureType: i.featureType,
        mode: i.mode,
        ...(i.limit !== undefined ? { limit: i.limit } : {}),
        ...(i.sortOrder !== undefined ? { sortOrder: i.sortOrder } : {}),
        ...(i.description !== undefined ? { description: i.description } : {}),
      })),
    );
    return { items: out.map(PlanFeatureResponseDto.from) };
  }
}
