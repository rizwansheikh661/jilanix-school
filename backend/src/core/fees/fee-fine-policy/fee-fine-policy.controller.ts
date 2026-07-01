/**
 * FeeLateFinePolicyController — `/fees/fine-policies` routes.
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
import { FeesPermissions } from '../fees.constants';
import {
  CreateFeeLateFinePolicyDto,
  FeeLateFinePolicyListQueryDto,
  FeeLateFinePolicyListResponseDto,
  FeeLateFinePolicyResponseDto,
  UpdateFeeLateFinePolicyDto,
} from './fee-fine-policy.dto';
import { FeeLateFinePolicyService } from './fee-fine-policy.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/fine-policies', version: '1' })
export class FeeLateFinePolicyController {
  constructor(private readonly service: FeeLateFinePolicyService) {}

  @Get()
  @RequirePermissions(FeesPermissions.FINE_POLICY_READ)
  @ApiOperation({ summary: 'List late-fine policies (cursor paginated).' })
  @ApiOkResponse({ type: FeeLateFinePolicyListResponseDto })
  public async list(
    @Query() query: FeeLateFinePolicyListQueryDto,
  ): Promise<FeeLateFinePolicyListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.name !== undefined ? { nameContains: query.name } : {}),
    });
    return {
      items: items.map(FeeLateFinePolicyResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.FINE_POLICY_READ)
  @ApiOperation({ summary: 'Get a late-fine policy by id.' })
  @ApiOkResponse({ type: FeeLateFinePolicyResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeeLateFinePolicyResponseDto> {
    return FeeLateFinePolicyResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(FeesPermissions.FINE_POLICY_CREATE)
  @ApiOperation({ summary: 'Create a late-fine policy.' })
  @ApiCreatedResponse({ type: FeeLateFinePolicyResponseDto })
  public async create(
    @Body() body: CreateFeeLateFinePolicyDto,
  ): Promise<FeeLateFinePolicyResponseDto> {
    const row = await this.service.create({
      code: body.code,
      name: body.name,
      type: body.type,
      value: body.value,
      gracePeriodDays: body.gracePeriodDays,
      ...(body.capAmount !== undefined ? { capAmount: body.capAmount } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
    return FeeLateFinePolicyResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(FeesPermissions.FINE_POLICY_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a late-fine policy.' })
  @ApiOkResponse({ type: FeeLateFinePolicyResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFeeLateFinePolicyDto,
  ): Promise<FeeLateFinePolicyResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
      ...(body.gracePeriodDays !== undefined
        ? { gracePeriodDays: body.gracePeriodDays }
        : {}),
      ...(body.capAmount !== undefined ? { capAmount: body.capAmount } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
    return FeeLateFinePolicyResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeesPermissions.FINE_POLICY_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Soft-delete a late-fine policy (refused if a non-archived structure line references it).',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}
