/**
 * SectionController — HTTP routes for `/api/v1/sections`. The
 * `assign-class-teacher` sub-route gates on a dedicated permission so an
 * admin role can be wired to manage staffing without granting full
 * section-update rights.
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
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AcademicPermissions } from '../academic.constants';
import { parseIfMatch } from '../academic.errors';
import {
  AssignClassTeacherDto,
  CreateSectionDto,
  SectionListResponseDto,
  SectionResponseDto,
  UpdateSectionDto,
} from './section.dto';
import { SectionService } from './section.service';

class SectionListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  public readonly classId?: string;
}

@ApiTags('Sections')
@ApiBearerAuth()
@Controller({ path: 'sections', version: '1' })
export class SectionController {
  constructor(private readonly service: SectionService) {}

  @Get()
  @RequirePermissions(AcademicPermissions.SECTION_READ)
  @ApiOperation({ summary: 'List sections; filter by classId.' })
  @ApiQuery({ name: 'classId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: SectionListResponseDto })
  public async list(@Query() query: SectionListQueryDto): Promise<SectionListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.classId !== undefined ? { classId: query.classId } : {}),
    });
    return {
      items: result.items.map(SectionResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AcademicPermissions.SECTION_CREATE)
  @ApiOperation({ summary: 'Create a section under a class.' })
  @ApiCreatedResponse({ type: SectionResponseDto })
  @ApiConflictResponse({ description: 'duplicate name within class' })
  @ApiUnprocessableEntityResponse({ description: 'unknown class or ineligible teacher' })
  public async create(@Body() body: CreateSectionDto): Promise<SectionResponseDto> {
    const row = await this.service.create({
      classId: body.classId,
      name: body.name,
      ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      ...(body.classTeacherId !== undefined ? { classTeacherId: body.classTeacherId } : {}),
    });
    return SectionResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(AcademicPermissions.SECTION_READ)
  @ApiOperation({ summary: 'Get a single section.' })
  @ApiOkResponse({ type: SectionResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SectionResponseDto> {
    return SectionResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AcademicPermissions.SECTION_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a section (name / capacity).' })
  @ApiOkResponse({ type: SectionResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict or duplicate name' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSectionDto,
  ): Promise<SectionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return SectionResponseDto.from(
      await this.service.update(id, expectedVersion, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicPermissions.SECTION_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a section.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }

  @Post(':id/assign-class-teacher')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AcademicPermissions.SECTION_ASSIGN_TEACHER)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Assign or unassign the class teacher.' })
  @ApiOkResponse({ type: SectionResponseDto })
  @ApiNotFoundResponse()
  @ApiUnprocessableEntityResponse({ description: 'teacher not eligible' })
  @ApiConflictResponse({ description: 'version conflict' })
  public async assignTeacher(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AssignClassTeacherDto,
  ): Promise<SectionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return SectionResponseDto.from(
      await this.service.assignClassTeacher(id, expectedVersion, body.teacherId),
    );
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
