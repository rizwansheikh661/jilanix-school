/**
 * EventFeeAssignmentRepository — persistence for `event_fee_assignments`.
 *
 * Soft-delete + active-uniqueness via STORED `deleted_at_key` partial unique
 * on `(schoolId, eventId, participantId)`. One active assignment per
 * (event, participant).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { EventFeeAssignmentStatusValue } from '../events.constants';
import type { EventFeeAssignmentRow } from '../events.types';

export interface CreateEventFeeAssignmentInput {
  readonly eventId: string;
  readonly participantId: string;
  readonly studentId: string;
  readonly feeHeadId: string;
  readonly feeStructureId?: string | null;
  readonly amount: number;
}

export interface ListEventFeeAssignmentArgs {
  readonly eventId: string;
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: EventFeeAssignmentStatusValue;
}

@Injectable()
export class EventFeeAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventFeeAssignmentRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<EventFeeAssignmentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.eventFeeAssignment.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListEventFeeAssignmentArgs, tx?: PrismaTx): Promise<{
    readonly rows: readonly EventFeeAssignmentRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      eventId: args.eventId,
      deletedAt: null,
    };
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.eventFeeAssignment.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async listPendingForEvent(
    eventId: string,
    tx?: PrismaTx,
  ): Promise<readonly EventFeeAssignmentRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.eventFeeAssignment.findMany({
      where: { schoolId, eventId, status: 'PENDING', deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapRow);
  }

  public async create(
    input: CreateEventFeeAssignmentInput,
    tx?: PrismaTx,
  ): Promise<EventFeeAssignmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.eventFeeAssignment.create({
      data: {
        schoolId,
        eventId: input.eventId,
        participantId: input.participantId,
        studentId: input.studentId,
        feeHeadId: input.feeHeadId,
        feeStructureId: input.feeStructureId ?? null,
        amount: input.amount,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async markInvoiced(
    id: string,
    expectedVersion: number,
    feeInvoiceId: string,
    tx?: PrismaTx,
  ): Promise<EventFeeAssignmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.eventFeeAssignment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        status: 'INVOICED',
        feeInvoiceId,
        invoicedAt: new Date(),
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventFeeAssignment', id, expectedVersion);
    }
    const reloaded = await writer.eventFeeAssignment.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('EventFeeAssignment', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  public async voidOne(
    id: string,
    expectedVersion: number,
    reason: string | null,
    tx?: PrismaTx,
  ): Promise<EventFeeAssignmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.eventFeeAssignment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidedBy: userId ?? null,
        voidReason: reason,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventFeeAssignment', id, expectedVersion);
    }
    const reloaded = await writer.eventFeeAssignment.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('EventFeeAssignment', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  /**
   * Bulk-void every PENDING assignment for an event (used by event-cancel
   * cascade). INVOICED rows are NOT touched — admin must void the invoice
   * separately via the fees module. Returns the count of rows voided.
   */
  public async voidAllPendingForEvent(
    eventId: string,
    reason: string | null,
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.eventFeeAssignment.updateMany({
      where: { schoolId, eventId, status: 'PENDING', deletedAt: null },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidedBy: userId ?? null,
        voidReason: reason,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    return result.count;
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.eventFeeAssignment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventFeeAssignment', id, expectedVersion);
    }
  }
}

interface RawEventFeeAssignment {
  id: string;
  schoolId: string;
  eventId: string;
  participantId: string;
  studentId: string;
  feeHeadId: string;
  feeStructureId: string | null;
  amount: unknown;
  status: string;
  feeInvoiceId: string | null;
  invoicedAt: Date | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapRow(row: RawEventFeeAssignment): EventFeeAssignmentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    eventId: row.eventId,
    participantId: row.participantId,
    studentId: row.studentId,
    feeHeadId: row.feeHeadId,
    feeStructureId: row.feeStructureId,
    amount: toNumber(row.amount),
    status: row.status as EventFeeAssignmentRow['status'],
    feeInvoiceId: row.feeInvoiceId,
    invoicedAt: row.invoicedAt,
    voidedAt: row.voidedAt,
    voidedBy: row.voidedBy,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
