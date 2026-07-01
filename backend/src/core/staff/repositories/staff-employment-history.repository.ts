/**
 * StaffEmploymentHistoryRepository — append-only event log of staff
 * lifecycle changes. StaffService writes here inside the same
 * transaction whenever a status / role / department transition occurs.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { EmploymentEventValue, StaffEmploymentHistoryRow } from '../staff.types';

export interface AppendEmploymentEventInput {
  readonly staffId: string;
  readonly event: EmploymentEventValue;
  readonly effectiveDate: Date;
  readonly fromValue?: string | null;
  readonly toValue?: string | null;
  readonly note?: string | null;
}

type Reader = PrismaTx;

@Injectable()
export class StaffEmploymentHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findByStaff(
    staffId: string,
    tx?: PrismaTx,
  ): Promise<readonly StaffEmploymentHistoryRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.staffEmploymentHistory.findMany({
      where: { schoolId, staffId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async append(
    input: AppendEmploymentEventInput,
    tx?: PrismaTx,
  ): Promise<StaffEmploymentHistoryRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.staffEmploymentHistory.create({
      data: {
        schoolId,
        staffId: input.staffId,
        event: input.event,
        effectiveDate: input.effectiveDate,
        fromValue: input.fromValue ?? null,
        toValue: input.toValue ?? null,
        note: input.note ?? null,
        actorId: ctx.userId ?? null,
        occurredAt: new Date(),
      },
    });
    return mapRow(row);
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error(
        'StaffEmploymentHistoryRepository requires a tenant-scoped RequestContext.',
      );
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  staffId: string;
  event: string;
  effectiveDate: Date;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  actorId: string | null;
  occurredAt: Date;
}

function mapRow(row: RawRow): StaffEmploymentHistoryRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    event: row.event as EmploymentEventValue,
    effectiveDate: row.effectiveDate,
    fromValue: row.fromValue,
    toValue: row.toValue,
    note: row.note,
    actorId: row.actorId,
    occurredAt: row.occurredAt,
  };
}
