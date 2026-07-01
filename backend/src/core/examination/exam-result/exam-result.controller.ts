/**
 * ExamResultController — `/exams/:examId/results` routes.
 *
 *   POST /compute        idempotent compute (Idempotency-Key honored by the
 *                        global middleware).
 *   GET  /               list computed results (?sectionId=&studentId=).
 *   GET  /:studentId     single student's result with subject breakdown.
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { ExaminationPermissions } from '../examination.constants';
import {
  ComputeExamResultsResponseDto,
  ExamResultListResponseDto,
  ExamResultResponseDto,
  ResultListQueryDto,
} from './exam-result.dto';
import { ExamResultService } from './exam-result.service';

@ApiTags('Examination')
@ApiBearerAuth()
@Controller({ path: 'exams/:examId/results', version: '1' })
export class ExamResultController {
  constructor(private readonly service: ExamResultService) {}

  @Post('compute')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ExaminationPermissions.RESULT_COMPUTE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional idempotency key honored by the global middleware; the underlying compute is itself idempotent.',
  })
  @ApiOperation({
    summary:
      'Compute or recompute exam results — rewrites ExamResult + ExamSubjectResult rows.',
  })
  @ApiOkResponse({ type: ComputeExamResultsResponseDto })
  public async compute(
    @Param('examId', new ParseUUIDPipe()) examId: string,
  ): Promise<ComputeExamResultsResponseDto> {
    const summary = await this.service.compute(examId);
    return {
      examId: summary.examId,
      resultCount: summary.resultCount,
      passCount: summary.passCount,
      failCount: summary.failCount,
      results: summary.results.map(ExamResultResponseDto.from),
    };
  }

  @Get()
  @RequirePermissions(ExaminationPermissions.RESULT_LIST)
  @ApiOperation({ summary: 'List computed results for an exam.' })
  @ApiOkResponse({ type: ExamResultListResponseDto })
  public async list(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Query() query: ResultListQueryDto,
  ): Promise<ExamResultListResponseDto> {
    const rows = await this.service.list(examId, {
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
    });
    return { items: rows.map(ExamResultResponseDto.from) };
  }

  @Get(':studentId')
  @RequirePermissions(ExaminationPermissions.RESULT_READ)
  @ApiOperation({ summary: "Read a single student's exam result." })
  @ApiOkResponse({ type: ExamResultResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('examId', new ParseUUIDPipe()) examId: string,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ExamResultResponseDto> {
    const row = await this.service.getByStudent(examId, studentId);
    return ExamResultResponseDto.from(row);
  }
}
