/**
 * ExamScheduleController — `/exams/:examId/schedule` routes.
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
import { RequirePermissions } from '../../rbac';
import { ExaminationPermissions } from '../examination.constants';
import {
  BulkExamScheduleDto,
  BulkExamScheduleResponseDto,
  CreateExamScheduleDto,
  ExamScheduleListQueryDto,
  ExamScheduleListResponseDto,
  ExamScheduleResponseDto,
  UpdateExamScheduleDto,
} from './exam-schedule.dto';
import { ExamScheduleService } from './exam-schedule.service';

@ApiTags('Examination')
@ApiBearerAuth()
@Controller({ path: 'exams/:examId/schedule', version: '1' })
export class ExamScheduleController {
  constructor(private readonly service: ExamScheduleService) {}

  @Get()
  @RequirePermissions(ExaminationPermissions.SCHEDULE_READ)
  @ApiOperation({ summary: 'List schedule rows for an exam.' })
  @ApiOkResponse({ type: ExamScheduleListResponseDto })
  public async list(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Query() query: ExamScheduleListQueryDto,
  ): Promise<ExamScheduleListResponseDto> {
    const rows = await this.service.list(examId, {
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId !== undefined ? { subjectId: query.subjectId } : {}),
    });
    return { items: rows.map(ExamScheduleResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(ExaminationPermissions.SCHEDULE_READ)
  @ApiOperation({ summary: 'Get a single schedule row by id.' })
  @ApiOkResponse({ type: ExamScheduleResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('examId', new ParseUUIDPipe()) _examId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ExamScheduleResponseDto> {
    void _examId;
    return ExamScheduleResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(ExaminationPermissions.SCHEDULE_CREATE)
  @ApiOperation({ summary: 'Create a single schedule row.' })
  @ApiCreatedResponse({ type: ExamScheduleResponseDto })
  public async create(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Body() body: CreateExamScheduleDto,
  ): Promise<ExamScheduleResponseDto> {
    const row = await this.service.create(examId, {
      subjectId: body.subjectId,
      sectionId: body.sectionId,
      ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
      ...(body.invigilatorStaffId !== undefined
        ? { invigilatorStaffId: body.invigilatorStaffId }
        : {}),
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      ...(body.maxMarks !== undefined ? { maxMarks: body.maxMarks } : {}),
      ...(body.passMarks !== undefined ? { passMarks: body.passMarks } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
    });
    return ExamScheduleResponseDto.from(row);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.MULTI_STATUS)
  @RequirePermissions(ExaminationPermissions.SCHEDULE_BULK)
  @ApiOperation({ summary: 'Bulk-create schedule rows (\u2264200; partial success).' })
  @ApiOkResponse({ type: BulkExamScheduleResponseDto })
  public async bulk(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Body() body: BulkExamScheduleDto,
  ): Promise<BulkExamScheduleResponseDto> {
    const result = await this.service.bulkCreate(
      examId,
      body.items.map((it) => ({
        subjectId: it.subjectId,
        sectionId: it.sectionId,
        ...(it.roomId !== undefined ? { roomId: it.roomId } : {}),
        ...(it.invigilatorStaffId !== undefined
          ? { invigilatorStaffId: it.invigilatorStaffId }
          : {}),
        date: it.date,
        startTime: it.startTime,
        endTime: it.endTime,
        ...(it.maxMarks !== undefined ? { maxMarks: it.maxMarks } : {}),
        ...(it.passMarks !== undefined ? { passMarks: it.passMarks } : {}),
        ...(it.instructions !== undefined ? { instructions: it.instructions } : {}),
      })),
    );
    return {
      created: result.created.map(ExamScheduleResponseDto.from),
      failed: [...result.failed],
    };
  }

  @Patch(':id')
  @RequirePermissions(ExaminationPermissions.SCHEDULE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a schedule row.' })
  @ApiOkResponse({ type: ExamScheduleResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateExamScheduleDto,
  ): Promise<ExamScheduleResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(examId, id, expectedVersion, {
      ...(body.subjectId !== undefined ? { subjectId: body.subjectId } : {}),
      ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
      ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
      ...(body.invigilatorStaffId !== undefined
        ? { invigilatorStaffId: body.invigilatorStaffId }
        : {}),
      ...(body.date !== undefined ? { date: body.date } : {}),
      ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
      ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
      ...(body.maxMarks !== undefined ? { maxMarks: body.maxMarks } : {}),
      ...(body.passMarks !== undefined ? { passMarks: body.passMarks } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
    });
    return ExamScheduleResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ExaminationPermissions.SCHEDULE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a schedule row.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(examId, id, expectedVersion);
  }
}
