/**
 * DTOs for the teacher-load read endpoints under `/timetable`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { TeacherLoadRow } from '../timetable.types';

export class TeacherLoadResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly timetableVersionId!: string;
  @ApiProperty() public readonly staffId!: string;
  @ApiProperty() public readonly periodsPerWeek!: number;
  @ApiProperty() public readonly maxConsecutive!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  public readonly dailyCounts!: Readonly<Record<string, number>>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  public readonly subjectMix!: Readonly<Record<string, number>>;
  @ApiProperty() public readonly computedAt!: string;
  @ApiProperty() public readonly version!: number;

  public static from(row: TeacherLoadRow): TeacherLoadResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      timetableVersionId: row.timetableVersionId,
      staffId: row.staffId,
      periodsPerWeek: row.periodsPerWeek,
      maxConsecutive: row.maxConsecutive,
      dailyCounts: row.dailyCounts,
      subjectMix: row.subjectMix,
      computedAt: row.computedAt.toISOString(),
      version: row.version,
    };
  }
}

export class TeacherLoadListResponseDto {
  @ApiProperty({ type: () => [TeacherLoadResponseDto] })
  public readonly items!: readonly TeacherLoadResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  public readonly nextCursor!: string | null;
}
