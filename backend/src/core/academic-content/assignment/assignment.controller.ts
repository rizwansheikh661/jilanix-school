/**
 * AssignmentController — `/assignments` lifecycle routes.
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
  AssignmentListQueryDto,
  AssignmentListResponseDto,
  AssignmentResponseDto,
  CancelAssignmentDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
} from './assignment.dto';
import { AssignmentService } from './assignment.service';

@ApiTags('Assignment')
@ApiBearerAuth()
@Controller({ path: 'assignments', version: '1' })
export class AssignmentController {
  constructor(private readonly service: AssignmentService) {}

  @Get()
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_READ)
  @ApiOperation({ summary: 'List assignments (cursor paginated).' })
  @ApiOkResponse({ type: AssignmentListResponseDto })
  public async list(
    @Query() query: AssignmentListQueryDto,
  ): Promise<AssignmentListResponseDto> {
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
      items: items.map(AssignmentResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_READ)
  @ApiOperation({ summary: 'Get an assignment by id.' })
  @ApiOkResponse({ type: AssignmentResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_CREATE)
  @ApiOperation({ summary: 'Create a DRAFT assignment.' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiCreatedResponse({ type: AssignmentResponseDto })
  public async create(
    @Body() body: CreateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    const row = await this.service.create({
      ...(body.code !== undefined ? { code: body.code } : {}),
      title: body.title,
      description: body.description ?? null,
      academicYearId: body.academicYearId,
      classId: body.classId,
      sectionId: body.sectionId,
      subjectId: body.subjectId,
      assignedByStaffId: body.assignedByStaffId,
      assignedDate: new Date(body.assignedDate),
      dueDate: new Date(body.dueDate),
      maxMarks: body.maxMarks,
      passingMarks: body.passingMarks,
    });
    return AssignmentResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Update assignment (free in DRAFT; dueDate/description only after publish).',
  })
  @ApiOkResponse({ type: AssignmentResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.assignedDate !== undefined
        ? { assignedDate: new Date(body.assignedDate) }
        : {}),
      ...(body.dueDate !== undefined ? { dueDate: new Date(body.dueDate) } : {}),
      ...(body.maxMarks !== undefined ? { maxMarks: body.maxMarks } : {}),
      ...(body.passingMarks !== undefined
        ? { passingMarks: body.passingMarks }
        : {}),
    });
    return AssignmentResponseDto.from(row);
  }

  @Post(':id/publish')
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_PUBLISH)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Transition DRAFT → PUBLISHED; dispatches ASSIGNMENT_PUBLISHED.',
  })
  @ApiOkResponse({ type: AssignmentResponseDto })
  public async publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(
      await this.service.publish(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/close')
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_CLOSE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Transition PUBLISHED → CLOSED.' })
  @ApiOkResponse({ type: AssignmentResponseDto })
  public async close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(
      await this.service.close(id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel from any non-terminal state.' })
  @ApiOkResponse({ type: AssignmentResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(
      await this.service.cancel(id, parseIfMatch(ifMatch), body.reason ?? null),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete an assignment (refused if PUBLISHED — cancel first).',
  })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }
}
