/**
 * DTOs for `/fees/ledger/students/:studentId`.
 *
 * Query: optional `academicYearId` filter.
 * Response: a `StudentFeeLedger` (entries[] + totals) with each Date ISO-
 * stringified at the boundary.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import type { LedgerEntry, StudentFeeLedger } from '../fees.types';
import type { LedgerEntryType } from '../fees.types';

export const LEDGER_ENTRY_TYPE_VALUES: readonly LedgerEntryType[] = [
  'INVOICE',
  'PAYMENT',
  'REFUND',
  'FINE',
  'DISCOUNT',
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export class LedgerQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly academicYearId?: string;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export class LedgerEntryResponseDto {
  @ApiProperty({ format: 'date-time' }) public readonly at!: string;
  @ApiProperty({ enum: LEDGER_ENTRY_TYPE_VALUES })
  public readonly type!: LedgerEntryType;
  @ApiProperty() public readonly referenceId!: string;
  @ApiProperty() public readonly description!: string;
  @ApiProperty() public readonly debit!: number;
  @ApiProperty() public readonly credit!: number;
  @ApiProperty() public readonly runningBalance!: number;

  public static from(entry: LedgerEntry): LedgerEntryResponseDto {
    return {
      at: entry.at.toISOString(),
      type: entry.type,
      referenceId: entry.referenceId,
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      runningBalance: entry.runningBalance,
    };
  }
}

export class StudentFeeLedgerTotalsResponseDto {
  @ApiProperty() public readonly totalInvoiced!: number;
  @ApiProperty() public readonly totalPaid!: number;
  @ApiProperty() public readonly totalRefunded!: number;
  @ApiProperty() public readonly outstandingBalance!: number;
}

export class StudentFeeLedgerResponseDto {
  @ApiProperty() public readonly studentId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly academicYearId!: string | null;
  @ApiProperty({ type: () => [LedgerEntryResponseDto] })
  public readonly entries!: readonly LedgerEntryResponseDto[];
  @ApiProperty({ type: () => StudentFeeLedgerTotalsResponseDto })
  public readonly totals!: StudentFeeLedgerTotalsResponseDto;

  public static from(ledger: StudentFeeLedger): StudentFeeLedgerResponseDto {
    return {
      studentId: ledger.studentId,
      academicYearId: ledger.academicYearId,
      entries: ledger.entries.map((e) => LedgerEntryResponseDto.from(e)),
      totals: {
        totalInvoiced: ledger.totals.totalInvoiced,
        totalPaid: ledger.totals.totalPaid,
        totalRefunded: ledger.totals.totalRefunded,
        outstandingBalance: ledger.totals.outstandingBalance,
      },
    };
  }
}
