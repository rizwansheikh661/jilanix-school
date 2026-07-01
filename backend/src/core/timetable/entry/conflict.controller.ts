/**
 * DTOs + read controller for the append-only `timetable_conflicts`
 * ledger. Writes are owned by `TimetableConflictDetectorService`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto, PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import {
  TIMETABLE_CONFLICT_TYPE_VALUES,
  TimetablePermissions,
  type TimetableConflictTypeValue,
} from '../timetable.constants';
import type { TimetableConflictRow } from '../timetable.types';
import { TimetableConflictRepository } from './conflict.repository';

export class TimetableConflictListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly timetableVersionId?: string;

  @ApiPropertyOptional({ enum: TIMETABLE_CONFLICT_TYPE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(TIMETABLE_CONFLICT_TYPE_VALUES as unknown as object)
  public readonly type?: TimetableConflictTypeValue;
}

export class TimetableConflictResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly timetableVersionId!: string;
  @ApiProperty({ enum: TIMETABLE_CONFLICT_TYPE_VALUES as unknown as string[] })
  public readonly type!: TimetableConflictTypeValue;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly contextJson!: Readonly<Record<string, unknown>>;
  @ApiProperty() public readonly entryAId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly entryBId!: string | null;
  @ApiProperty() public readonly detectedAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly detectedBy!: string | null;

  public static from(row: TimetableConflictRow): TimetableConflictResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      timetableVersionId: row.timetableVersionId,
      type: row.type,
      contextJson: row.contextJson,
      entryAId: row.entryAId,
      entryBId: row.entryBId,
      detectedAt: row.detectedAt.toISOString(),
      detectedBy: row.detectedBy,
    };
  }
}

export class TimetableConflictListResponseDto {
  @ApiProperty({ type: () => [TimetableConflictResponseDto] })
  public readonly items!: readonly TimetableConflictResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller({ path: 'timetable/conflicts', version: '1' })
export class TimetableConflictController {
  constructor(private readonly repo: TimetableConflictRepository) {}

  @Get()
  @RequirePermissions(TimetablePermissions.CONFLICT_READ)
  @ApiOperation({ summary: 'List timetable conflicts (append-only ledger).' })
  @ApiOkResponse({ type: TimetableConflictListResponseDto })
  public async list(
    @Query() query: TimetableConflictListQueryDto,
  ): Promise<TimetableConflictListResponseDto> {
    const { rows, nextCursorId } = await this.repo.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.timetableVersionId !== undefined
        ? { timetableVersionId: query.timetableVersionId }
        : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
    });
    return {
      items: rows.map(TimetableConflictResponseDto.from),
      nextCursor: nextCursorId,
    };
  }
}
