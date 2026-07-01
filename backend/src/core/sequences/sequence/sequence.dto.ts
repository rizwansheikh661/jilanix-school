/**
 * Sequence DTOs — read-only response shapes for the `/sequences` admin
 * endpoints. Sequence consumption itself is service-internal (Staff /
 * Admission / Fees call `SequenceService.nextValue` directly), so there is no
 * write DTO.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

import { ALL_SEQUENCE_NAMES, type SequenceName } from '../sequences.constants';
import type { TenantSequenceRow } from '../sequences.types';

export class PeekSequenceQueryDto {
  @ApiPropertyOptional({
    description:
      'Fiscal year (YYYY-YY) — required for fiscal-scoped sequences (invoice, receipt). Omit for evergreen sequences.',
    example: '2026-27',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fiscalYear must match YYYY-YY (e.g. "2026-27").' })
  public readonly fiscalYear?: string;
}

export class SequenceResponseDto {
  @ApiProperty({ enum: ALL_SEQUENCE_NAMES as unknown as string[] })
  public readonly sequenceName!: SequenceName;

  @ApiProperty({
    nullable: true,
    description: 'Fiscal year (YYYY-YY) for fiscal-scoped counters; null otherwise.',
  })
  public readonly fiscalYear!: string | null;

  @ApiProperty({ description: 'Last allocated integer; 0 before any allocation.' })
  public readonly lastValue!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  public readonly updatedAt!: string | null;

  public static from(row: TenantSequenceRow): SequenceResponseDto {
    return {
      sequenceName: row.sequenceName,
      fiscalYear: row.fiscalYear,
      lastValue: row.lastValue,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public static fromPeek(args: {
    readonly sequenceName: SequenceName;
    readonly fiscalYear: string | null;
    readonly lastValue: number;
    readonly updatedAt: Date | null;
  }): SequenceResponseDto {
    return {
      sequenceName: args.sequenceName,
      fiscalYear: args.fiscalYear,
      lastValue: args.lastValue,
      updatedAt: args.updatedAt === null ? null : args.updatedAt.toISOString(),
    };
  }
}

export class SequenceListResponseDto {
  @ApiProperty({ type: [SequenceResponseDto] })
  public readonly items!: readonly SequenceResponseDto[];
}
