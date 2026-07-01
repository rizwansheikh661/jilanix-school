/**
 * AcademicYearPromotionController — HTTP routes for the year-rollover job
 * record. Mounted at `/promotions`. Sprint 4 only persists the record + state
 * machine; the bulk-promotion engine is Sprint 9.
 *
 * Routes:
 *   GET    /promotions               — list (optional ?status= filter, cursor).
 *   GET    /promotions/:id           — read single.
 *   POST   /promotions               — create (returns 202 — job scheduled).
 *   POST   /promotions/:id/cancel    — cancel a PENDING / RUNNING record.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AcademicPermissions } from '../academic.constants';
import { parseIfMatch } from '../academic.errors';
import {
  AcademicYearPromotionListResponseDto,
  AcademicYearPromotionResponseDto,
  CreateAcademicYearPromotionDto,
  ListPromotionsQueryDto,
} from './academic-year-promotion.dto';
import { AcademicYearPromotionService } from './academic-year-promotion.service';

@ApiTags('AcademicYearPromotions')
@ApiBearerAuth()
@Controller({ path: 'promotions', version: '1' })
export class AcademicYearPromotionController {
  constructor(private readonly service: AcademicYearPromotionService) {}

  @Get()
  @RequirePermissions(AcademicPermissions.PROMOTION_READ)
  @ApiOperation({ summary: 'List academic year promotion jobs.' })
  @ApiOkResponse({ type: AcademicYearPromotionListResponseDto })
  public async list(
    @Query() pagination: PaginationQueryDto,
    @Query() filter: ListPromotionsQueryDto,
  ): Promise<AcademicYearPromotionListResponseDto> {
    const limit = pagination.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(pagination.cursor !== undefined ? { cursorId: decodeCursor(pagination.cursor) } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
    });
    return {
      items: result.items.map(AcademicYearPromotionResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Get(':id')
  @RequirePermissions(AcademicPermissions.PROMOTION_READ)
  @ApiOperation({ summary: 'Get a single promotion record.' })
  @ApiOkResponse({ type: AcademicYearPromotionResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AcademicYearPromotionResponseDto> {
    return AcademicYearPromotionResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(AcademicPermissions.PROMOTION_CREATE)
  @ApiOperation({
    summary:
      'Schedule a year-rollover (creates PENDING record; bulk-promotion engine lands Sprint 9).',
  })
  @ApiAcceptedResponse({ type: AcademicYearPromotionResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'source/target validation failure' })
  public async create(
    @Body() body: CreateAcademicYearPromotionDto,
  ): Promise<AcademicYearPromotionResponseDto> {
    const row = await this.service.create({
      sourceAcademicYearId: body.sourceAcademicYearId,
      targetAcademicYearId: body.targetAcademicYearId,
    });
    return AcademicYearPromotionResponseDto.from(row);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AcademicPermissions.PROMOTION_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel a PENDING or RUNNING promotion.' })
  @ApiOkResponse({ type: AcademicYearPromotionResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict or invalid state transition' })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<AcademicYearPromotionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return AcademicYearPromotionResponseDto.from(await this.service.cancel(id, expectedVersion));
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
