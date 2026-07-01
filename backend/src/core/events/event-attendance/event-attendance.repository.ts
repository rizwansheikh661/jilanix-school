/**
 * EventAttendanceRepository — append-only ledger persistence.
 *
 * APPEND_ONLY_MODELS classification — rows are insert-only; "current status"
 * for a participant is the latest row by `occurredAt` (then `id`).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  EventAttendanceMethodValue,
  EventAttendanceStatusValue,
} from '../events.constants';
import type { EventAttendanceRow } from '../events.types';

export interface AppendAttendanceInput {
  readonly eventId: string;
  readonly participantId: string;
  readonly status: EventAttendanceStatusValue;
  readonly method: EventAttendanceMethodValue;
  readonly occurredAt?: Date;
  readonly deviceRef?: string | null;
  readonly notes?: string | null;
}

export interface ListAttendanceArgs {
  readonly eventId: string;
  readonly limit: number;
  readonly cursorId?: string;
  readonly participantId?: string;
  readonly status?: EventAttendanceStatusValue;
}

@Injectable()
export class EventAttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventAttendanceRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async append(
    input: AppendAttendanceInput,
    tx?: PrismaTx,
  ): Promise<EventAttendanceRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.eventAttendance.create({
      data: {
        schoolId,
        eventId: input.eventId,
        participantId: input.participantId,
        status: input.status,
        method: input.method,
        occurredAt: input.occurredAt ?? new Date(),
        markedBy: userId ?? null,
        deviceRef: input.deviceRef ?? null,
        notes: input.notes ?? null,
        createdBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async list(
    args: ListAttendanceArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly EventAttendanceRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, eventId: args.eventId };
    if (args.participantId !== undefined) where.participantId = args.participantId;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.eventAttendance.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  /**
   * Aggregate "latest-row-wins" status per participant for an event.
   * Returns a map of participantId → latest row.
   */
  public async latestPerParticipant(
    eventId: string,
    tx?: PrismaTx,
  ): Promise<ReadonlyMap<string, EventAttendanceRow>> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.eventAttendance.findMany({
      where: { schoolId, eventId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const seen = new Map<string, EventAttendanceRow>();
    for (const row of rows) {
      if (!seen.has(row.participantId)) {
        seen.set(row.participantId, mapRow(row));
      }
    }
    return seen;
  }

  /**
   * Latest row for a single participant (or null if no ledger entries).
   */
  public async latestForParticipant(
    eventId: string,
    participantId: string,
    tx?: PrismaTx,
  ): Promise<EventAttendanceRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.eventAttendance.findFirst({
      where: { schoolId, eventId, participantId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    return row === null ? null : mapRow(row);
  }
}

interface RawEventAttendance {
  id: string;
  schoolId: string;
  eventId: string;
  participantId: string;
  status: string;
  method: string;
  occurredAt: Date;
  markedBy: string | null;
  deviceRef: string | null;
  notes: string | null;
  createdAt: Date;
  createdBy: string | null;
}

function mapRow(row: RawEventAttendance): EventAttendanceRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    eventId: row.eventId,
    participantId: row.participantId,
    status: row.status as EventAttendanceRow['status'],
    method: row.method as EventAttendanceRow['method'],
    occurredAt: row.occurredAt,
    markedBy: row.markedBy,
    deviceRef: row.deviceRef,
    notes: row.notes,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}
