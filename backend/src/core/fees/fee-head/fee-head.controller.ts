/**
 * FeeHeadController — `/fees/heads` routes.
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
  CreateFeeHeadDto,
  FeeHeadListQueryDto,
  FeeHeadListResponseDto,
  FeeHeadResponseDto,
  UpdateFeeHeadDto,
} from './fee-head.dto';
import { FeeHeadService } from './fee-head.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/heads', version: '1' })
export class FeeHeadController {
  constructor(private readonly service: FeeHeadService) {}

  @Get()
  @RequirePermissions(FeesPermissions.HEAD_READ)
  @ApiOperation({ summary: 'List fee heads (cursor paginated).' })
  @ApiOkResponse({ type: FeeHeadListResponseDto })
  public async list(
    @Query() query: FeeHeadListQueryDto,
  ): Promise<FeeHeadListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.category !== undefined ? { category: query.category } : {}),
      ...(query.name !== undefined ? { nameContains: query.name } : {}),
    });
    return {
      items: items.map(FeeHeadResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.HEAD_READ)
  @ApiOperation({ summary: 'Get a fee head by id.' })
  @ApiOkResponse({ type: FeeHeadResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeeHeadResponseDto> {
    return FeeHeadResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(FeesPermissions.HEAD_CREATE)
  @ApiOperation({ summary: 'Create a fee head.' })
  @ApiCreatedResponse({ type: FeeHeadResponseDto })
  public async create(
    @Body() body: CreateFeeHeadDto,
  ): Promise<FeeHeadResponseDto> {
    const row = await this.service.create({
      code: body.code,
      name: body.name,
      category: body.category,
      ...(body.hsnSac !== undefined ? { hsnSac: body.hsnSac } : {}),
      ...(body.isRefundable !== undefined
        ? { isRefundable: body.isRefundable }
        : {}),
      ...(body.isTaxable !== undefined ? { isTaxable: body.isTaxable } : {}),
      ...(body.defaultAmount !== undefined
        ? { defaultAmount: body.defaultAmount }
        : {}),
      ...(body.glAccount !== undefined ? { glAccount: body.glAccount } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
    });
    return FeeHeadResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(FeesPermissions.HEAD_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a fee head.' })
  @ApiOkResponse({ type: FeeHeadResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFeeHeadDto,
  ): Promise<FeeHeadResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.hsnSac !== undefined ? { hsnSac: body.hsnSac } : {}),
      ...(body.isRefundable !== undefined
        ? { isRefundable: body.isRefundable }
        : {}),
      ...(body.isTaxable !== undefined ? { isTaxable: body.isTaxable } : {}),
      ...(body.defaultAmount !== undefined
        ? { defaultAmount: body.defaultAmount }
        : {}),
      ...(body.glAccount !== undefined ? { glAccount: body.glAccount } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
    });
    return FeeHeadResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeesPermissions.HEAD_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Soft-delete a fee head (refused if a non-archived structure line references it).',
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
