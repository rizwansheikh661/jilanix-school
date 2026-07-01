/**
 * ExamMarksHistoryController — `/exams/:examId/marks/:id/history` reads.
 */
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { EXAM_MARKS_CHANGE_TYPE_VALUES, ExaminationPermissions } from '../examination.constants';
import type { ExamMarksChangeTypeValue } from '../examination.constants';
import type { ExamMarksHistoryRow } from '../examination.types';
import { ExamMarksHistoryService } from './exam-marks-history.service';

export class ExamMarksHistoryResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly examMarksId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly previousMarks!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly newMarks!: number | null;
  @ApiProperty() public readonly previousIsAbsent!: boolean;
  @ApiProperty() public readonly newIsAbsent!: boolean;
  @ApiProperty({ enum: EXAM_MARKS_CHANGE_TYPE_VALUES })
  public readonly changeType!: ExamMarksChangeTypeValue;
  @ApiPropertyOptional({ nullable: true }) public readonly changedBy!: string | null;
  @ApiProperty() public readonly changedAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly reason!: string | null;

  public static from(row: ExamMarksHistoryRow): ExamMarksHistoryResponseDto {
    return {
      id: row.id,
      examMarksId: row.examMarksId,
      previousMarks: row.previousMarks,
      newMarks: row.newMarks,
      previousIsAbsent: row.previousIsAbsent,
      newIsAbsent: row.newIsAbsent,
      changeType: row.changeType,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
      reason: row.reason,
    };
  }
}

export class ExamMarksHistoryListResponseDto {
  @ApiProperty({ type: () => [ExamMarksHistoryResponseDto] })
  public readonly items!: readonly ExamMarksHistoryResponseDto[];
}

@ApiTags('Examination')
@ApiBearerAuth()
@Controller({ path: 'exams/:examId/marks/:id/history', version: '1' })
export class ExamMarksHistoryController {
  constructor(private readonly service: ExamMarksHistoryService) {}

  @Get()
  @RequirePermissions(ExaminationPermissions.MARKS_HISTORY_READ)
  @ApiOperation({ summary: 'Read append-only marks edit history (most-recent first).' })
  @ApiOkResponse({ type: ExamMarksHistoryListResponseDto })
  public async list(
    @Param('examId', new ParseUUIDPipe()) _examId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ExamMarksHistoryListResponseDto> {
    void _examId;
    const rows = await this.service.listForMarks(id);
    return { items: rows.map(ExamMarksHistoryResponseDto.from) };
  }
}
