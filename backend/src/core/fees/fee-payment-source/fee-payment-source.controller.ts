/**
 * FeePaymentSourceController — `/fees/payment-sources` routes.
 *
 * Sprint 9.1 (Hybrid Fee Collection) — CRUD for the school payment-source
 * catalog (QR codes, UPI VPAs, bank accounts) referenced by manual payment
 * captures and the verification flow.
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
  CreateFeePaymentSourceDto,
  FeePaymentSourceListResponseDto,
  FeePaymentSourceResponseDto,
  ListFeePaymentSourcesQueryDto,
  UpdateFeePaymentSourceDto,
} from './fee-payment-source.dto';
import { FeePaymentSourceService } from './fee-payment-source.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/payment-sources', version: '1' })
export class FeePaymentSourceController {
  constructor(private readonly service: FeePaymentSourceService) {}

  @Get()
  @RequirePermissions(FeesPermissions.PAYMENT_SOURCE_READ)
  @ApiOperation({ summary: 'List fee payment sources (cursor paginated).' })
  @ApiOkResponse({ type: FeePaymentSourceListResponseDto })
  public async list(
    @Query() query: ListFeePaymentSourcesQueryDto,
  ): Promise<FeePaymentSourceListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    });
    return {
      items: items.map(FeePaymentSourceResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.PAYMENT_SOURCE_READ)
  @ApiOperation({ summary: 'Get a fee payment source by id.' })
  @ApiOkResponse({ type: FeePaymentSourceResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeePaymentSourceResponseDto> {
    return FeePaymentSourceResponseDto.from(await this.service.findById(id));
  }

  @Post()
  @RequirePermissions(FeesPermissions.PAYMENT_SOURCE_CREATE)
  @ApiOperation({ summary: 'Create a fee payment source.' })
  @ApiCreatedResponse({ type: FeePaymentSourceResponseDto })
  public async create(
    @Body() body: CreateFeePaymentSourceDto,
  ): Promise<FeePaymentSourceResponseDto> {
    const row = await this.service.create({
      code: body.code,
      name: body.name,
      kind: body.kind,
      identifier: body.identifier,
      ...(body.ifsc !== undefined ? { ifsc: body.ifsc } : {}),
      ...(body.holderName !== undefined ? { holderName: body.holderName } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
    return FeePaymentSourceResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(FeesPermissions.PAYMENT_SOURCE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a fee payment source (code is immutable).' })
  @ApiOkResponse({ type: FeePaymentSourceResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFeePaymentSourceDto,
  ): Promise<FeePaymentSourceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.identifier !== undefined ? { identifier: body.identifier } : {}),
      ...(body.ifsc !== undefined ? { ifsc: body.ifsc } : {}),
      ...(body.holderName !== undefined ? { holderName: body.holderName } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
    return FeePaymentSourceResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeesPermissions.PAYMENT_SOURCE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Soft-delete a fee payment source (refused if any non-deleted payment references it).',
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
