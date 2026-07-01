/**
 * AcademicYearController — HTTP routes for the academic-years resource.
 *
 * Mounted at `/api/v1/academic-years` via the global prefix + URI
 * versioning configured in `apps/api/main.ts`. Authenticated by default
 * (JwtAuthGuard global); each handler declares the required permission via
 * `@RequirePermissions` so the global PermissionsGuard enforces it.
 *
 * Mutations (`PATCH`, `POST /:id/activate`) require an `If-Match` header
 * carrying the row's current `version`; missing/malformed → 422, mismatch
 * → 409 `VERSION_CONFLICT`. The cursor pagination is opaque: clients echo
 * `nextCursor` from the previous page response.
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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
  AcademicYearListResponseDto,
  AcademicYearResponseDto,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
} from './academic-year.dto';
import { AcademicYearService } from './academic-year.service';

@ApiTags('AcademicYears')
@ApiBearerAuth()
@Controller({ path: 'academic-years', version: '1' })
export class AcademicYearController {
  constructor(private readonly service: AcademicYearService) {}

  @Get()
  @RequirePermissions(AcademicPermissions.YEAR_READ)
  @ApiOperation({ summary: 'List academic years for the current tenant.' })
  @ApiOkResponse({ type: AcademicYearListResponseDto })
  public async list(@Query() query: PaginationQueryDto): Promise<AcademicYearListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
    });
    return {
      items: result.items.map(AcademicYearResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AcademicPermissions.YEAR_CREATE)
  @ApiOperation({ summary: 'Create an academic year.' })
  @ApiCreatedResponse({ type: AcademicYearResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'date range invalid' })
  @ApiConflictResponse({ description: 'overlapping range or duplicate name' })
  public async create(@Body() body: CreateAcademicYearDto): Promise<AcademicYearResponseDto> {
    const row = await this.service.create({
      name: body.name,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    });
    return AcademicYearResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(AcademicPermissions.YEAR_READ)
  @ApiOperation({ summary: 'Get a single academic year.' })
  @ApiOkResponse({ type: AcademicYearResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AcademicYearResponseDto> {
    return AcademicYearResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AcademicPermissions.YEAR_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true, description: 'Current row version, e.g. "3".' })
  @ApiOperation({ summary: 'Update an academic year.' })
  @ApiOkResponse({ type: AcademicYearResponseDto })
  @ApiNotFoundResponse()
  @ApiUnprocessableEntityResponse()
  @ApiConflictResponse({ description: 'version conflict or overlapping range' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAcademicYearDto,
  ): Promise<AcademicYearResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
      ...(body.endDate !== undefined ? { endDate: new Date(body.endDate) } : {}),
    });
    return AcademicYearResponseDto.from(row);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AcademicPermissions.YEAR_ACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true, description: 'Current row version, e.g. "3".' })
  @ApiOperation({ summary: 'Mark an academic year current (demotes any other current year).' })
  @ApiOkResponse({ type: AcademicYearResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict' })
  public async activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<AcademicYearResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return AcademicYearResponseDto.from(await this.service.activate(id, expectedVersion));
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
