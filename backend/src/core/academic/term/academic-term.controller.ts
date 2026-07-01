/**
 * AcademicTermController — HTTP routes for `AcademicTerm`. Two mount points:
 *   - `/academic-years/:yearId/terms` — list + create scoped to a parent year.
 *   - `/academic-terms/:id`           — read / patch / soft-delete by id.
 *
 * Splitting the controllers keeps Swagger groups tidy: list/create live under
 * the parent year, individual mutations under the resource itself.
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
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
  AcademicTermListResponseDto,
  AcademicTermResponseDto,
  CreateAcademicTermDto,
  UpdateAcademicTermDto,
} from './academic-term.dto';
import { AcademicTermService } from './academic-term.service';

@ApiTags('AcademicTerms')
@ApiBearerAuth()
@Controller({ path: 'academic-years/:yearId/terms', version: '1' })
export class AcademicTermYearScopedController {
  constructor(private readonly service: AcademicTermService) {}

  @Get()
  @RequirePermissions(AcademicPermissions.TERM_READ)
  @ApiOperation({ summary: 'List terms for an academic year.' })
  @ApiOkResponse({ type: AcademicTermListResponseDto })
  public async list(
    @Param('yearId', new ParseUUIDPipe()) yearId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<AcademicTermListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      academicYearId: yearId,
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
    });
    return {
      items: result.items.map(AcademicTermResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AcademicPermissions.TERM_CREATE)
  @ApiOperation({ summary: 'Create a term inside the given academic year.' })
  @ApiCreatedResponse({ type: AcademicTermResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'invalid date range or sequence gap' })
  @ApiConflictResponse({ description: 'overlapping term in same year' })
  public async create(
    @Param('yearId', new ParseUUIDPipe()) yearId: string,
    @Body() body: CreateAcademicTermDto,
  ): Promise<AcademicTermResponseDto> {
    const row = await this.service.create({
      academicYearId: yearId,
      name: body.name,
      ...(body.sequence !== undefined ? { sequence: body.sequence } : {}),
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    });
    return AcademicTermResponseDto.from(row);
  }
}

@ApiTags('AcademicTerms')
@ApiBearerAuth()
@Controller({ path: 'academic-terms', version: '1' })
export class AcademicTermController {
  constructor(private readonly service: AcademicTermService) {}

  @Get(':id')
  @RequirePermissions(AcademicPermissions.TERM_READ)
  @ApiOperation({ summary: 'Get a single academic term.' })
  @ApiOkResponse({ type: AcademicTermResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AcademicTermResponseDto> {
    return AcademicTermResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AcademicPermissions.TERM_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update an academic term.' })
  @ApiOkResponse({ type: AcademicTermResponseDto })
  @ApiNotFoundResponse()
  @ApiUnprocessableEntityResponse()
  @ApiConflictResponse({ description: 'version conflict or overlapping range' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAcademicTermDto,
  ): Promise<AcademicTermResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return AcademicTermResponseDto.from(
      await this.service.update(id, expectedVersion, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sequence !== undefined ? { sequence: body.sequence } : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
        ...(body.endDate !== undefined ? { endDate: new Date(body.endDate) } : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicPermissions.TERM_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete an academic term.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict' })
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
