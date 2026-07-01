/**
 * FeeStructureController — `/fees/structures` routes.
 *
 * Endpoints:
 *   GET    /api/v1/fees/structures             — list (cursor + filters)
 *   GET    /api/v1/fees/structures/:id         — get one (with lines)
 *   POST   /api/v1/fees/structures             — create (DRAFT)
 *   PATCH  /api/v1/fees/structures/:id         — update header + replace lines
 *   POST   /api/v1/fees/structures/:id/publish — DRAFT -> PUBLISHED
 *   POST   /api/v1/fees/structures/:id/archive — -> ARCHIVED
 *   POST   /api/v1/fees/structures/:id/clone   — clone existing as DRAFT
 *   DELETE /api/v1/fees/structures/:id         — soft-delete (DRAFT only)
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
  CloneFeeStructureDto,
  CreateFeeStructureDto,
  FeeStructureListQueryDto,
  FeeStructureListResponseDto,
  FeeStructureResponseDto,
  UpdateFeeStructureDto,
} from './fee-structure.dto';
import {
  FeeStructureService,
  type CreateFeeStructureLineArgs,
} from './fee-structure.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/structures', version: '1' })
export class FeeStructureController {
  constructor(private readonly service: FeeStructureService) {}

  @Get()
  @RequirePermissions(FeesPermissions.STRUCTURE_READ)
  @ApiOperation({ summary: 'List fee structures (cursor paginated; filterable).' })
  @ApiOkResponse({ type: FeeStructureListResponseDto })
  public async list(
    @Query() query: FeeStructureListQueryDto,
  ): Promise<FeeStructureListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.academicYearId !== undefined
        ? { academicYearId: query.academicYearId }
        : {}),
      ...(query.classId !== undefined ? { classId: query.classId } : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
    });
    return {
      items: items.map(FeeStructureResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.STRUCTURE_READ)
  @ApiOperation({ summary: 'Get a fee structure by id with its lines.' })
  @ApiOkResponse({ type: FeeStructureResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FeeStructureResponseDto> {
    return FeeStructureResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(FeesPermissions.STRUCTURE_CREATE)
  @ApiOperation({ summary: 'Create a DRAFT fee structure with lines.' })
  @ApiCreatedResponse({ type: FeeStructureResponseDto })
  public async create(
    @Body() body: CreateFeeStructureDto,
  ): Promise<FeeStructureResponseDto> {
    const row = await this.service.create({
      academicYearId: body.academicYearId,
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      name: body.name,
      appliesTo: body.appliesTo,
      ...(body.classId !== undefined ? { classId: body.classId } : {}),
      ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
      ...(body.studentId !== undefined ? { studentId: body.studentId } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      lines: body.lines.map(toLineArg),
    });
    return FeeStructureResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(FeesPermissions.STRUCTURE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Update a DRAFT fee structure; supplying `lines[]` replaces the line set wholesale.',
  })
  @ApiOkResponse({ type: FeeStructureResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFeeStructureDto,
  ): Promise<FeeStructureResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.classId !== undefined ? { classId: body.classId } : {}),
      ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
      ...(body.studentId !== undefined ? { studentId: body.studentId } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.lines !== undefined ? { lines: body.lines.map(toLineArg) } : {}),
    });
    return FeeStructureResponseDto.from(row);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.STRUCTURE_PUBLISH)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Publish a DRAFT fee structure.' })
  @ApiOkResponse({ type: FeeStructureResponseDto })
  @ApiNotFoundResponse()
  public async publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FeeStructureResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return FeeStructureResponseDto.from(
      await this.service.publish(id, expectedVersion),
    );
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(FeesPermissions.STRUCTURE_ARCHIVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Archive a fee structure (any non-archived status).' })
  @ApiOkResponse({ type: FeeStructureResponseDto })
  @ApiNotFoundResponse()
  public async archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FeeStructureResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return FeeStructureResponseDto.from(
      await this.service.archive(id, expectedVersion),
    );
  }

  @Post(':id/clone')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(FeesPermissions.STRUCTURE_CLONE)
  @ApiOperation({ summary: 'Clone an existing fee structure as a new DRAFT.' })
  @ApiCreatedResponse({ type: FeeStructureResponseDto })
  @ApiNotFoundResponse()
  public async clone(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CloneFeeStructureDto,
  ): Promise<FeeStructureResponseDto> {
    const row = await this.service.cloneFrom(id, {
      name: body.name,
      ...(body.academicYearId !== undefined
        ? { academicYearId: body.academicYearId }
        : {}),
    });
    return FeeStructureResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeesPermissions.STRUCTURE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a DRAFT fee structure.' })
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

function toLineArg(l: {
  feeHeadId: string;
  amount: number;
  frequency: CreateFeeStructureLineArgs['frequency'];
  dueDay?: number | null;
  lateFinePolicyId?: string | null;
  ordering: number;
}): CreateFeeStructureLineArgs {
  return {
    feeHeadId: l.feeHeadId,
    amount: l.amount,
    frequency: l.frequency,
    ordering: l.ordering,
    ...(l.dueDay !== undefined ? { dueDay: l.dueDay } : {}),
    ...(l.lateFinePolicyId !== undefined
      ? { lateFinePolicyId: l.lateFinePolicyId }
      : {}),
  };
}
