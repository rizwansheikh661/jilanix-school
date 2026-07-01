/**
 * ExamDefinitionController — `/exams` routes.
 *
 * Endpoints:
 *   GET    /api/v1/exams                 — list (cursor pagination + filters)
 *   GET    /api/v1/exams/:id             — get one (with class/section maps)
 *   POST   /api/v1/exams                 — create (DRAFT)
 *   PATCH  /api/v1/exams/:id             — update header + replace maps
 *   POST   /api/v1/exams/:id/publish     — DRAFT → PUBLISHED
 *   POST   /api/v1/exams/:id/archive     — PUBLISHED → ARCHIVED
 *   DELETE /api/v1/exams/:id             — soft-delete (DRAFT only)
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
import { ExaminationPermissions } from '../examination.constants';
import {
  CreateExamDto,
  ExamHeaderResponseDto,
  ExamListQueryDto,
  ExamListResponseDto,
  ExamResponseDto,
  UpdateExamDto,
} from './exam-definition.dto';
import { ExamDefinitionService } from './exam-definition.service';

@ApiTags('Examination')
@ApiBearerAuth()
@Controller({ path: 'exams', version: '1' })
export class ExamDefinitionController {
  constructor(private readonly service: ExamDefinitionService) {}

  @Get()
  @RequirePermissions(ExaminationPermissions.EXAM_READ)
  @ApiOperation({ summary: 'List exams (cursor paginated; filter by year/term/type/status).' })
  @ApiOkResponse({ type: ExamListResponseDto })
  public async list(
    @Query() query: ExamListQueryDto,
  ): Promise<ExamListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
      ...(query.academicTermId !== undefined ? { academicTermId: query.academicTermId } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      items: items.map(ExamResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(ExaminationPermissions.EXAM_READ)
  @ApiOperation({ summary: 'Get an exam by id with class/section maps.' })
  @ApiOkResponse({ type: ExamResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ExamResponseDto> {
    return ExamResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(ExaminationPermissions.EXAM_CREATE)
  @ApiOperation({ summary: 'Create a DRAFT exam with class/section maps.' })
  @ApiCreatedResponse({ type: ExamResponseDto })
  public async create(
    @Body() body: CreateExamDto,
  ): Promise<ExamResponseDto> {
    const row = await this.service.create({
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      academicYearId: body.academicYearId,
      ...(body.academicTermId !== undefined ? { academicTermId: body.academicTermId } : {}),
      examSchemeId: body.examSchemeId,
      name: body.name,
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      ...(body.defaultMaxMarks !== undefined ? { defaultMaxMarks: body.defaultMaxMarks } : {}),
      ...(body.defaultPassMarks !== undefined ? { defaultPassMarks: body.defaultPassMarks } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      classIds: body.classIds,
      sectionIds: body.sectionIds,
    });
    return ExamResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(ExaminationPermissions.EXAM_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Update exam; supplying `classIds[]` / `sectionIds[]` replaces those maps wholesale.',
  })
  @ApiOkResponse({ type: ExamResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateExamDto,
  ): Promise<ExamResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      ...(body.academicTermId !== undefined ? { academicTermId: body.academicTermId } : {}),
      ...(body.examSchemeId !== undefined ? { examSchemeId: body.examSchemeId } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
      ...(body.defaultMaxMarks !== undefined ? { defaultMaxMarks: body.defaultMaxMarks } : {}),
      ...(body.defaultPassMarks !== undefined ? { defaultPassMarks: body.defaultPassMarks } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.classIds !== undefined ? { classIds: body.classIds } : {}),
      ...(body.sectionIds !== undefined ? { sectionIds: body.sectionIds } : {}),
    });
    return ExamResponseDto.from(row);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ExaminationPermissions.EXAM_PUBLISH)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Publish a DRAFT exam.' })
  @ApiOkResponse({ type: ExamHeaderResponseDto })
  @ApiNotFoundResponse()
  public async publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ExamHeaderResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return ExamHeaderResponseDto.from(await this.service.publish(id, expectedVersion));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ExaminationPermissions.EXAM_ARCHIVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Archive a PUBLISHED exam.' })
  @ApiOkResponse({ type: ExamHeaderResponseDto })
  @ApiNotFoundResponse()
  public async archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ExamHeaderResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return ExamHeaderResponseDto.from(await this.service.archive(id, expectedVersion));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ExaminationPermissions.EXAM_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a DRAFT exam.' })
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
