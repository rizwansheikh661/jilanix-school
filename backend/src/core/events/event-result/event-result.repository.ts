/**
 * EventResultRepository — persistence for `event_results`.
 *
 * Soft-delete; no active-uniqueness index (a participant may receive
 * multiple result rows over time, though convention is one per event).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { EventResultPositionValue } from '../events.constants';
import type { EventResultRow } from '../events.types';

export interface CreateEventResultInput {
  readonly eventId: string;
  readonly participantId: string;
  readonly rank?: number | null;
  readonly position: EventResultPositionValue;
  readonly score?: number | null;
  readonly remark?: string | null;
  readonly awardedAt?: Date | null;
}

export interface UpdateEventResultInput {
  readonly rank?: number | null;
  readonly position?: EventResultPositionValue;
  readonly score?: number | null;
  readonly remark?: string | null;
  readonly awardedAt?: Date | null;
}

export interface ListEventResultArgs {
  readonly eventId: string;
  readonly limit: number;
  readonly cursorId?: string;
  readonly position?: EventResultPositionValue;
  readonly participantId?: string;
}

@Injectable()
export class EventResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventResultRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<EventResultRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.eventResult.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListEventResultArgs, tx?: PrismaTx): Promise<{
    readonly rows: readonly EventResultRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      eventId: args.eventId,
      deletedAt: null,
    };
    if (args.position !== undefined) where.position = args.position;
    if (args.participantId !== undefined) where.participantId = args.participantId;
    const rows = await reader.eventResult.findMany({
      where,
      orderBy: [{ position: 'asc' }, { rank: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async create(
    input: CreateEventResultInput,
    tx?: PrismaTx,
  ): Promise<EventResultRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.eventResult.create({
      data: {
        schoolId,
        eventId: input.eventId,
        participantId: input.participantId,
        rank: input.rank ?? null,
        position: input.position,
        score: input.score ?? null,
        remark: input.remark ?? null,
        awardedAt: input.awardedAt ?? new Date(),
        awardedBy: userId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateEventResultInput,
    tx?: PrismaTx,
  ): Promise<EventResultRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.rank !== undefined) data.rank = input.rank;
    if (input.position !== undefined) data.position = input.position;
    if (input.score !== undefined) data.score = input.score;
    if (input.remark !== undefined) data.remark = input.remark;
    if (input.awardedAt !== undefined) data.awardedAt = input.awardedAt;
    const result = await writer.eventResult.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventResult', id, expectedVersion);
    }
    const reloaded = await writer.eventResult.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('EventResult', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.eventResult.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventResult', id, expectedVersion);
    }
  }
}

interface RawEventResult {
  id: string;
  schoolId: string;
  eventId: string;
  participantId: string;
  rank: number | null;
  position: string;
  score: unknown | null;
  remark: string | null;
  awardedAt: Date | null;
  awardedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapRow(row: RawEventResult): EventResultRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    eventId: row.eventId,
    participantId: row.participantId,
    rank: row.rank,
    position: row.position as EventResultRow['position'],
    score: toNumber(row.score),
    remark: row.remark,
    awardedAt: row.awardedAt,
    awardedBy: row.awardedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
