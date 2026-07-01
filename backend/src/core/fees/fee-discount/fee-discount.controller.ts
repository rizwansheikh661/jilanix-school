/**
 * FeeDiscountController — `/fees/discounts` routes.
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
  CreateFeeDiscountDto,
  FeeDiscountListQueryDto,
  FeeDiscountListResponseDto,
  FeeDiscountResponseDto,
  UpdateFeeDiscountDto,
} from './fee-discount.dto';
import { FeeDiscountService } from './fee-discount.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/discounts', version: '1' })
export class FeeDiscountController {
  constructor(private readonly service: FeeDiscountService) {}

  @Get()
  @RequirePermissions(FeesPermissions.DISCOUNT_READ)
  @ApiOperation({ summary: 'List fee discounts (cursor paginated).' })
  @ApiOkResponse({ type: FeeDiscountListResponseDto })
  public async list(
    @Query() query: FeeDiscountListQueryDto,
  ): Promise<FeeDiscountListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.appliesToFeeHeadId !== undefined
        ? { appliesToFeeHeadId: query.appliesToFeeHeadId }
        : {}),
    });
    return {
      items: items.map(FeeDiscountResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.DISCOUNT_READ)
  @ApiOperation({ summary: 'Get a fee discount by id.' })
  @ApiOkResponse({ type: FeeDiscountResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeeDiscountResponseDto> {
    return FeeDiscountResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(FeesPermissions.DISCOUNT_CREATE)
  @ApiOperation({ summary: 'Create a fee discount (FLAT or PERCENT).' })
  @ApiCreatedResponse({ type: FeeDiscountResponseDto })
  public async create(
    @Body() body: CreateFeeDiscountDto,
  ): Promise<FeeDiscountResponseDto> {
    const row = await this.service.create({
      code: body.code,
      name: body.name,
      type: body.type,
      value: body.value,
      ...(body.maxAmount !== undefined ? { maxAmount: body.maxAmount } : {}),
      ...(body.appliesToFeeHeadId !== undefined
        ? { appliesToFeeHeadId: body.appliesToFeeHeadId }
        : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.requiresApprovalAbove !== undefined
        ? { requiresApprovalAbove: body.requiresApprovalAbove }
        : {}),
    });
    return FeeDiscountResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(FeesPermissions.DISCOUNT_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a fee discount.' })
  @ApiOkResponse({ type: FeeDiscountResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFeeDiscountDto,
  ): Promise<FeeDiscountResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
      ...(body.maxAmount !== undefined ? { maxAmount: body.maxAmount } : {}),
      ...(body.appliesToFeeHeadId !== undefined
        ? { appliesToFeeHeadId: body.appliesToFeeHeadId }
        : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.requiresApprovalAbove !== undefined
        ? { requiresApprovalAbove: body.requiresApprovalAbove }
        : {}),
    });
    return FeeDiscountResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeesPermissions.DISCOUNT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete a fee discount (refused while students reference it).',
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
