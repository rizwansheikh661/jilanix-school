/**
 * SyllabusController — `/syllabi` + nested `/syllabi/:id/nodes` +
 * `/syllabus-nodes/:id/...` lifecycle.
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
  CompleteSyllabusNodeDto,
  CreateSyllabusDto,
  CreateSyllabusNodeDto,
  SyllabusListQueryDto,
  SyllabusListResponseDto,
  SyllabusNodeListResponseDto,
  SyllabusNodeResponseDto,
  SyllabusResponseDto,
  UpdateSyllabusDto,
  UpdateSyllabusNodeDto,
} from './syllabus.dto';
import { SyllabusService } from './syllabus.service';

@ApiTags('Syllabus')
@ApiBearerAuth()
@Controller({ version: '1' })
export class SyllabusController {
  constructor(private readonly service: SyllabusService) {}

  // -------- /syllabi --------

  @Get('syllabi')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_READ)
  @ApiOperation({ summary: 'List syllabi (cursor paginated).' })
  @ApiOkResponse({ type: SyllabusListResponseDto })
  public async list(
    @Query() query: SyllabusListQueryDto,
  ): Promise<SyllabusListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.academicYearId !== undefined
        ? { academicYearId: query.academicYearId }
        : {}),
      ...(query.classId !== undefined ? { classId: query.classId } : {}),
      ...(query.subjectId !== undefined ? { subjectId: query.subjectId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.ownedByStaffId !== undefined
        ? { ownedByStaffId: query.ownedByStaffId }
        : {}),
    });
    return {
      items: items.map(SyllabusResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get('syllabi/:id')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_READ)
  @ApiOperation({ summary: 'Get a syllabus by id.' })
  @ApiOkResponse({ type: SyllabusResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SyllabusResponseDto> {
    return SyllabusResponseDto.from(await this.service.getById(id));
  }

  @Post('syllabi')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiCreatedResponse({ type: SyllabusResponseDto })
  public async create(
    @Body() body: CreateSyllabusDto,
  ): Promise<SyllabusResponseDto> {
    const row = await this.service.create({
      academicYearId: body.academicYearId,
      classId: body.classId,
      subjectId: body.subjectId,
      ...(body.plannedCompletionDate !== undefined
        ? {
            plannedCompletionDate:
              body.plannedCompletionDate === null
                ? null
                : new Date(body.plannedCompletionDate),
          }
        : {}),
      ...(body.ownedByStaffId !== undefined
        ? { ownedByStaffId: body.ownedByStaffId }
        : {}),
    });
    return SyllabusResponseDto.from(row);
  }

  @Patch('syllabi/:id')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: SyllabusResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSyllabusDto,
  ): Promise<SyllabusResponseDto> {
    const row = await this.service.update(id, parseIfMatch(ifMatch), {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.plannedCompletionDate !== undefined
        ? {
            plannedCompletionDate:
              body.plannedCompletionDate === null
                ? null
                : new Date(body.plannedCompletionDate),
          }
        : {}),
      ...(body.actualCompletionDate !== undefined
        ? {
            actualCompletionDate:
              body.actualCompletionDate === null
                ? null
                : new Date(body.actualCompletionDate),
          }
        : {}),
      ...(body.ownedByStaffId !== undefined
        ? { ownedByStaffId: body.ownedByStaffId }
        : {}),
    });
    return SyllabusResponseDto.from(row);
  }

  @Delete('syllabi/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.softDelete(id, parseIfMatch(ifMatch));
  }

  // -------- /syllabi/:id/nodes --------

  @Get('syllabi/:id/nodes')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_READ)
  @ApiOperation({ summary: 'List nodes of a syllabus (flat, ordered).' })
  @ApiOkResponse({ type: SyllabusNodeListResponseDto })
  public async listNodes(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SyllabusNodeListResponseDto> {
    const rows = await this.service.listNodes(id);
    return { items: rows.map(SyllabusNodeResponseDto.from) };
  }

  @Post('syllabi/:id/nodes')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_UPDATE)
  @ApiOperation({
    summary:
      'Create a syllabus node (UNIT root / CHAPTER under UNIT / TOPIC under CHAPTER).',
  })
  @ApiCreatedResponse({ type: SyllabusNodeResponseDto })
  public async createNode(
    @Param('id', new ParseUUIDPipe()) syllabusId: string,
    @Body() body: CreateSyllabusNodeDto,
  ): Promise<SyllabusNodeResponseDto> {
    const row = await this.service.upsertNode({
      syllabusId,
      nodeType: body.nodeType,
      name: body.name,
      sequence: body.sequence,
      ...(body.parentNodeId !== undefined
        ? { parentNodeId: body.parentNodeId }
        : {}),
      ...(body.plannedCompletionDate !== undefined
        ? {
            plannedCompletionDate:
              body.plannedCompletionDate === null
                ? null
                : new Date(body.plannedCompletionDate),
          }
        : {}),
    });
    return SyllabusNodeResponseDto.from(row);
  }

  @Patch('syllabus-nodes/:id')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: SyllabusNodeResponseDto })
  public async updateNode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSyllabusNodeDto,
  ): Promise<SyllabusNodeResponseDto> {
    const row = await this.service.updateNode(id, parseIfMatch(ifMatch), {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.sequence !== undefined ? { sequence: body.sequence } : {}),
      ...(body.plannedCompletionDate !== undefined
        ? {
            plannedCompletionDate:
              body.plannedCompletionDate === null
                ? null
                : new Date(body.plannedCompletionDate),
          }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    });
    return SyllabusNodeResponseDto.from(row);
  }

  @Delete('syllabus-nodes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async deleteNode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.deleteNode(id, parseIfMatch(ifMatch));
  }

  @Post('syllabus-nodes/:id/complete')
  @RequirePermissions(AcademicContentPermissions.SYLLABUS_NODE_COMPLETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Mark a TOPIC node COMPLETED; recomputes parent syllabus.completionPercent.',
  })
  @ApiOkResponse({ type: SyllabusNodeResponseDto })
  public async completeNode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CompleteSyllabusNodeDto,
  ): Promise<SyllabusNodeResponseDto> {
    const { node } = await this.service.completeTopic(
      id,
      parseIfMatch(ifMatch),
      {
        completedByStaffId: body.completedByStaffId,
        ...(body.actualCompletionDate !== undefined
          ? {
              actualCompletionDate:
                body.actualCompletionDate === null
                  ? null
                  : new Date(body.actualCompletionDate),
            }
          : {}),
      },
    );
    return SyllabusNodeResponseDto.from(node);
  }
}
