/**
 * TenantSequenceRepository — read-side access for the per-tenant counter
 * catalog. Write-side (atomic allocation) lives in SequenceService because it
 * uses a raw SQL idiom (`INSERT ... ON DUPLICATE KEY UPDATE last_value =
 * LAST_INSERT_ID(last_value + 1)`) that the Prisma model API does not express
 * directly.
 *
 * Tenancy: schoolId comes from RequestContextRegistry only — never accept it
 * as an argument. The tenantScopeExt also stamps it on Prisma model calls, but
 * we still pass it explicitly for raw queries.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SequenceName } from '../sequences.constants';
import { SequenceExhaustedError } from '../sequences.errors';
import type { TenantSequenceRow } from '../sequences.types';

interface RawSequenceRow {
  readonly id: string;
  readonly school_id: string;
  readonly sequence_name: string;
  readonly fiscal_year: string | null;
  readonly last_value: bigint;
  readonly updated_at: Date;
}

@Injectable()
export class TenantSequenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findAll(tx?: PrismaTx): Promise<readonly TenantSequenceRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.tenantSequence.findMany({
      where: { schoolId },
      orderBy: [{ sequenceName: 'asc' }, { fiscalYear: 'asc' }],
    });
    return rows.map((row) => mapRow(row));
  }

  public async findByName(
    name: SequenceName,
    fiscalYear: string | null,
    tx?: PrismaTx,
  ): Promise<TenantSequenceRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.tenantSequence.findFirst({
      where: { schoolId, sequenceName: name, fiscalYear },
    });
    return row === null ? null : mapRow(row);
  }

  /**
   * Atomic allocation: returns the next integer value for (schoolId, name,
   * fiscalYear). Implementation uses MySQL's `LAST_INSERT_ID()` trick so the
   * row's `last_value` is incremented and read in one round-trip, no
   * `SELECT ... FOR UPDATE` needed.
   *
   * The seed `INSERT ... ON DUPLICATE KEY UPDATE` ensures the row exists; on
   * the very first call it's a plain INSERT, otherwise the increment-and-read
   * statement does the work. Both statements run inside the caller's
   * transaction (which is typically the outer business tx) so an outer
   * rollback rolls the counter back too — preserving gap-free semantics.
   */
  public async allocateNext(
    name: SequenceName,
    fiscalYear: string | null,
    tx: PrismaTx,
  ): Promise<{ readonly value: number; readonly raw: bigint }> {
    const { schoolId } = this.tenantContext();
    const fyKey = fiscalYear ?? '__none__';

    // Seed-or-touch the row. `id = id` is a no-op so an existing row's
    // last_value is untouched; concurrent inserts converge on the same row
    // because the (school_id, sequence_name, fiscal_year_key) computed-column
    // unique covers the keyspace.
    await tx.$executeRaw`
      INSERT INTO tenant_sequences (id, school_id, sequence_name, fiscal_year, last_value, updated_at)
      VALUES (UUID(), ${schoolId}, ${name}, ${fiscalYear}, 0, CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE id = id`;

    // Atomic increment-and-read. `LAST_INSERT_ID(expr)` sets the connection's
    // last-insert id to `expr` and returns it; the subsequent SELECT reads it
    // back. Because both statements run inside the same Prisma transaction (=
    // same MySQL connection), the read sees the value this transaction wrote.
    await tx.$executeRaw`
      UPDATE tenant_sequences
      SET last_value = LAST_INSERT_ID(last_value + 1), updated_at = CURRENT_TIMESTAMP(3)
      WHERE school_id = ${schoolId}
        AND sequence_name = ${name}
        AND COALESCE(fiscal_year, '__none__') = ${fyKey}`;

    const rows = await tx.$queryRaw<Array<{ v: bigint }>>`SELECT LAST_INSERT_ID() AS v`;
    const raw = rows[0]?.v ?? 0n;
    if (raw <= 0n) {
      // Should be unreachable — the UPDATE above guarantees a non-zero value.
      throw new Error(
        `TenantSequence allocation returned ${raw} for ${name} (fy=${fiscalYear ?? 'none'}) — corrupt row?`,
      );
    }
    if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SequenceExhaustedError({ sequenceName: name, fiscalYear, lastValue: raw });
    }
    return { value: Number(raw), raw };
  }

  private reader(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TenantSequenceRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  sequenceName: string;
  fiscalYear: string | null;
  lastValue: bigint;
  updatedAt: Date;
}): TenantSequenceRow {
  const last = row.lastValue;
  if (last > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SequenceExhaustedError({
      sequenceName: row.sequenceName,
      fiscalYear: row.fiscalYear,
      lastValue: last,
    });
  }
  return {
    id: row.id,
    schoolId: row.schoolId,
    sequenceName: row.sequenceName as TenantSequenceRow['sequenceName'],
    fiscalYear: row.fiscalYear,
    lastValue: Number(last),
    updatedAt: row.updatedAt,
  };
}

// Silence the unused-import warning when RawSequenceRow isn't referenced
// elsewhere — kept exported in case a future migration needs the snake-case
// shape for a hand-written query.
export type { RawSequenceRow };
