/**
 * TimetableConflictRepository — APPEND_ONLY ledger.
 *
 * Detector passes never UPDATE; each new scan inserts fresh rows. The
 * read path orders by `detectedAt DESC` so callers see the latest view.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { TimetableConflictTypeValue } from '../timetable.constants';
import type { TimetableConflictRow } from '../timetable.types';

export interface CreateTimetableConflictInput {
  readonly timetableVersionId: string;
  readonly type: TimetableConflictTypeValue;
  readonly contextJson: Readonly<Record<string, unknown>>;
  readonly entryAId: string;
  readonly entryBId: string | null;
}

export interface ListTimetableConflictArgs {
  readonly timetableVersionId?: string;
  readonly type?: TimetableConflictTypeValue;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class TimetableConflictRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TimetableConflictRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async create(
    input: CreateTimetableConflictInput,
    tx?: PrismaTx,
  ): Promise<TimetableConflictRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.timetableConflict.create({
      data: {
        schoolId,
        timetableVersionId: input.timetableVersionId,
        type: input.type,
        contextJson: input.contextJson as object,
        entryAId: input.entryAId,
        entryBId: input.entryBId,
        detectedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async createMany(
    inputs: readonly CreateTimetableConflictInput[],
    tx?: PrismaTx,
  ): Promise<readonly TimetableConflictRow[]> {
    const out: TimetableConflictRow[] = [];
    for (const input of inputs) {
      out.push(await this.create(input, tx));
    }
    return out;
  }

  public async list(
    args: ListTimetableConflictArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly TimetableConflictRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId };
    if (args.timetableVersionId !== undefined) where.timetableVersionId = args.timetableVersionId;
    if (args.type !== undefined) where.type = args.type;
    const rows = await reader.timetableConflict.findMany({
      where,
      orderBy: [{ detectedAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId = rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(map), nextCursorId };
  }
}

interface RawConflict {
  id: string;
  schoolId: string;
  timetableVersionId: string;
  type: TimetableConflictTypeValue;
  contextJson: unknown;
  entryAId: string;
  entryBId: string | null;
  detectedAt: Date;
  detectedBy: string | null;
}

function map(row: RawConflict): TimetableConflictRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    timetableVersionId: row.timetableVersionId,
    type: row.type,
    contextJson: (row.contextJson as Record<string, unknown>) ?? {},
    entryAId: row.entryAId,
    entryBId: row.entryBId,
    detectedAt: row.detectedAt,
    detectedBy: row.detectedBy,
  };
}
