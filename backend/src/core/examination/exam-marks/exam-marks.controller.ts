/**
 * ExamMarksController — `/exams/:examId/marks` routes.
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
  Post,
  Put,
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
  BulkMarksDto,
  BulkMarksResponseDto,
  ExamMarksListResponseDto,
  ExamMarksResponseDto,
  MarksMatrixQueryDto,
  UpsertExamMarksDto,
} from './exam-marks.dto';
import { ExamMarksService } from './exam-marks.service';

@ApiTags('Examination')
@ApiBearerAuth()
@Controller({ path: 'exams/:examId/marks', version: '1' })
export class ExamMarksController {
  constructor(private readonly service: ExamMarksService) {}

  @Get()
  @RequirePermissions(ExaminationPermissions.MARKS_READ)
  @ApiOperation({
    summary: 'List marks for an exam, optionally filtered by section + subject.',
  })
  @ApiOkResponse({ type: ExamMarksListResponseDto })
  public async list(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Query() query: MarksMatrixQueryDto,
  ): Promise<ExamMarksListResponseDto> {
    const items = await this.service.list(examId, {
      sectionId: query.sectionId,
      subjectId: query.subjectId,
    });
    const maxVersion = items.reduce(
      (acc, r) => (r.version > acc ? r.version : acc),
      0,
    );
    return {
      items: items.map(ExamMarksResponseDto.from),
      version: maxVersion,
    };
  }

  @Post()
  @RequirePermissions(ExaminationPermissions.MARKS_CREATE)
  @ApiOperation({ summary: 'Upsert marks for a single (student, subject).' })
  @ApiCreatedResponse({ type: ExamMarksResponseDto })
  public async upsert(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Body() body: UpsertExamMarksDto,
  ): Promise<ExamMarksResponseDto> {
    const row = await this.service.upsert(examId, {
      studentId: body.studentId,
      subjectId: body.subjectId,
      sectionId: body.sectionId,
      marksObtained: body.marksObtained ?? null,
      isAbsent: body.isAbsent,
      ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
    });
    return ExamMarksResponseDto.from(row);
  }

  @Put()
  @RequirePermissions(ExaminationPermissions.MARKS_BULK)
  @ApiOperation({
    summary:
      'Bulk-replace marks for (section, subject); body carries optimistic-lock version.',
  })
  @ApiOkResponse({ type: BulkMarksResponseDto })
  public async bulk(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Body() body: BulkMarksDto,
  ): Promise<BulkMarksResponseDto> {
    const result = await this.service.bulkUpsert(examId, {
      sectionId: body.sectionId,
      subjectId: body.subjectId,
      version: body.version,
      entries: body.entries.map((e) => ({
        studentId: e.studentId,
        marksObtained: e.marksObtained ?? null,
        isAbsent: e.isAbsent,
        ...(e.remarks !== undefined ? { remarks: e.remarks } : {}),
      })),
    });
    return { entries: result.entries.map(ExamMarksResponseDto.from) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ExaminationPermissions.MARKS_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a marks row.' })
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
