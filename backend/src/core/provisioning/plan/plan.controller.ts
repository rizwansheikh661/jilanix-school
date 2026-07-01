/**
 * PlanController — `/super-admin/plans` CRUD endpoints. Only platform-scope
 * actors with the appropriate `provisioning.plan.*` permission may call.
 *
 * Versioning + If-Match: PATCH and DELETE require an If-Match header
 * carrying the current `version` integer (matches the rest of the schoolos
 * mutation convention).
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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { ProvisioningPermissions } from '../provisioning.constants';
import {
  CreatePlanDto,
  PlanListQueryDto,
  PlanListResponseDto,
  PlanResponseDto,
  UpdatePlanDto,
} from './plan.dto';
import { PlanService } from './plan.service';

@ApiTags('SuperAdmin · Plans')
@ApiBearerAuth()
@Controller({ path: 'super-admin/plans', version: '1' })
export class PlanController {
  constructor(private readonly service: PlanService) {}

  @Get()
  @RequirePermissions(ProvisioningPermissions.PLAN_READ)
  @ApiOperation({ summary: 'List plans (cursor paginated, soft-deletes hidden by default).' })
  @ApiOkResponse({ type: PlanListResponseDto })
  public async list(
    @Query() query: PlanListQueryDto,
  ): Promise<PlanListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.includeDeleted !== undefined
        ? { includeDeleted: query.includeDeleted }
        : {}),
    });
    return {
      items: items.map(PlanResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(ProvisioningPermissions.PLAN_CREATE)
  @ApiOperation({ summary: 'Create a new plan.' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  public async create(@Body() body: CreatePlanDto): Promise<PlanResponseDto> {
    const row = await this.service.create({
      code: body.code,
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.defaultTrialDays !== undefined
        ? { defaultTrialDays: body.defaultTrialDays }
        : {}),
      ...(body.emailEnabled !== undefined ? { emailEnabled: body.emailEnabled } : {}),
      ...(body.smsEnabled !== undefined ? { smsEnabled: body.smsEnabled } : {}),
      ...(body.pushEnabled !== undefined ? { pushEnabled: body.pushEnabled } : {}),
      ...(body.inAppEnabled !== undefined ? { inAppEnabled: body.inAppEnabled } : {}),
      ...(body.emailMonthlyLimit !== undefined
        ? { emailMonthlyLimit: body.emailMonthlyLimit }
        : {}),
      ...(body.smsMonthlyLimit !== undefined
        ? { smsMonthlyLimit: body.smsMonthlyLimit }
        : {}),
      ...(body.pushMonthlyLimit !== undefined
        ? { pushMonthlyLimit: body.pushMonthlyLimit }
        : {}),
      ...(body.inAppMonthlyLimit !== undefined
        ? { inAppMonthlyLimit: body.inAppMonthlyLimit }
        : {}),
    });
    return PlanResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(ProvisioningPermissions.PLAN_READ)
  @ApiOperation({ summary: 'Get a single plan.' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PlanResponseDto> {
    return PlanResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(ProvisioningPermissions.PLAN_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update plan metadata.' })
  @ApiOkResponse({ type: PlanResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePlanDto,
  ): Promise<PlanResponseDto> {
    return PlanResponseDto.from(
      await this.service.update(id, parseIfMatch(ifMatch), {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.defaultTrialDays !== undefined
          ? { defaultTrialDays: body.defaultTrialDays }
          : {}),
        ...(body.emailEnabled !== undefined ? { emailEnabled: body.emailEnabled } : {}),
        ...(body.smsEnabled !== undefined ? { smsEnabled: body.smsEnabled } : {}),
        ...(body.pushEnabled !== undefined ? { pushEnabled: body.pushEnabled } : {}),
        ...(body.inAppEnabled !== undefined ? { inAppEnabled: body.inAppEnabled } : {}),
        ...(body.emailMonthlyLimit !== undefined
          ? { emailMonthlyLimit: body.emailMonthlyLimit }
          : {}),
        ...(body.smsMonthlyLimit !== undefined
          ? { smsMonthlyLimit: body.smsMonthlyLimit }
          : {}),
        ...(body.pushMonthlyLimit !== undefined
          ? { pushMonthlyLimit: body.pushMonthlyLimit }
          : {}),
        ...(body.inAppMonthlyLimit !== undefined
          ? { inAppMonthlyLimit: body.inAppMonthlyLimit }
          : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ProvisioningPermissions.PLAN_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete (retire) a plan. Refuses if any school still references it.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }
}
