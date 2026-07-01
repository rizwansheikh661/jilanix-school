import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { RequestContextRegistry } from '../../request-context';
import { FeatureFlagPermissions } from '../feature-flag.constants';
import {
  CreateFeatureFlagDefinitionDto,
  FeatureFlagDefinitionListQueryDto,
  FeatureFlagDefinitionListResponseDto,
  FeatureFlagDefinitionResponseDto,
  FeatureFlagEffectiveQueryDto,
  FeatureFlagEffectiveResponseDto,
  UpdateFeatureFlagDefinitionDto,
} from '../feature-flag.dto';
import { FeatureFlagService } from '../services/feature-flag.service';

@ApiTags('Feature flags')
@ApiBearerAuth('access-token')
@Controller({ path: 'feature-flags', version: '1' })
export class FeatureFlagDefinitionController {
  constructor(private readonly service: FeatureFlagService) {}

  @Get()
  @RequirePermissions(FeatureFlagPermissions.READ)
  @ApiOkResponse({ type: FeatureFlagDefinitionListResponseDto })
  public async list(
    @Query() query: FeatureFlagDefinitionListQueryDto,
  ): Promise<FeatureFlagDefinitionListResponseDto> {
    const rows = await this.service.listDefinitions({
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.lifecycle !== undefined ? { lifecycle: query.lifecycle } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return { items: rows.map(FeatureFlagDefinitionResponseDto.from) };
  }

  @Get('effective/:key')
  @RequirePermissions(FeatureFlagPermissions.READ)
  @ApiOkResponse({ type: FeatureFlagEffectiveResponseDto })
  public async effective(
    @Param('key') key: string,
    @Query() query: FeatureFlagEffectiveQueryDto,
  ): Promise<FeatureFlagEffectiveResponseDto> {
    const ctx = RequestContextRegistry.require();
    const evaluation = await this.service.evaluate(key, {
      schoolId: ctx.schoolId ?? null,
      ...(query.planId !== undefined ? { planId: query.planId } : {}),
      ...(query.region !== undefined ? { region: query.region } : {}),
    });
    return FeatureFlagEffectiveResponseDto.from(evaluation);
  }

  @Get(':key')
  @RequirePermissions(FeatureFlagPermissions.READ)
  @ApiOkResponse({ type: FeatureFlagDefinitionResponseDto })
  public async getOne(@Param('key') key: string): Promise<FeatureFlagDefinitionResponseDto> {
    const row = await this.service.getDefinitionByKey(key);
    return FeatureFlagDefinitionResponseDto.from(row);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(FeatureFlagPermissions.CREATE)
  @ApiOkResponse({ type: FeatureFlagDefinitionResponseDto })
  public async create(
    @Body() body: CreateFeatureFlagDefinitionDto,
  ): Promise<FeatureFlagDefinitionResponseDto> {
    const row = await this.service.createDefinition({
      key: body.key,
      name: body.name,
      description: body.description ?? null,
      kind: body.kind,
      owner: body.owner ?? null,
      defaultValue: body.defaultValue,
      lifecycle: body.lifecycle ?? 'INTRODUCED',
      cleanupDueAt: body.cleanupDueAt !== undefined && body.cleanupDueAt !== null
        ? new Date(body.cleanupDueAt)
        : null,
    });
    return FeatureFlagDefinitionResponseDto.from(row);
  }

  @Patch(':key')
  @RequirePermissions(FeatureFlagPermissions.UPDATE)
  @ApiOkResponse({ type: FeatureFlagDefinitionResponseDto })
  public async update(
    @Param('key') key: string,
    @Body() body: UpdateFeatureFlagDefinitionDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<FeatureFlagDefinitionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.updateDefinition(key, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.owner !== undefined ? { owner: body.owner } : {}),
      ...(body.defaultValue !== undefined ? { defaultValue: body.defaultValue } : {}),
      ...(body.lifecycle !== undefined ? { lifecycle: body.lifecycle } : {}),
      ...(body.cleanupDueAt !== undefined
        ? {
            cleanupDueAt:
              body.cleanupDueAt === null ? null : new Date(body.cleanupDueAt),
          }
        : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      expectedVersion,
    });
    return FeatureFlagDefinitionResponseDto.from(row);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeatureFlagPermissions.DELETE)
  public async delete(@Param('key') key: string): Promise<void> {
    await this.service.deleteDefinition(key);
  }
}
