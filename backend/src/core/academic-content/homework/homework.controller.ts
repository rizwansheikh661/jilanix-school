/**
 * HomeworkController — `/homework` lifecycle routes.
 *
 * REST_API_DESIGN.md §6.5 prescribed `/api/v1/teacher/homework`. Sprint 12
 * mounts at `/homework` (resource-rooted, mirrors `/events`) since the
 * Teacher Portal surface is deferred and RBAC is the authority on access.
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
import { AcademicContentPermissions } from '../academic-content.constants';
import {
  CancelHomeworkDto,
  CreateHomeworkDto,
  HomeworkListQueryDto,
  HomeworkListResponseDto,
  HomeworkResponseDto,
  UpdateHomeworkDto,
} from './homework.dto';
import { HomeworkService } from './homework.service';

@ApiTags('Homework')
@ApiBearerAuth()
@Controller({ path: 'homework', version: '1' })
export class HomeworkController {
  constructor(private readonly service: HomeworkService) {}

  @Get()
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_READ)
  @ApiOperation({ summary: 'List homework (cursor paginated).' })
  @ApiOkResponse({ type: HomeworkListResponseDto })
  public async list(
    @Query() query: HomeworkListQueryDto,
  ): Promise<HomeworkListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.academicYearId !== undefined
        ? { academicYearId: query.academicYearId }
        : {}),
      ...(query.classId !== undefined ? { classId: query.classId } : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId !== undefined ? { subjectId: query.subjectId } : {}),
      ...(query.assignedByStaffId !== undefined
        ? { assignedByStaffId: query.assignedByStaffId }
        : {}),
      ...(query.dueFrom !== undefined ? { dueFrom: new Date(query.dueFrom) } : {}),
      ...(query.dueTo !== undefined ? { dueTo: new Date(query.dueTo) } : {}),
    });
    return {
      items: items.map(HomeworkResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_READ)
  @ApiOperation({ summary: 'Get a homework by id (header + attachmentCount).' })
  @ApiOkResponse({ type: HomeworkResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<HomeworkResponseDto> {
    return HomeworkResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_CREATE)
  @ApiOperation({ summary: 'Create a DRAFT homework.' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiCreatedResponse({ type: HomeworkResponseDto })
  public async create(
    @Body() body: CreateHomeworkDto,
  ): Promise<HomeworkResponseDto> {
    const row = await this.service.create({
      ...(body.code !== undefined ? { code: body.code } : {}),
      title: body.title,
      description: body.description ?? null,
      instructions: body.instructions ?? null,
      academicYearId: body.academicYearId,
      classId: body.classId,
      sectionId: body.sectionId,
      subjectId: body.subjectId,
      assignedByStaffId: body.assignedByStaffId,
      assignedDate: new Date(body.assignedDate),
      dueDate: new Date(body.dueDate),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
    });
    return HomeworkResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Update homework (free in DRAFT; dueDate/priority/instructions only after publish).',
  })
  @ApiOkResponse({ type: HomeworkResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateHomeworkDto,
  ): Promise<HomeworkResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.instructions !== undefined
        ? { instructions: body.instructions }
        : {}),
      ...(body.assignedDate !== undefined
        ? { assignedDate: new Date(body.assignedDate) }
        : {}),
      ...(body.dueDate !== undefined ? { dueDate: new Date(body.dueDate) } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
    });
    return HomeworkResponseDto.from(row);
  }

  @Post(':id/publish')
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_PUBLISH)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Transition DRAFT → PUBLISHED; dispatches HOMEWORK_PUBLISHED.',
  })
  @ApiOkResponse({ type: HomeworkResponseDto })
  public async publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<HomeworkResponseDto> {
    return HomeworkResponseDto.from(
      await this.service.publish(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/close')
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_CLOSE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Transition PUBLISHED → CLOSED; dispatches HOMEWORK_CLOSED.',
  })
  @ApiOkResponse({ type: HomeworkResponseDto })
  public async close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<HomeworkResponseDto> {
    return HomeworkResponseDto.from(
      await this.service.close(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel from any non-terminal state.' })
  @ApiOkResponse({ type: HomeworkResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelHomeworkDto,
  ): Promise<HomeworkResponseDto> {
    return HomeworkResponseDto.from(
      await this.service.cancel(id, parseIfMatch(ifMatch), body.reason ?? null),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete a homework (refused if PUBLISHED — cancel first).',
  })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }
}
